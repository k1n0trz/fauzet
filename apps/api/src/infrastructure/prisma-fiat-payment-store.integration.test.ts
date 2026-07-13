import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDatabase } from "@fauzet/database";
import { FIAT_CHECKOUT_TERMS_VERSION } from "../domain/fiat-catalog.js";
import type { ProviderPayment } from "../domain/fiat-payments.js";
import { PrismaFiatPaymentStore } from "./prisma-fiat-payment-store.js";

const integration = process.env.RUN_INTEGRATION === "true";
const SELLER_USER_ID = "123456789";
const APPLICATION_ID = "987654321";

describe.runIf(integration)("persistent fiat payment invariants", () => {
  const database = getDatabase();
  const store = new PrismaFiatPaymentStore(database);
  const runId = crypto.randomUUID();
  const userIds: string[] = [];
  const webhookIds: string[] = [];
  let productId = "";

  beforeAll(async () => {
    const config = await database.economicConfigVersion.findFirstOrThrow({
      where: { status: "ACTIVE" },
      orderBy: { id: "desc" },
    });
    const product = await database.fiatProductVersion.create({
      data: {
        sku: `INTEGRATION_MP_${runId.replaceAll("-", "").toUpperCase()}`,
        version: 1,
        displayOrder: 90_000,
        status: "ACTIVE",
        kind: "BOOST",
        name: "Mercado Pago integration boost",
        description: "Database-only payment integration fixture",
        content: { integration: true },
        currency: "COP",
        unitAmountMinor: "3900",
        durationSeconds: 3_600,
        effectType: "MINING_HASH_BOOST",
        effectConfig: { hashBonusBps: 100, integration: true },
        ruleVersion: config.id,
        refundPolicyVersion: `integration-refund-${runId}`,
        refundWindowBusinessDays: 5,
        publishedAt: new Date("2026-07-14T00:00:00.000Z"),
      },
    });
    productId = product.id;
  });

  afterAll(async () => {
    if (userIds.length > 0) {
      const orders = await database.paymentOrder.findMany({
        where: { userId: { in: userIds } },
        select: { id: true },
      });
      const orderIds = orders.map(({ id }) => id);
      await database.$transaction(async (tx) => {
        await tx.paymentOrder.updateMany({
          where: { id: { in: orderIds } },
          data: {
            status: "CANCELLED",
            paidAttemptId: null,
            cancelledAt: new Date(),
          },
        });
        await tx.paymentRefund.deleteMany({
          where: { orderId: { in: orderIds } },
        });
        await tx.entitlement.deleteMany({
          where: { orderId: { in: orderIds } },
        });
        await tx.paymentWebhookInbox.deleteMany({
          where: {
            OR: [{ id: { in: webhookIds } }, { orderId: { in: orderIds } }],
          },
        });
        await tx.paymentAttempt.deleteMany({
          where: { orderId: { in: orderIds } },
        });
        await tx.paymentOrder.deleteMany({
          where: { id: { in: orderIds } },
        });
        await tx.user.deleteMany({ where: { id: { in: userIds } } });
      });
    }
    if (productId) {
      await database.fiatProductVersion.delete({ where: { id: productId } });
    }
    await database.$disconnect();
  });

  it("replays one checkout without duplicating its order or attempt", async () => {
    const userId = await createUser("checkout");
    const now = new Date("2026-07-14T12:00:00.000Z");
    const input = checkoutInput(userId, "idempotent", now, "lease-first");

    const first = await store.reserveCheckout(input);
    const inFlightReplay = await store.reserveCheckout({
      ...input,
      leaseToken: "lease-second",
      now: new Date(now.getTime() + 1),
    });

    expect(first).toMatchObject({ replayed: false, leaseToken: "lease-first" });
    expect(inFlightReplay).toMatchObject({
      replayed: true,
      leaseToken: null,
      order: { id: first.order.id },
    });

    const preference = preferenceFor(first.order.id, "idempotent", now);
    await store.completeCheckout({
      orderId: first.order.id,
      attemptId: first.attemptId,
      leaseToken: "lease-first",
      preference,
      now,
    });
    const completedReplay = await store.reserveCheckout({
      ...input,
      leaseToken: "lease-third",
      now: new Date(now.getTime() + 2),
    });

    expect(completedReplay).toMatchObject({
      replayed: true,
      leaseToken: null,
      order: {
        id: first.order.id,
        checkout: { preferenceId: preference.id },
      },
    });
    await expect(
      database.paymentOrder.count({
        where: { idempotencyKey: input.idempotencyKey },
      }),
    ).resolves.toBe(1);
    await expect(
      database.paymentAttempt.count({ where: { orderId: first.order.id } }),
    ).resolves.toBe(1);
  });

  it("replays a signed webhook without replacing its original unsigned payload", async () => {
    const now = new Date("2026-07-14T12:30:00.000Z");
    const payment = paymentFor(
      crypto.randomUUID(),
      `preference-webhook-replay-${runId}`,
      now,
    );
    const original = webhookInput(payment, "payload-replay", now);
    const first = await store.recordWebhook(original);
    webhookIds.push(first.id);

    const replay = await store.recordWebhook({
      ...original,
      providerEventId: `event-payload-replay-changed-${runId}`,
      payloadHash: `payload-replay-changed-${runId}`,
      payload: {
        type: "payment",
        action: "payment.updated",
        data: { id: payment.id },
      },
    });

    expect(replay).toMatchObject({
      id: first.id,
      providerObjectId: payment.id,
      replayed: true,
    });
    await expect(
      database.paymentWebhookInbox.findUniqueOrThrow({
        where: { id: first.id },
        select: {
          providerEventId: true,
          providerObjectId: true,
          payloadHash: true,
          payload: true,
        },
      }),
    ).resolves.toEqual({
      providerEventId: original.providerEventId,
      providerObjectId: payment.id,
      payloadHash: original.payloadHash,
      payload: original.payload,
    });
  });

  it("fulfills one entitlement for an approved payment across webhook replays", async () => {
    const userId = await createUser("approved");
    const now = new Date("2026-07-14T13:00:00.000Z");
    const checkout = await preparedCheckout(userId, "approved", now);
    const payment = paymentFor(checkout.order.id, checkout.preferenceId, now);
    const firstWebhook = await recordAndClaimWebhook(
      payment,
      "approved-first",
      now,
    );

    await expect(
      store.applyPayment(paymentInput(firstWebhook.id, payment, now)),
    ).resolves.toMatchObject({
      orderId: checkout.order.id,
      fulfilled: true,
      orderStatus: "PAID",
    });

    const exactReplay = await store.recordWebhook(
      webhookInput(payment, "approved-first", now),
    );
    webhookIds.push(exactReplay.id);
    expect(exactReplay).toMatchObject({ id: firstWebhook.id, replayed: true });
    await expect(
      store.applyPayment(paymentInput(exactReplay.id, payment, now)),
    ).resolves.toMatchObject({ fulfilled: false });

    const secondWebhook = await recordAndClaimWebhook(
      payment,
      "approved-second",
      new Date(now.getTime() + 1_000),
    );
    await expect(
      store.applyPayment(
        paymentInput(
          secondWebhook.id,
          { ...payment, providerUpdatedAt: new Date(now.getTime() + 1_000) },
          new Date(now.getTime() + 1_000),
        ),
      ),
    ).resolves.toMatchObject({
      orderId: checkout.order.id,
      fulfilled: false,
      orderStatus: "PAID",
    });

    await expect(
      database.entitlement.count({ where: { orderId: checkout.order.id } }),
    ).resolves.toBe(1);
    await expect(
      database.paymentOrder.findUniqueOrThrow({
        where: { id: checkout.order.id },
        select: { status: true, paidAttemptId: true },
      }),
    ).resolves.toMatchObject({
      status: "PAID",
      paidAttemptId: checkout.attemptId,
    });
  });

  it("disputes an order and revokes its entitlement for a second valid approved payment", async () => {
    const userId = await createUser("duplicate-approved");
    const now = new Date("2026-07-14T13:30:00.000Z");
    const checkout = await preparedCheckout(userId, "duplicate-approved", now);
    const firstPayment = paymentFor(
      checkout.order.id,
      checkout.preferenceId,
      now,
    );
    const firstWebhook = await recordAndClaimWebhook(
      firstPayment,
      "duplicate-approved-first",
      now,
    );
    await expect(
      store.applyPayment(paymentInput(firstWebhook.id, firstPayment, now)),
    ).resolves.toMatchObject({
      orderId: checkout.order.id,
      fulfilled: true,
      orderStatus: "PAID",
    });

    const secondNow = new Date(now.getTime() + 1_000);
    const secondPreferenceId = `preference-duplicate-approved-second-${runId}`;
    const secondAttempt = await database.paymentAttempt.create({
      data: {
        orderId: checkout.order.id,
        attemptNo: 2,
        provider: "MERCADOPAGO",
        environment: "TEST",
        providerIdempotencyKey: `integration-duplicate-approved-${runId}`,
        providerCheckoutId: secondPreferenceId,
        status: "CHECKOUT_READY",
        checkoutUrl: `https://sandbox.mercadopago.com/checkout/v1/redirect?pref_id=duplicate-${runId}`,
        expiresAt: new Date(secondNow.getTime() + 30 * 60_000),
      },
    });
    const secondPayment = paymentFor(
      checkout.order.id,
      secondPreferenceId,
      secondNow,
    );
    const secondWebhook = await recordAndClaimWebhook(
      secondPayment,
      "duplicate-approved-second",
      secondNow,
    );

    await expect(
      store.applyPayment(
        paymentInput(secondWebhook.id, secondPayment, secondNow),
      ),
    ).resolves.toMatchObject({
      orderId: checkout.order.id,
      fulfilled: false,
      orderStatus: "DISPUTED",
    });
    await expect(
      database.paymentOrder.findUniqueOrThrow({
        where: { id: checkout.order.id },
        select: { status: true, paidAttemptId: true },
      }),
    ).resolves.toEqual({
      status: "DISPUTED",
      paidAttemptId: checkout.attemptId,
    });
    await expect(
      database.entitlement.findUniqueOrThrow({
        where: { orderId: checkout.order.id },
        select: { status: true },
      }),
    ).resolves.toEqual({ status: "REVOKED" });
    await expect(
      database.entitlement.count({ where: { orderId: checkout.order.id } }),
    ).resolves.toBe(1);
    await expect(
      database.paymentAttempt.findUniqueOrThrow({
        where: { id: secondAttempt.id },
        select: { status: true },
      }),
    ).resolves.toEqual({ status: "HELD" });
  });

  it("holds a fully refunded payment observed before fulfillment", async () => {
    const userId = await createUser("refunded-before-fulfillment");
    const now = new Date("2026-07-14T13:45:00.000Z");
    const checkout = await preparedCheckout(
      userId,
      "refunded-before-fulfillment",
      now,
    );
    const payment = {
      ...paymentFor(checkout.order.id, checkout.preferenceId, now),
      status: "refunded",
      statusDetail: "refunded",
      refundedAmountMinor: 3_900n,
    };
    const webhook = await recordAndClaimWebhook(
      payment,
      "refunded-before-fulfillment",
      now,
    );

    await expect(
      store.applyPayment(paymentInput(webhook.id, payment, now)),
    ).resolves.toMatchObject({
      orderId: checkout.order.id,
      fulfilled: false,
      orderStatus: "HELD",
    });
    await expect(
      database.paymentOrder.findUniqueOrThrow({
        where: { id: checkout.order.id },
        select: { status: true, paidAttemptId: true },
      }),
    ).resolves.toEqual({ status: "HELD", paidAttemptId: null });
    await expect(
      database.paymentAttempt.findUniqueOrThrow({
        where: { id: checkout.attemptId },
        select: { status: true },
      }),
    ).resolves.toEqual({ status: "REFUNDED" });
    await expect(
      database.entitlement.count({ where: { orderId: checkout.order.id } }),
    ).resolves.toBe(0);
  });

  it("finalizes a refund-pending paid order and keeps later provider events terminal-safe", async () => {
    const userId = await createUser("refund-pending-terminal");
    const approvedAt = new Date("2026-07-14T13:50:00.000Z");
    const fixture = await approvedPaymentFixture(
      userId,
      "refund-pending-terminal",
      approvedAt,
    );
    const refundPendingAt = new Date(approvedAt.getTime() + 1_000);

    await database.$transaction(async (tx) => {
      await tx.paymentOrder.update({
        where: { id: fixture.order.id },
        data: { status: "REFUND_PENDING", refundPendingAt },
      });
      await tx.entitlement.update({
        where: { orderId: fixture.order.id },
        data: { status: "REFUND_PENDING", refundPendingAt },
      });
    });

    const refundedAt = new Date(refundPendingAt.getTime() + 1_000);
    const refundedPayment: ProviderPayment = {
      ...fixture.payment,
      status: "refunded",
      statusDetail: "refunded",
      refundedAmountMinor: fixture.payment.amountMinor,
      providerUpdatedAt: refundedAt,
      evidenceHash: `payment-evidence-refunded-${runId}`,
    };
    const refundWebhook = await recordAndClaimWebhook(
      refundedPayment,
      "refund-pending-terminal-refunded",
      refundedAt,
    );

    await expect(
      store.applyPayment(
        paymentInput(refundWebhook.id, refundedPayment, refundedAt),
      ),
    ).resolves.toMatchObject({
      orderId: fixture.order.id,
      fulfilled: false,
      orderStatus: "REFUNDED",
    });
    await expect(
      database.paymentOrder.findUniqueOrThrow({
        where: { id: fixture.order.id },
        select: { status: true, paidAttemptId: true, refundedAt: true },
      }),
    ).resolves.toMatchObject({
      status: "REFUNDED",
      paidAttemptId: fixture.attemptId,
      refundedAt,
    });
    await expect(
      database.paymentAttempt.findUniqueOrThrow({
        where: { id: fixture.attemptId },
        select: { status: true },
      }),
    ).resolves.toEqual({ status: "REFUNDED" });
    await expect(
      database.entitlement.findUniqueOrThrow({
        where: { orderId: fixture.order.id },
        select: { status: true, refundedAt: true, revokedAt: true },
      }),
    ).resolves.toEqual({
      status: "REFUNDED",
      refundedAt,
      revokedAt: null,
    });

    const laterAt = new Date(refundedAt.getTime() + 1_000);
    const laterApproval: ProviderPayment = {
      ...fixture.payment,
      providerUpdatedAt: laterAt,
      evidenceHash: `payment-evidence-late-approval-${runId}`,
    };
    const laterWebhook = await recordAndClaimWebhook(
      laterApproval,
      "refund-pending-terminal-later-approval",
      laterAt,
    );

    await expect(
      store.applyPayment(paymentInput(laterWebhook.id, laterApproval, laterAt)),
    ).resolves.toMatchObject({
      orderId: fixture.order.id,
      fulfilled: false,
      orderStatus: "REFUNDED",
    });
    await expect(
      database.paymentAttempt.findUniqueOrThrow({
        where: { id: fixture.attemptId },
        select: { status: true },
      }),
    ).resolves.toEqual({ status: "REFUNDED" });
  });

  it.each([
    {
      label: "paid-mismatch-review",
      reviewReason: "PAYMENT_MISMATCH",
      payment: (approved: ProviderPayment, observedAt: Date) => ({
        ...approved,
        collectorId: "wrong-seller-after-approval",
        providerUpdatedAt: observedAt,
        evidenceHash: `payment-evidence-mismatch-review-${runId}`,
      }),
    },
    {
      label: "paid-partial-refund-review",
      reviewReason: "PARTIAL_REFUND",
      payment: (approved: ProviderPayment, observedAt: Date) => ({
        ...approved,
        refundedAmountMinor: 1_000n,
        providerUpdatedAt: observedAt,
        evidenceHash: `payment-evidence-partial-refund-review-${runId}`,
      }),
    },
  ])(
    "preserves the original approval evidence during $reviewReason",
    async ({ label, reviewReason, payment: reviewedPayment }) => {
      const userId = await createUser(label);
      const approvedAt = new Date(
        reviewReason === "PAYMENT_MISMATCH"
          ? "2026-07-14T13:55:00.000Z"
          : "2026-07-14T13:56:00.000Z",
      );
      const fixture = await approvedPaymentFixture(userId, label, approvedAt);
      const approvalAttempt = await database.paymentAttempt.findUniqueOrThrow({
        where: { id: fixture.attemptId },
        select: {
          status: true,
          providerPaymentId: true,
          observedAmountMinor: true,
          observedCurrency: true,
          approvedAt: true,
          verificationEvidence: true,
        },
      });
      const approvalEvidence = approvalAttempt.verificationEvidence as Record<
        string,
        unknown
      >;
      const originalEvidenceHash = approvalEvidence.paymentEvidenceHash;
      const observedAt = new Date(approvedAt.getTime() + 1_000);
      const reviewPayment = reviewedPayment(fixture.payment, observedAt);
      const webhook = await recordAndClaimWebhook(
        reviewPayment,
        label,
        observedAt,
      );

      await expect(
        store.applyPayment(paymentInput(webhook.id, reviewPayment, observedAt)),
      ).resolves.toMatchObject({
        orderId: fixture.order.id,
        fulfilled: false,
        orderStatus: "DISPUTED",
      });

      const reviewedAttempt = await database.paymentAttempt.findUniqueOrThrow({
        where: { id: fixture.attemptId },
        select: {
          status: true,
          providerPaymentId: true,
          observedAmountMinor: true,
          observedCurrency: true,
          approvedAt: true,
          verificationEvidence: true,
        },
      });
      expect(reviewedAttempt).toMatchObject({
        status: approvalAttempt.status,
        providerPaymentId: approvalAttempt.providerPaymentId,
        observedAmountMinor: approvalAttempt.observedAmountMinor,
        observedCurrency: approvalAttempt.observedCurrency,
        approvedAt: approvalAttempt.approvedAt,
      });
      const reviewedEvidence = reviewedAttempt.verificationEvidence as Record<
        string,
        unknown
      >;
      expect(reviewedEvidence).toMatchObject({
        paymentEvidenceHash: originalEvidenceHash,
        approvalEvidence: expect.objectContaining({
          paymentEvidenceHash: originalEvidenceHash,
        }),
        latestReviewEvidence: expect.objectContaining({ reviewReason }),
        reviewHistory: expect.arrayContaining([
          expect.objectContaining({ reviewReason }),
        ]),
      });
    },
  );

  it("does not regress a disputed paid attempt when a later approval arrives", async () => {
    const userId = await createUser("disputed-terminal-later-approval");
    const approvedAt = new Date("2026-07-14T13:58:00.000Z");
    const fixture = await approvedPaymentFixture(
      userId,
      "disputed-terminal-later-approval",
      approvedAt,
    );
    const partialRefundAt = new Date(approvedAt.getTime() + 1_000);
    const partialRefund: ProviderPayment = {
      ...fixture.payment,
      refundedAmountMinor: 1_000n,
      providerUpdatedAt: partialRefundAt,
      evidenceHash: `payment-evidence-disputed-${runId}`,
    };
    const partialWebhook = await recordAndClaimWebhook(
      partialRefund,
      "disputed-terminal-partial-refund",
      partialRefundAt,
    );
    await expect(
      store.applyPayment(
        paymentInput(partialWebhook.id, partialRefund, partialRefundAt),
      ),
    ).resolves.toMatchObject({ orderStatus: "DISPUTED" });

    const laterAt = new Date(partialRefundAt.getTime() + 1_000);
    const laterApproval: ProviderPayment = {
      ...fixture.payment,
      providerUpdatedAt: laterAt,
      evidenceHash: `payment-evidence-disputed-late-approval-${runId}`,
    };
    const laterWebhook = await recordAndClaimWebhook(
      laterApproval,
      "disputed-terminal-later-approval",
      laterAt,
    );

    await expect(
      store.applyPayment(paymentInput(laterWebhook.id, laterApproval, laterAt)),
    ).resolves.toMatchObject({
      orderId: fixture.order.id,
      fulfilled: false,
      orderStatus: "DISPUTED",
    });
    await expect(
      database.paymentOrder.findUniqueOrThrow({
        where: { id: fixture.order.id },
        select: { status: true, paidAttemptId: true },
      }),
    ).resolves.toEqual({
      status: "DISPUTED",
      paidAttemptId: fixture.attemptId,
    });
    await expect(
      database.paymentAttempt.findUniqueOrThrow({
        where: { id: fixture.attemptId },
        select: { status: true },
      }),
    ).resolves.toEqual({ status: "APPROVED" });
    await expect(
      database.entitlement.findUniqueOrThrow({
        where: { orderId: fixture.order.id },
        select: { status: true },
      }),
    ).resolves.toEqual({ status: "REVOKED" });
  });

  it("persists throttling and holds a checkout after a terminal reconciliation failure", async () => {
    const userId = await createUser("terminal-reconciliation-failure");
    const checkoutAt = new Date("2026-07-14T14:05:00.000Z");
    const checkout = await preparedCheckout(
      userId,
      "terminal-reconciliation-failure",
      checkoutAt,
    );
    const failureAt = new Date(checkoutAt.getTime() + 1_000);

    await store.failOrderReconciliation({
      orderId: checkout.order.id,
      now: failureAt,
      reasonCode: "MP_RESPONSE_INVALID",
      terminal: true,
    });

    await expect(
      database.paymentOrder.findUniqueOrThrow({
        where: { id: checkout.order.id },
        select: { status: true },
      }),
    ).resolves.toEqual({ status: "HELD" });
    await expect(
      database.paymentAttempt.findUniqueOrThrow({
        where: { id: checkout.attemptId },
        select: {
          status: true,
          providerStatusDetail: true,
          lastProviderSyncAt: true,
        },
      }),
    ).resolves.toEqual({
      status: "HELD",
      providerStatusDetail: "MP_RESPONSE_INVALID",
      lastProviderSyncAt: failureAt,
    });

    const candidates = await store.orderReconciliationCandidates({
      now: failureAt,
      staleBefore: new Date(failureAt.getTime() - 60_000),
      expiredAfter: new Date(failureAt.getTime() - 7 * 24 * 60 * 60_000),
      limit: 200,
    });
    expect(candidates.some(({ id }) => id === checkout.order.id)).toBe(false);
  });

  it.each([
    {
      label: "retryable-http-reconciliation-failure",
      reasonCode: "MP_HTTP_503",
      checkoutAt: "2026-07-14T14:10:00.000Z",
    },
    {
      label: "configuration-reconciliation-failure",
      reasonCode: "FIAT_PROVIDER_NOT_CONFIGURED",
      checkoutAt: "2026-07-14T14:11:00.000Z",
    },
  ])(
    "persists throttling without holding an order for $reasonCode",
    async ({ label, reasonCode, checkoutAt: checkoutIso }) => {
      const userId = await createUser(label);
      const checkoutAt = new Date(checkoutIso);
      const checkout = await preparedCheckout(userId, label, checkoutAt);
      const failureAt = new Date(checkoutAt.getTime() + 1_000);

      await store.failOrderReconciliation({
        orderId: checkout.order.id,
        now: failureAt,
        reasonCode,
        terminal: false,
      });

      await expect(
        database.paymentOrder.findUniqueOrThrow({
          where: { id: checkout.order.id },
          select: { status: true },
        }),
      ).resolves.toEqual({ status: "CHECKOUT_READY" });
      await expect(
        database.paymentAttempt.findUniqueOrThrow({
          where: { id: checkout.attemptId },
          select: {
            status: true,
            providerStatusDetail: true,
            lastProviderSyncAt: true,
          },
        }),
      ).resolves.toEqual({
        status: "CHECKOUT_READY",
        providerStatusDetail: reasonCode,
        lastProviderSyncAt: failureAt,
      });

      const candidates = await store.orderReconciliationCandidates({
        now: failureAt,
        staleBefore: new Date(failureAt.getTime() - 60_000),
        expiredAfter: new Date(failureAt.getTime() - 7 * 24 * 60 * 60_000),
        limit: 200,
      });
      expect(candidates.some(({ id }) => id === checkout.order.id)).toBe(false);
    },
  );

  it("does not select expired orders outside the reconciliation grace window", async () => {
    const userId = await createUser("expired-outside-grace");
    const checkoutAt = new Date("2026-07-01T14:15:00.000Z");
    const checkout = await preparedCheckout(
      userId,
      "expired-outside-grace",
      checkoutAt,
    );
    const reconciliationNow = new Date("2026-07-14T14:15:00.000Z");
    const expiredAfter = new Date(
      reconciliationNow.getTime() - 7 * 24 * 60 * 60_000,
    );
    const expiredAt = new Date(expiredAfter.getTime() - 1);
    await database.paymentOrder.update({
      where: { id: checkout.order.id },
      data: {
        status: "EXPIRED",
        checkoutExpiresAt: expiredAt,
        expiredAt,
      },
    });

    const candidates = await store.orderReconciliationCandidates({
      now: reconciliationNow,
      staleBefore: new Date(reconciliationNow.getTime() - 60_000),
      expiredAfter,
      limit: 200,
    });

    expect(candidates.some(({ id }) => id === checkout.order.id)).toBe(false);
  });

  it("holds a seller-mismatched payment without creating an entitlement", async () => {
    const userId = await createUser("seller-mismatch");
    const now = new Date("2026-07-14T14:00:00.000Z");
    const checkout = await preparedCheckout(userId, "seller-mismatch", now);
    const payment = {
      ...paymentFor(checkout.order.id, checkout.preferenceId, now),
      collectorId: "wrong-seller",
    };
    const webhook = await recordAndClaimWebhook(
      payment,
      "seller-mismatch",
      now,
    );

    await expect(
      store.applyPayment(paymentInput(webhook.id, payment, now)),
    ).resolves.toMatchObject({
      orderId: checkout.order.id,
      fulfilled: false,
      orderStatus: "HELD",
    });
    await expect(
      database.paymentOrder.findUniqueOrThrow({
        where: { id: checkout.order.id },
        select: { status: true, paidAttemptId: true },
      }),
    ).resolves.toEqual({ status: "HELD", paidAttemptId: null });
    await expect(
      database.paymentAttempt.findUniqueOrThrow({
        where: { id: checkout.attemptId },
        select: { status: true },
      }),
    ).resolves.toEqual({ status: "HELD" });
    await expect(
      database.entitlement.count({ where: { orderId: checkout.order.id } }),
    ).resolves.toBe(0);
    await expect(
      database.paymentWebhookInbox.findUniqueOrThrow({
        where: { id: webhook.id },
        select: { status: true, lastErrorCode: true },
      }),
    ).resolves.toEqual({
      status: "PROCESSED",
      lastErrorCode: "PAYMENT_MISMATCH_SELLER",
    });
  });

  async function createUser(label: string) {
    const id = crypto.randomUUID();
    const now = new Date("2026-07-14T00:00:00.000Z");
    const user = await database.user.create({
      data: {
        id,
        email: `fiat-${label}-${runId}@fauzet.local`,
        passwordHash: "integration-only",
        displayName: `Fiat ${label}`,
        status: "ACTIVE",
        emailVerifiedAt: now,
        acceptedTermsAt: now,
        adultDeclaredAt: now,
      },
    });
    userIds.push(user.id);
    return user.id;
  }

  function checkoutInput(
    userId: string,
    label: string,
    now: Date,
    leaseToken: string,
  ) {
    return {
      userId,
      productVersionId: productId,
      idempotencyKey: `integration-checkout-${label}-${runId}`,
      requestHash: `integration-request-${label}-${runId}`,
      termsVersion: FIAT_CHECKOUT_TERMS_VERSION,
      refundPolicyVersion: `integration-refund-${runId}`,
      leaseToken,
      now,
      leaseTimeoutMs: 60_000,
    };
  }

  async function preparedCheckout(userId: string, label: string, now: Date) {
    const reserved = await store.reserveCheckout(
      checkoutInput(userId, label, now, `lease-${label}-${runId}`),
    );
    const preference = preferenceFor(reserved.order.id, label, now);
    const order = await store.completeCheckout({
      orderId: reserved.order.id,
      attemptId: reserved.attemptId,
      leaseToken: reserved.leaseToken!,
      preference,
      now,
    });
    return {
      order,
      attemptId: reserved.attemptId,
      preferenceId: preference.id,
    };
  }

  async function approvedPaymentFixture(
    userId: string,
    label: string,
    now: Date,
  ) {
    const checkout = await preparedCheckout(userId, label, now);
    const payment = paymentFor(checkout.order.id, checkout.preferenceId, now);
    const webhook = await recordAndClaimWebhook(
      payment,
      `${label}-approved`,
      now,
    );
    await expect(
      store.applyPayment(paymentInput(webhook.id, payment, now)),
    ).resolves.toMatchObject({
      orderId: checkout.order.id,
      fulfilled: true,
      orderStatus: "PAID",
    });
    return { ...checkout, payment };
  }

  function preferenceFor(orderId: string, label: string, now: Date) {
    return {
      id: `preference-${label}-${runId}`,
      externalReference: orderId,
      collectorId: SELLER_USER_ID,
      currency: "COP" as const,
      amountMinor: 3_900n,
      checkoutUrl: `https://sandbox.mercadopago.com/checkout/v1/redirect?pref_id=${label}-${runId}`,
      expiresAt: new Date(now.getTime() + 30 * 60_000),
      evidenceHash: `preference-evidence-${label}-${runId}`,
    };
  }

  function paymentFor(
    orderId: string,
    preferenceId: string,
    now: Date,
  ): ProviderPayment {
    return {
      id: `${now.getTime()}${runId.replaceAll("-", "").slice(0, 8)}`,
      externalReference: orderId,
      collectorId: SELLER_USER_ID,
      applicationId: APPLICATION_ID,
      liveMode: false,
      currency: "COP",
      amountMinor: 3_900n,
      refundedAmountMinor: 0n,
      status: "approved",
      statusDetail: "accredited",
      preferenceId,
      merchantOrderId: `merchant-order-${orderId}`,
      approvedAt: now,
      providerUpdatedAt: now,
      evidenceHash: `payment-evidence-${orderId}`,
    };
  }

  function webhookInput(payment: ProviderPayment, label: string, now: Date) {
    return {
      dedupeKey: `integration-webhook-${label}-${runId}`,
      providerEventId: `event-${label}-${runId}`,
      providerObjectId: payment.id,
      payloadHash: `payload-${label}-${runId}`,
      payload: { type: "payment", data: { id: payment.id } },
      signatureVerifiedAt: now,
    };
  }

  async function recordAndClaimWebhook(
    payment: ProviderPayment,
    label: string,
    now: Date,
  ) {
    const webhook = await store.recordWebhook(
      webhookInput(payment, label, now),
    );
    webhookIds.push(webhook.id);
    await expect(store.claimWebhook(webhook.id, now, 60_000)).resolves.toBe(
      true,
    );
    return webhook;
  }

  function paymentInput(
    webhookId: string,
    payment: ProviderPayment,
    now: Date,
  ) {
    return {
      webhookId,
      payment,
      expectedSellerUserId: SELLER_USER_ID,
      expectedApplicationId: APPLICATION_ID,
      expectedLiveMode: false,
      now,
    };
  }
});
