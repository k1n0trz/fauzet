import { randomUUID } from "node:crypto";
import { getDatabase, Prisma, type PrismaClient } from "@fauzet/database";
import {
  FiatPaymentError,
  type CheckoutReservation,
  type FiatPaymentStore,
  type ProviderPayment,
  type StoredFiatOrder,
} from "../domain/fiat-payments.js";

export class PrismaFiatPaymentStore implements FiatPaymentStore {
  constructor(private readonly database: PrismaClient = getDatabase()) {}

  async reserveCheckout(
    input: Parameters<FiatPaymentStore["reserveCheckout"]>[0],
  ): Promise<CheckoutReservation> {
    try {
      return await serializable(this.database, async (tx) => {
        const existing = await orderByIdempotency(tx, input.idempotencyKey);
        if (existing) return reserveExisting(tx, existing, input);

        const product = await tx.fiatProductVersion.findUnique({
          where: { id: input.productVersionId },
        });
        assertProductAvailable(product, input, input.now);
        const orderId = randomUUID();
        const snapshot = {
          sku: product.sku,
          version: product.version,
          kind: product.kind,
          name: product.name,
          description: product.description,
          durationSeconds: product.durationSeconds,
          effectType: product.effectType,
          effectConfig: product.effectConfig,
          ruleVersion: product.ruleVersion,
        } satisfies Prisma.InputJsonObject;
        const order = await tx.paymentOrder.create({
          data: {
            id: orderId,
            userId: input.userId,
            productVersionId: product.id,
            provider: "MERCADOPAGO",
            environment: "TEST",
            idempotencyKey: input.idempotencyKey,
            requestHash: input.requestHash,
            externalReference: orderId,
            status: "CREATED",
            quantity: 1,
            currency: "COP",
            unitAmountMinor: product.unitAmountMinor,
            totalAmountMinor: product.unitAmountMinor,
            productSnapshot: snapshot,
            termsVersion: input.termsVersion,
            refundPolicyVersion: product.refundPolicyVersion,
          },
          include: orderInclude,
        });
        const attempt = await tx.paymentAttempt.create({
          data: {
            orderId: order.id,
            attemptNo: 1,
            provider: "MERCADOPAGO",
            environment: "TEST",
            providerIdempotencyKey: `mp-preference:${order.id}`,
            status: "CREATED",
            checkoutLockToken: input.leaseToken,
            checkoutLockedAt: input.now,
          },
        });
        return reservation(order, attempt.id, input.leaseToken, false);
      });
    } catch (error) {
      if (!uniqueConflict(error)) throw error;
      const existing = await orderByIdempotency(
        this.database,
        input.idempotencyKey,
      );
      if (!existing) throw error;
      return serializable(this.database, (tx) =>
        reserveExisting(tx, existing, input),
      );
    }
  }

  async completeCheckout(
    input: Parameters<FiatPaymentStore["completeCheckout"]>[0],
  ) {
    return serializable(this.database, async (tx) => {
      const claimed = await tx.paymentAttempt.updateMany({
        where: {
          id: input.attemptId,
          orderId: input.orderId,
          checkoutLockToken: input.leaseToken,
        },
        data: {
          providerCheckoutId: input.preference.id,
          checkoutUrl: input.preference.checkoutUrl,
          expiresAt: input.preference.expiresAt,
          status: "CHECKOUT_READY",
          verificationEvidence: {
            preferenceEvidenceHash: input.preference.evidenceHash,
            collectorId: input.preference.collectorId,
            externalReference: input.preference.externalReference,
            environment: "TEST",
            verifiedAt: input.now.toISOString(),
          },
          checkoutLockToken: null,
          checkoutLockedAt: null,
          failedAt: null,
        },
      });
      if (claimed.count !== 1) {
        throw new FiatPaymentError(
          "FIAT_CHECKOUT_BUSY",
          "The checkout preparation lease was lost",
          409,
          true,
        );
      }
      return mapOrder(
        await tx.paymentOrder.update({
          where: { id: input.orderId },
          data: {
            status: "CHECKOUT_READY",
            checkoutExpiresAt: input.preference.expiresAt,
          },
          include: orderInclude,
        }),
      );
    });
  }

