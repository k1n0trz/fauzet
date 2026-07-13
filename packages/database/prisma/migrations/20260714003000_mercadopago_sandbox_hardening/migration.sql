-- Mercado Pago sandbox checkout coordination and payment-state hardening.
-- This migration remains provider-neutral at the database boundary.

-- Nullable columns make this migration additive for existing attempts. A
-- checkout lock is valid only when both its token and acquisition time exist.
ALTER TABLE "PaymentAttempt"
  ADD COLUMN "checkoutLockToken" TEXT,
  ADD COLUMN "checkoutLockedAt" TIMESTAMP(3),
  ADD COLUMN "providerUpdatedAt" TIMESTAMP(3),
  ADD CONSTRAINT "PaymentAttempt_checkout_lock_check" CHECK (
    ("checkoutLockToken" IS NULL AND "checkoutLockedAt" IS NULL) OR
    ("checkoutLockToken" IS NOT NULL AND "checkoutLockedAt" IS NOT NULL)
  );

CREATE INDEX "PaymentAttempt_status_checkoutLockedAt_idx"
  ON "PaymentAttempt"("status", "checkoutLockedAt");

CREATE INDEX "PaymentAttempt_provider_environment_providerUpdatedAt_idx"
  ON "PaymentAttempt"("provider", "environment", "providerUpdatedAt");

-- Once created, an order is an immutable record of who requested which exact
-- product/economics under which terms. Only lifecycle fields may advance.
CREATE FUNCTION "guard_payment_order_immutable_snapshot"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."userId" IS DISTINCT FROM OLD."userId" OR
     NEW."productVersionId" IS DISTINCT FROM OLD."productVersionId" OR
     NEW."provider" IS DISTINCT FROM OLD."provider" OR
     NEW."environment" IS DISTINCT FROM OLD."environment" OR
     NEW."idempotencyKey" IS DISTINCT FROM OLD."idempotencyKey" OR
     NEW."requestHash" IS DISTINCT FROM OLD."requestHash" OR
     NEW."externalReference" IS DISTINCT FROM OLD."externalReference" OR
     NEW."quantity" IS DISTINCT FROM OLD."quantity" OR
     NEW."currency" IS DISTINCT FROM OLD."currency" OR
     NEW."unitAmountMinor" IS DISTINCT FROM OLD."unitAmountMinor" OR
     NEW."totalAmountMinor" IS DISTINCT FROM OLD."totalAmountMinor" OR
     NEW."productSnapshot" IS DISTINCT FROM OLD."productSnapshot" OR
     NEW."termsVersion" IS DISTINCT FROM OLD."termsVersion" OR
     NEW."refundPolicyVersion" IS DISTINCT FROM OLD."refundPolicyVersion" THEN
    RAISE EXCEPTION 'Payment order identity, economics and snapshots are immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "PaymentOrder_snapshot_immutable"
BEFORE UPDATE OF
  "userId", "productVersionId", "provider", "environment", "idempotencyKey",
  "requestHash", "externalReference", "quantity", "currency",
  "unitAmountMinor", "totalAmountMinor", "productSnapshot", "termsVersion",
  "refundPolicyVersion"
ON "PaymentOrder"
FOR EACH ROW EXECUTE FUNCTION "guard_payment_order_immutable_snapshot"();

-- Provider event time may stay unchanged or advance, but an older webhook or
-- reconciliation response must never overwrite newer provider state.
CREATE FUNCTION "guard_payment_attempt_provider_time"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."providerUpdatedAt" IS NOT NULL AND
     (NEW."providerUpdatedAt" IS NULL OR NEW."providerUpdatedAt" < OLD."providerUpdatedAt") THEN
    RAISE EXCEPTION 'Payment attempt providerUpdatedAt cannot regress';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "PaymentAttempt_provider_time_monotonic"
BEFORE UPDATE OF "providerUpdatedAt" ON "PaymentAttempt"
FOR EACH ROW EXECUTE FUNCTION "guard_payment_attempt_provider_time"();

-- Once an attempt is the order's paid proof, its verified provider identity,
-- amount, currency and approval time are immutable. Its terminal transition is
-- allowed only after the owning order has reached the matching terminal state.
CREATE FUNCTION "guard_paid_payment_attempt"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  paid_order_status "PaymentOrderStatus";
BEGIN
  SELECT "status"
    INTO paid_order_status
  FROM "PaymentOrder"
  WHERE "paidAttemptId" = OLD."id";

  IF FOUND THEN
    IF NEW."providerPaymentId" IS DISTINCT FROM OLD."providerPaymentId" OR
       NEW."observedAmountMinor" IS DISTINCT FROM OLD."observedAmountMinor" OR
       NEW."observedCurrency" IS DISTINCT FROM OLD."observedCurrency" OR
       NEW."approvedAt" IS DISTINCT FROM OLD."approvedAt" THEN
      RAISE EXCEPTION 'Paid payment attempt verification fields are immutable';
    END IF;

    IF NEW."status" IS DISTINCT FROM OLD."status" AND NOT (
      OLD."status" = 'APPROVED' AND (
        (NEW."status" = 'REFUNDED' AND paid_order_status = 'REFUNDED') OR
        (NEW."status" = 'CHARGEBACK' AND paid_order_status = 'DISPUTED')
      )
    ) THEN
      RAISE EXCEPTION 'Paid payment attempt status transition does not match its order';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "PaymentAttempt_paid_proof_guard"