  async failCheckout(input: Parameters<FiatPaymentStore["failCheckout"]>[0]) {
    await serializable(this.database, async (tx) => {
      const updated = await tx.paymentAttempt.updateMany({
        where: {
          id: input.attemptId,
          orderId: input.orderId,
          checkoutLockToken: input.leaseToken,
        },
        data: {
          status: "ERROR",
          providerStatusDetail: input.reasonCode,
          failedAt: input.now,
          checkoutLockToken: null,
          checkoutLockedAt: null,
        },
      });
      if (updated.count === 1 && input.terminal) {
        await tx.paymentOrder.updateMany({
          where: {
            id: input.orderId,
            status: { in: ["CREATED", "CHECKOUT_READY"] },
          },
          data: { status: "HELD" },
        });
      }
    });
  }

  async orderForUser(userId: string, orderId: string) {
    const order = await this.database.paymentOrder.findFirst({
      where: { id: orderId, userId },
      include: orderInclude,
    });
    return order ? mapOrder(order) : null;
  }

  async recordWebhook(input: Parameters<FiatPaymentStore["recordWebhook"]>[0]) {
    try {
      const created = await this.database.paymentWebhookInbox.create({
        data: {
          provider: "MERCADOPAGO",
          environment: "TEST",
          dedupeKey: input.dedupeKey,
          providerEventId: input.providerEventId,
          providerObjectId: input.providerObjectId,
          status: "RECEIVED",
          signatureVerifiedAt: input.signatureVerifiedAt,
          payloadHash: input.payloadHash,
          payload: input.payload as Prisma.InputJsonObject,
        },
      });
      return {
        id: created.id,
        providerObjectId: input.providerObjectId,
        status: created.status,
        replayed: false,
      };
    } catch (error) {
      if (!uniqueConflict(error)) throw error;
      const existing = await this.database.paymentWebhookInbox.findUnique({
        where: {
          provider_environment_dedupeKey: {
            provider: "MERCADOPAGO",
            environment: "TEST",
            dedupeKey: input.dedupeKey,
          },
        },
      });
      if (!existing) throw error;
      if (existing.providerObjectId !== input.providerObjectId) {
        throw new FiatPaymentError(
          "FIAT_WEBHOOK_INVALID",
          "A webhook dedupe key was reused for another provider object",
          409,
        );
      }
      return {
        id: existing.id,
        providerObjectId: input.providerObjectId,
        status: existing.status,
        replayed: true,
      };
    }
  }

  async ignoreWebhook(webhookId: string, now: Date, reasonCode: string) {
    await this.database.paymentWebhookInbox.update({
      where: { id: webhookId },
      data: {
        status: "IGNORED",
        lastErrorCode: reasonCode,
        processedAt: now,
        lockedAt: null,
        nextRetryAt: null,
      },
    });
  }

  async claimWebhook(webhookId: string, now: Date, lockTimeoutMs: number) {
    const staleBefore = new Date(now.getTime() - lockTimeoutMs);
    const result = await this.database.paymentWebhookInbox.updateMany({
      where: {
        id: webhookId,
        signatureVerifiedAt: { not: null },
        OR: [
          {
            status: { in: ["RECEIVED", "FAILED"] },
            OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
          },
          { status: "PROCESSING", lockedAt: { lt: staleBefore } },
        ],
      },
      data: {
        status: "PROCESSING",
        lockedAt: now,
        attemptCount: { increment: 1 },
        nextRetryAt: null,
      },
    });
    return result.count === 1;
  }

  async applyPayment(input: Parameters<FiatPaymentStore["applyPayment"]>[0]) {
    return serializable(this.database, (tx) => applyPayment(tx, input));
  }

  async failWebhook(input: Parameters<FiatPaymentStore["failWebhook"]>[0]) {
    const current = await this.database.paymentWebhookInbox.findUnique({
      where: { id: input.webhookId },
      select: { attemptCount: true },
    });
    await this.database.paymentWebhookInbox.updateMany({
      where: { id: input.webhookId, status: "PROCESSING" },
      data: {
        status:
          (current?.attemptCount ?? 0) >= MAX_WEBHOOK_ATTEMPTS
            ? "DEAD_LETTER"
            : "FAILED",
        lastErrorCode: input.reasonCode,
        lockedAt: null,
        nextRetryAt:
          (current?.attemptCount ?? 0) >= MAX_WEBHOOK_ATTEMPTS
            ? null
            : input.retryAt,
      },
    });
  }

  async webhookReconciliationCandidates(
    input: Parameters<FiatPaymentStore["webhookReconciliationCandidates"]>[0],
  ) {
    const staleBefore = new Date(input.now.getTime() - WEBHOOK_STALE_MS);
    const rows = await this.database.paymentWebhookInbox.findMany({
      where: {
        signatureVerifiedAt: { not: null },
        providerObjectId: { not: null },
        OR: [
          {
            status: { in: ["RECEIVED", "FAILED"] },
            OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: input.now } }],
          },
          { status: "PROCESSING", lockedAt: { lt: staleBefore } },
        ],
      },
      orderBy: [{ receivedAt: "asc" }, { id: "asc" }],
      take: input.limit,
      select: { id: true, providerObjectId: true },
    });
    return rows.flatMap((row) =>
      row.providerObjectId
        ? [{ id: row.id, providerObjectId: row.providerObjectId }]
        : [],
    );
  }

  async orderReconciliationCandidates(
    input: Parameters<FiatPaymentStore["orderReconciliationCandidates"]>[0],
  ) {
    void input.now;
    return this.database.paymentOrder.findMany({
      where: {
        provider: "MERCADOPAGO",
        environment: "TEST",
        OR: [
          { status: { in: ["CHECKOUT_READY", "PENDING"] } },
          {
            status: "EXPIRED",
            checkoutExpiresAt: { gte: input.expiredAfter },
          },
        ],
        attempts: {
          some: {
            providerCheckoutId: { not: null },
            OR: [
              { lastProviderSyncAt: null },
              { lastProviderSyncAt: { lte: input.staleBefore } },
            ],
          },
        },
      },
      orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
      take: input.limit,
      select: { id: true, externalReference: true },
    });
  }

  async markOrderReconciliationAttempt(
    orderId: string,
    now: Date,
    paymentFound: boolean,
  ) {
    await serializable(this.database, async (tx) => {
      await tx.paymentAttempt.updateMany({
        where: { orderId, providerCheckoutId: { not: null } },
        data: { lastProviderSyncAt: now },
      });
      if (!paymentFound) {
        await tx.paymentOrder.updateMany({
          where: {
            id: orderId,
            status: "CHECKOUT_READY",
            checkoutExpiresAt: { lte: now },
          },
          data: { status: "EXPIRED", expiredAt: now },
        });
      }
    });
  }

  async failOrderReconciliation(
    input: Parameters<FiatPaymentStore["failOrderReconciliation"]>[0],
  ) {
    await serializable(this.database, async (tx) => {
      await tx.paymentAttempt.updateMany({
        where: { orderId: input.orderId, providerCheckoutId: { not: null } },
        data: {
          lastProviderSyncAt: input.now,
          providerStatusDetail: input.reasonCode,
          ...(input.terminal ? { status: "HELD" as const } : {}),
        },
      });
      if (input.terminal) {
        await tx.paymentOrder.updateMany({
          where: {
            id: input.orderId,
            status: { in: ["CHECKOUT_READY", "PENDING", "EXPIRED"] },
          },
          data: { status: "HELD" },
        });
      }
    });
  }
}

async function reserveExisting(
  tx: Prisma.TransactionClient,
  staleOrder: OrderWithRelations,
  input: Parameters<FiatPaymentStore["reserveCheckout"]>[0],
): Promise<CheckoutReservation> {
  const order = await tx.paymentOrder.findUnique({
    where: { id: staleOrder.id },
    include: orderInclude,
  });
  if (!order) throw new Error("Payment order disappeared during reservation");
  if (
    order.userId !== input.userId ||
    order.requestHash !== input.requestHash ||
    order.productVersionId !== input.productVersionId ||
    order.termsVersion !== input.termsVersion ||
    order.refundPolicyVersion !== input.refundPolicyVersion
  ) {
    throw new FiatPaymentError(
      "FIAT_IDEMPOTENCY_CONFLICT",
      "The idempotency key was already used for a different checkout",
      409,
    );
  }
  const attempt = order.attempts[0];
  if (!attempt) throw new Error("Payment order has no checkout attempt");
  if (attempt.providerCheckoutId && attempt.checkoutUrl && attempt.expiresAt) {
    return reservation(order, attempt.id, null, true);
  }
  if (!["CREATED", "CHECKOUT_READY"].includes(order.status)) {
    throw new FiatPaymentError(
      "FIAT_IDEMPOTENCY_CONFLICT",
      "The existing checkout order is already final",
      409,
    );
  }
  const expiredBefore = new Date(input.now.getTime() - input.leaseTimeoutMs);
  const claimed = await tx.paymentAttempt.updateMany({
    where: {
      id: attempt.id,
      providerCheckoutId: null,
      OR: [
        { checkoutLockToken: null, checkoutLockedAt: null },
        { checkoutLockedAt: { lt: expiredBefore } },
      ],
    },
    data: {
      checkoutLockToken: input.leaseToken,
      checkoutLockedAt: input.now,
      status: "CREATED",
      failedAt: null,
    },
  });
  return reservation(
    order,
    attempt.id,
    claimed.count === 1 ? input.leaseToken : null,
    true,
  );
}