BEFORE UPDATE OF
  "providerPaymentId", "observedAmountMinor", "observedCurrency", "approvedAt", "status"
ON "PaymentAttempt"
FOR EACH ROW EXECUTE FUNCTION "guard_paid_payment_attempt"();

-- Both accepted terminal webhook outcomes require a verified provider
-- signature. IGNORED means valid-but-irrelevant, never unauthenticated.
ALTER TABLE "PaymentWebhookInbox"
  DROP CONSTRAINT "PaymentWebhookInbox_processing_check",
  ADD CONSTRAINT "PaymentWebhookInbox_processing_check" CHECK (
    "attemptCount" >= 0 AND
    ("status" NOT IN ('PROCESSED', 'IGNORED') OR "processedAt" IS NOT NULL) AND
    ("status" NOT IN ('PROCESSED', 'IGNORED') OR "signatureVerifiedAt" IS NOT NULL)
  );

-- Migration-time negative proof for immutable order snapshots. A temporary
-- relation exercises the real trigger function and leaves no application rows.
CREATE TEMPORARY TABLE "_PaymentOrderImmutableGuardTest" (
  "userId" TEXT NOT NULL,
  "productVersionId" TEXT NOT NULL,
  "provider" "PaymentProvider" NOT NULL,
  "environment" "PaymentEnvironment" NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "externalReference" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "currency" CHAR(3) NOT NULL,
  "unitAmountMinor" DECIMAL(36,0) NOT NULL,
  "totalAmountMinor" DECIMAL(36,0) NOT NULL,
  "productSnapshot" JSONB NOT NULL,
  "termsVersion" TEXT NOT NULL,
  "refundPolicyVersion" TEXT NOT NULL
);

CREATE TRIGGER "PaymentOrder_snapshot_immutable_negative_test_trigger"
BEFORE UPDATE ON "_PaymentOrderImmutableGuardTest"
FOR EACH ROW EXECUTE FUNCTION "guard_payment_order_immutable_snapshot"();

INSERT INTO "_PaymentOrderImmutableGuardTest" VALUES (
  'user', 'product', 'MERCADOPAGO', 'TEST', 'idempotency', 'request-hash',
  'external-reference', 1, 'COP', 3900, 3900, '{"sku":"test"}',
  'terms-v1', 'refund-v1'
);

DO $negative_order_snapshot_test$
DECLARE
  rejected BOOLEAN := false;
BEGIN
  BEGIN
    UPDATE "_PaymentOrderImmutableGuardTest"
    SET "requestHash" = 'forged-request-hash';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'Payment order identity, economics and snapshots are immutable' THEN
      rejected := true;
    ELSE
      RAISE;
    END IF;
  END;

  IF NOT rejected THEN
    RAISE EXCEPTION 'Negative immutable PaymentOrder snapshot test unexpectedly succeeded';
  END IF;
END;
$negative_order_snapshot_test$;

DROP TABLE "_PaymentOrderImmutableGuardTest";

-- Migration-time negative proof that provider event timestamps cannot move
-- backwards. This also uses the production trigger function on a temp table.
CREATE TEMPORARY TABLE "_PaymentAttemptProviderTimeGuardTest" (
  "providerUpdatedAt" TIMESTAMP(3)
);

CREATE TRIGGER "PaymentAttempt_provider_time_negative_test_trigger"
BEFORE UPDATE ON "_PaymentAttemptProviderTimeGuardTest"
FOR EACH ROW EXECUTE FUNCTION "guard_payment_attempt_provider_time"();

INSERT INTO "_PaymentAttemptProviderTimeGuardTest"
VALUES (TIMESTAMP '2026-07-14 00:00:01');

DO $negative_provider_time_test$
DECLARE
  rejected BOOLEAN := false;
BEGIN
  BEGIN
    UPDATE "_PaymentAttemptProviderTimeGuardTest"
    SET "providerUpdatedAt" = TIMESTAMP '2026-07-14 00:00:00';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'Payment attempt providerUpdatedAt cannot regress' THEN
      rejected := true;
    ELSE
      RAISE;
    END IF;
  END;

  IF NOT rejected THEN
    RAISE EXCEPTION 'Negative providerUpdatedAt regression test unexpectedly succeeded';
  END IF;
END;
$negative_provider_time_test$;

DROP TABLE "_PaymentAttemptProviderTimeGuardTest";