async function applyPayment(
  tx: Prisma.TransactionClient,
  input: Parameters<FiatPaymentStore["applyPayment"]>[0],
) {
  const webhook = input.webhookId
    ? await tx.paymentWebhookInbox.findUnique({
        where: { id: input.webhookId },
      })
    : null;
  if (input.webhookId && (!webhook || !webhook.signatureVerifiedAt)) {
    throw new FiatPaymentError(
      "FIAT_WEBHOOK_INVALID",
      "The webhook was not durably verified",
      409,
    );
  }
  if (webhook?.status === "PROCESSED" || webhook?.status === "IGNORED") {
    return {
      orderId: webhook.orderId,
      fulfilled: false,
      orderStatus: webhook.status,
    };
  }
  const finish = (data: Parameters<typeof finishWebhook>[3]) =>
    input.webhookId
      ? finishWebhook(tx, input.webhookId, input.now, data)
      : Promise.resolve();

  const order = await tx.paymentOrder.findUnique({
    where: { externalReference: input.payment.externalReference },
    include: orderInclude,
  });
  if (!order) {
    await finish({
      status: "IGNORED",
      reasonCode: "ORDER_NOT_FOUND",
    });
    return { orderId: null, fulfilled: false, orderStatus: "IGNORED" };
  }

  let attempt = await tx.paymentAttempt.findFirst({
    where: {
      orderId: order.id,
      providerPaymentId: input.payment.id,
    },
    orderBy: { attemptNo: "desc" },
  });
  attempt ??= await tx.paymentAttempt.findFirst({
    where: {
      orderId: order.id,
      providerPaymentId: null,
      providerCheckoutId: input.payment.preferenceId,
    },
    orderBy: { attemptNo: "desc" },
  });
  if (!attempt) {
    const latest = await tx.paymentAttempt.aggregate({
      where: { orderId: order.id },
      _max: { attemptNo: true },
    });
    attempt = await tx.paymentAttempt.create({
      data: {
        orderId: order.id,
        attemptNo: (latest._max.attemptNo ?? 0) + 1,
        provider: "MERCADOPAGO",
        environment: "TEST",
        providerIdempotencyKey: `mp-payment:${input.payment.id}`,
        providerPaymentId: input.payment.id,
        status: "CREATED",
      },
    });
  }

  if (
    attempt.providerUpdatedAt &&
    input.payment.providerUpdatedAt < attempt.providerUpdatedAt
  ) {
    await finish({
      orderId: order.id,
      attemptId: attempt.id,
      reasonCode: "STALE_PROVIDER_EVENT",
    });
    return { orderId: order.id, fulfilled: false, orderStatus: order.status };
  }

  const state = providerState(input.payment);
  const mismatches = verificationMismatches(order, input);
  const alreadyPaidWithAnotherAttempt =
    state === "APPROVED" &&
    order.status === "PAID" &&
    order.paidAttemptId !== null &&
    order.paidAttemptId !== attempt.id;
  if (mismatches.length > 0 || alreadyPaidWithAnotherAttempt) {
    let mismatchOrderStatus = order.status;
    if (alreadyPaidWithAnotherAttempt) {
      await tx.paymentOrder.update({
        where: { id: order.id },
        data: { status: "DISPUTED" },
      });
      await revokeEntitlement(tx, order.id, input.now, false);
      await updateAttempt(tx, attempt.id, input.payment, "HELD", input.now);
      mismatchOrderStatus = "DISPUTED";
    } else if (order.paidAttemptId === attempt.id) {
      if (order.status === "PAID" || order.status === "REFUND_PENDING") {
        await tx.paymentOrder.update({
          where: { id: order.id },
          data: { status: "DISPUTED" },
        });
        await revokeEntitlement(tx, order.id, input.now, false);
        mismatchOrderStatus = "DISPUTED";
      }
      await updateReviewEvidence(
        tx,
        attempt.id,
        input.payment,
        input.now,
        "PAYMENT_MISMATCH",
      );
    } else if (!isPaidTerminal(order.status)) {
      await tx.paymentOrder.update({
        where: { id: order.id },
        data: { status: "HELD" },
      });
      await updateAttempt(tx, attempt.id, input.payment, "HELD", input.now);
      mismatchOrderStatus = "HELD";
    } else {
      await updateAttempt(tx, attempt.id, input.payment, "HELD", input.now);
    }
    const reasonCode = alreadyPaidWithAnotherAttempt
      ? "DUPLICATE_APPROVED_PAYMENT"
      : `PAYMENT_MISMATCH_${mismatches.join("_")}`;
    await finish({
      orderId: order.id,
      attemptId: attempt.id,
      reasonCode,
    });
    return {
      orderId: order.id,
      fulfilled: false,
      orderStatus: mismatchOrderStatus,
    };
  }

  if (state === "PARTIAL_REFUND") {
    let partialRefundOrderStatus = order.status;
    const isPaidAttempt = order.paidAttemptId === attempt.id;
    if (isPaidAttempt) {
      if (["PAID", "REFUND_PENDING"].includes(order.status)) {
        await tx.paymentOrder.update({
          where: { id: order.id },
          data: { status: "DISPUTED" },
        });
        await revokeEntitlement(tx, order.id, input.now, false);
        partialRefundOrderStatus = "DISPUTED";
      }
      await updateReviewEvidence(
        tx,
        attempt.id,
        input.payment,
        input.now,
        "PARTIAL_REFUND",
      );
    } else if (!isPaidTerminal(order.status)) {
      await tx.paymentOrder.update({
        where: { id: order.id },
        data: { status: "HELD" },
      });
      partialRefundOrderStatus = "HELD";
      await updateAttempt(tx, attempt.id, input.payment, "HELD", input.now);
    } else {
      await updateAttempt(tx, attempt.id, input.payment, "HELD", input.now);
    }
    await finish({
      orderId: order.id,
      attemptId: attempt.id,
      reasonCode: "PARTIAL_REFUND_REVIEW_REQUIRED",
    });
    return {
      orderId: order.id,
      fulfilled: false,
      orderStatus: partialRefundOrderStatus,
    };
  }

  if (state === "APPROVED") {
    if (order.paidAttemptId === attempt.id && isPaidTerminal(order.status)) {
      if (order.status === "PAID") {
        await ensureEntitlement(tx, order, input.now);
      } else {
        await updateReviewEvidence(
          tx,
          attempt.id,
          input.payment,
          input.now,
          "TERMINAL_STATE_OBSERVATION",
        );
      }
      await finish({
        orderId: order.id,
        attemptId: attempt.id,
        ...(order.status === "PAID"
          ? {}
          : { reasonCode: "APPROVAL_AFTER_TERMINAL_STATE" }),
      });
      return {
        orderId: order.id,
        fulfilled: false,
        orderStatus: order.status,
      };
    }
    if (isPaidTerminal(order.status)) {
      await updateAttempt(tx, attempt.id, input.payment, "HELD", input.now);
      await finish({
        orderId: order.id,
        attemptId: attempt.id,
        reasonCode: "APPROVAL_AFTER_TERMINAL_STATE",
      });
      return { orderId: order.id, fulfilled: false, orderStatus: order.status };
    }
    await updateAttempt(tx, attempt.id, input.payment, "APPROVED", input.now);
    const paidAt = input.payment.approvedAt ?? input.now;
    await tx.paymentOrder.update({
      where: { id: order.id },
      data: {
        status: "PAID",
        paidAttemptId: attempt.id,
        paidAt,
        refundEligibleUntil: addBusinessDays(
          paidAt,
          order.productVersion.refundWindowBusinessDays,
        ),
      },
    });
    await ensureEntitlement(tx, order, paidAt);
    await finish({
      orderId: order.id,
      attemptId: attempt.id,
    });
    return { orderId: order.id, fulfilled: true, orderStatus: "PAID" };
  }

  if (state === "REFUNDED" && order.paidAttemptId === attempt.id) {
    if (["PAID", "REFUND_PENDING"].includes(order.status)) {
      await tx.paymentOrder.update({
        where: { id: order.id },
        data: { status: "REFUNDED", refundedAt: input.now },
      });
      await revokeEntitlement(tx, order.id, input.now, true);
      if (attempt.status === "APPROVED") {
        await updateAttempt(
          tx,
          attempt.id,
          input.payment,
          "REFUNDED",
          input.now,
        );
      } else {
        await updateReviewEvidence(
          tx,
          attempt.id,
          input.payment,
          input.now,
          "TERMINAL_STATE_OBSERVATION",
        );
      }
    } else {
      await updateReviewEvidence(
        tx,
        attempt.id,
        input.payment,
        input.now,
        "TERMINAL_STATE_OBSERVATION",
      );
    }
  } else if (state === "CHARGEBACK" && order.paidAttemptId === attempt.id) {
    if (order.status !== "DISPUTED") {
      await tx.paymentOrder.update({
        where: { id: order.id },
        data: { status: "DISPUTED" },
      });
    }
    await revokeEntitlement(tx, order.id, input.now, false);
    if (attempt.status === "APPROVED") {
      await updateAttempt(
        tx,
        attempt.id,
        input.payment,
        "CHARGEBACK",
        input.now,
      );
    } else {
      await updateReviewEvidence(
        tx,
        attempt.id,
        input.payment,
        input.now,
        "TERMINAL_STATE_OBSERVATION",
      );
    }
  } else if (!isPaidTerminal(order.status)) {
    await updateAttempt(tx, attempt.id, input.payment, state, input.now);
    await tx.paymentOrder.update({
      where: { id: order.id },
      data: {
        status:
          state === "CANCELLED"
            ? "CANCELLED"
            : ["HELD", "REFUNDED", "CHARGEBACK"].includes(state)
              ? "HELD"
              : "PENDING",
        ...(state === "CANCELLED" ? { cancelledAt: input.now } : {}),
      },
    });
  }

  await finish({
    orderId: order.id,
    attemptId: attempt.id,
  });
  const finalOrder = await tx.paymentOrder.findUniqueOrThrow({
    where: { id: order.id },
    select: { status: true },
  });
  return {
    orderId: order.id,
    fulfilled: false,
    orderStatus: finalOrder.status,
  };
}

async function updateAttempt(
  tx: Prisma.TransactionClient,
  attemptId: string,
  payment: ProviderPayment,
  status:
    | "PENDING"
    | "APPROVED"
    | "DECLINED"
    | "CANCELLED"
    | "HELD"
    | "ERROR"
    | "REFUNDED"
    | "CHARGEBACK",
  now: Date,
) {
  const observedCurrency = /^[A-Z]{3}$/.test(payment.currency)
    ? payment.currency
    : null;
  const data: Prisma.PaymentAttemptUncheckedUpdateInput = {
    providerPaymentId: payment.id,
    status,
    providerStatus: payment.status,
    providerStatusDetail: payment.statusDetail,
    observedAmountMinor: payment.amountMinor.toString(),
    observedCurrency,
    verificationEvidence: {
      paymentEvidenceHash: payment.evidenceHash,
      collectorId: payment.collectorId,
      applicationId: payment.applicationId,
      externalReference: payment.externalReference,
      preferenceId: payment.preferenceId,
      merchantOrderId: payment.merchantOrderId,
      liveMode: payment.liveMode,
      refundedAmountMinor: payment.refundedAmountMinor.toString(),
      providerUpdatedAt: payment.providerUpdatedAt.toISOString(),
      verifiedAt: now.toISOString(),
    },
    ...(status === "APPROVED" ? { approvedAt: payment.approvedAt ?? now } : {}),
    ...(status === "DECLINED" || status === "ERROR" ? { failedAt: now } : {}),
    lastProviderSyncAt: now,
    providerUpdatedAt: payment.providerUpdatedAt,
    checkoutLockToken: null,
    checkoutLockedAt: null,
  };
  await tx.paymentAttempt.update({
    where: { id: attemptId },
    data,
  });
}

async function updateReviewEvidence(
  tx: Prisma.TransactionClient,
  attemptId: string,
  payment: ProviderPayment,
  now: Date,
  reviewReason:
    | "PARTIAL_REFUND"
    | "PAYMENT_MISMATCH"
    | "TERMINAL_STATE_OBSERVATION",
) {
  const stored = await tx.paymentAttempt.findUniqueOrThrow({
    where: { id: attemptId },
    select: { verificationEvidence: true },
  });
  const existing = record(stored.verificationEvidence) ?? {};
  const approvalEvidence =
    record(existing.approvalEvidence) ?? stripReviewEvidence(existing);
  const reviewEvidence = {
    paymentEvidenceHash: payment.evidenceHash,
    collectorId: payment.collectorId,
    applicationId: payment.applicationId,
    externalReference: payment.externalReference,
    preferenceId: payment.preferenceId,
    merchantOrderId: payment.merchantOrderId,
    liveMode: payment.liveMode,
    refundedAmountMinor: payment.refundedAmountMinor.toString(),
    providerStatus: payment.status,
    providerStatusDetail: payment.statusDetail,
    providerUpdatedAt: payment.providerUpdatedAt.toISOString(),
    verifiedAt: now.toISOString(),
    reviewReason,
  };
  const previousHistory = Array.isArray(existing.reviewHistory)
    ? existing.reviewHistory.slice(-19)
    : [];
  await tx.paymentAttempt.update({
    where: { id: attemptId },
    data: {
      providerStatus: payment.status,
      providerStatusDetail: payment.statusDetail,
      verificationEvidence: inputJson({
        ...existing,
        approvalEvidence,
        latestReviewEvidence: reviewEvidence,
        reviewHistory: [...previousHistory, reviewEvidence],
      }),
      lastProviderSyncAt: now,
      providerUpdatedAt: payment.providerUpdatedAt,
    },
  });
}

function stripReviewEvidence(value: Record<string, unknown>) {
  const result = { ...value };
  delete result.approvalEvidence;
  delete result.latestReviewEvidence;
  delete result.reviewHistory;
  return result;
}

function providerState(payment: ProviderPayment) {
  if (payment.status === "charged_back") return "CHARGEBACK" as const;
  if (
    payment.refundedAmountMinor === payment.amountMinor &&
    payment.amountMinor > 0n
  )
    return "REFUNDED" as const;
  if (payment.refundedAmountMinor > 0n) return "PARTIAL_REFUND" as const;
  if (payment.status === "approved") {
    return payment.statusDetail === "accredited"
      ? ("APPROVED" as const)
      : ("HELD" as const);
  }
  if (["pending", "in_process", "authorized"].includes(payment.status))
    return "PENDING" as const;
  if (payment.status === "rejected") return "DECLINED" as const;
  if (payment.status === "cancelled") return "CANCELLED" as const;
  if (payment.status === "refunded") return "REFUNDED" as const;
  return "HELD" as const;
}

function verificationMismatches(
  order: OrderWithRelations,
  input: Parameters<FiatPaymentStore["applyPayment"]>[0],
) {
  const result: string[] = [];
  if (input.payment.id.length === 0) result.push("ID");
  if (input.payment.externalReference !== order.id) result.push("REFERENCE");
  if (
    !order.attempts.some(
      (attempt) => attempt.providerCheckoutId === input.payment.preferenceId,
    )
  ) {
    result.push("PREFERENCE");
  }
  if (input.payment.collectorId !== input.expectedSellerUserId)
    result.push("SELLER");
  if (input.payment.applicationId !== input.expectedApplicationId)
    result.push("APPLICATION");
  if (input.payment.liveMode !== input.expectedLiveMode)
    result.push("ENVIRONMENT");
  if (input.payment.currency !== order.currency) result.push("CURRENCY");
  if (
    input.payment.amountMinor.toString() !== order.totalAmountMinor.toFixed(0)
  )
    result.push("AMOUNT");
  if (input.payment.refundedAmountMinor > input.payment.amountMinor)
    result.push("REFUND_AMOUNT");
  return result;
}

async function ensureEntitlement(
  tx: Prisma.TransactionClient,
  order: OrderWithRelations,
  purchasedAt: Date,
) {
  const snapshot = record(order.productSnapshot);
  const effectSnapshot = inputJson(
    record(snapshot?.effectConfig) ?? order.productVersion.effectConfig,
  );
  await tx.entitlement.upsert({
    where: { orderId: order.id },
    update: {},
    create: {
      orderId: order.id,
      status: "PURCHASED",
      effectType:
        string(snapshot?.effectType) ?? order.productVersion.effectType,
      effectSnapshot,
      purchasedAt,
    },
  });
}

async function revokeEntitlement(
  tx: Prisma.TransactionClient,
  orderId: string,
  now: Date,
  refunded: boolean,
) {
  const entitlement = await tx.entitlement.findUnique({ where: { orderId } });
  if (!entitlement) return;
  const unactivated = entitlement.activatedAt === null;
  await tx.entitlement.update({
    where: { id: entitlement.id },
    data:
      refunded && unactivated
        ? { status: "REFUNDED", refundedAt: now }
        : { status: "REVOKED", revokedAt: now },
  });
}

async function finishWebhook(
  tx: Prisma.TransactionClient,
  webhookId: string,
  now: Date,
  input: {
    status?: "PROCESSED" | "IGNORED";
    orderId?: string;
    attemptId?: string;
    reasonCode?: string;
  },
) {
  const data: Prisma.PaymentWebhookInboxUncheckedUpdateInput = {
    status: input.status ?? "PROCESSED",
    ...(input.orderId ? { orderId: input.orderId } : {}),
    ...(input.attemptId ? { attemptId: input.attemptId } : {}),
    lastErrorCode: input.reasonCode ?? null,
    processedAt: now,
    lockedAt: null,
    nextRetryAt: null,
  };
  await tx.paymentWebhookInbox.update({
    where: { id: webhookId },
    data,
  });
}

function reservation(
  order: OrderWithRelations,
  attemptId: string,
  leaseToken: string | null,
  replayed: boolean,
): CheckoutReservation {
  return {
    order: mapOrder(order),
    attemptId,
    leaseToken,
    replayed,
    product: {
      productVersionId: order.productVersion.id,
      sku: order.productVersion.sku,
      name: order.productVersion.name,
      description: order.productVersion.description,
      currency: "COP",
      amountMinor: BigInt(order.totalAmountMinor.toFixed(0)),
    },
  };
}

function mapOrder(order: OrderWithRelations): StoredFiatOrder {
  const attempt = order.attempts.find(
    (candidate) =>
      candidate.providerCheckoutId &&
      candidate.checkoutUrl &&
      candidate.expiresAt,
  );
  if (order.currency !== "COP") {
    throw new Error(`Unsupported fiat order currency ${order.currency}`);
  }
  return {
    id: order.id,
    userId: order.userId,
    status: order.status,
    productVersionId: order.productVersionId,
    sku: order.productVersion.sku,
    name: order.productVersion.name,
    quantity: 1,
    currency: "COP",
    amountMinor: BigInt(order.totalAmountMinor.toFixed(0)),
    termsVersion: order.termsVersion,
    refundPolicyVersion: order.refundPolicyVersion,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    checkout: attempt
      ? {
          preferenceId: attempt.providerCheckoutId!,
          url: attempt.checkoutUrl!,
          expiresAt: attempt.expiresAt!,
        }
      : null,
    entitlementId: order.entitlement?.id ?? null,
  };
}

function assertProductAvailable(
  product: Awaited<
    ReturnType<Prisma.TransactionClient["fiatProductVersion"]["findUnique"]>
  >,
  input: Parameters<FiatPaymentStore["reserveCheckout"]>[0],
  now: Date,
): asserts product is NonNullable<typeof product> {
  if (
    !product ||
    product.id !== input.productVersionId ||
    product.status !== "ACTIVE" ||
    product.currency !== "COP" ||
    !product.publishedAt ||
    (product.saleStartsAt !== null && product.saleStartsAt > now) ||
    (product.saleEndsAt !== null && product.saleEndsAt <= now)
  ) {
    throw new FiatPaymentError(
      "FIAT_PRODUCT_NOT_AVAILABLE",
      "The selected fiat sandbox product is not available",
      409,
    );
  }
  if (product.refundPolicyVersion !== input.refundPolicyVersion) {
    throw new FiatPaymentError(
      "FIAT_TERMS_CHANGED",
      "The refund policy changed; refresh the catalog before continuing",
      409,
    );
  }
}

function orderByIdempotency(
  client: Prisma.TransactionClient | PrismaClient,
  idempotencyKey: string,
) {
  return client.paymentOrder.findUnique({
    where: { idempotencyKey },
    include: orderInclude,
  });
}

async function serializable<T>(
  database: PrismaClient,
  callback: (tx: Prisma.TransactionClient) => Promise<T>,
) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await database.$transaction(callback, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (!serializationConflict(error) || attempt === 2) throw error;
    }
  }
  throw new Error("Unreachable serializable transaction state");
}

function uniqueConflict(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

function serializationConflict(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2034"
  );
}

function isPaidTerminal(status: string) {
  return ["PAID", "REFUND_PENDING", "REFUNDED", "DISPUTED"].includes(status);
}

function addBusinessDays(value: Date, businessDays: number) {
  const result = new Date(value);
  let remaining = businessDays;
  while (remaining > 0) {
    result.setUTCDate(result.getUTCDate() + 1);
    const day = result.getUTCDay();
    if (day !== 0 && day !== 6) remaining -= 1;
  }
  return result;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function string(value: unknown) {
  return typeof value === "string" && value ? value : null;
}

function inputJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

const orderInclude = Prisma.validator<Prisma.PaymentOrderInclude>()({
  productVersion: true,
  attempts: { orderBy: { attemptNo: "desc" } },
  entitlement: true,
});
type OrderWithRelations = Prisma.PaymentOrderGetPayload<{
  include: typeof orderInclude;
}>;

const MAX_WEBHOOK_ATTEMPTS = 12;
const WEBHOOK_STALE_MS = 2 * 60 * 1000;
