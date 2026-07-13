-- Fiat catalog and inventory are deliberately additive and inert. No checkout
-- route is enabled by this migration and no seeded product is ACTIVE.

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('MERCADOPAGO', 'STRIPE');

-- CreateEnum
CREATE TYPE "PaymentEnvironment" AS ENUM ('TEST', 'LIVE');

-- CreateEnum
CREATE TYPE "FiatProductStatus" AS ENUM ('DRAFT', 'COMING_SOON', 'ACTIVE', 'PAUSED', 'RETIRED');

-- CreateEnum
CREATE TYPE "FiatProductKind" AS ENUM ('MINER', 'BOOST', 'CONSUMABLE', 'BUNDLE');

-- CreateEnum
CREATE TYPE "PaymentOrderStatus" AS ENUM ('CREATED', 'CHECKOUT_READY', 'PENDING', 'PAID', 'REFUND_PENDING', 'REFUNDED', 'CANCELLED', 'EXPIRED', 'HELD', 'DISPUTED');

-- CreateEnum
CREATE TYPE "PaymentAttemptStatus" AS ENUM ('CREATED', 'CHECKOUT_READY', 'PENDING', 'APPROVED', 'DECLINED', 'CANCELLED', 'EXPIRED', 'HELD', 'ERROR', 'REFUNDED', 'CHARGEBACK');

-- CreateEnum
CREATE TYPE "PaymentWebhookStatus" AS ENUM ('RECEIVED', 'PROCESSING', 'PROCESSED', 'IGNORED', 'FAILED', 'DEAD_LETTER');

-- CreateEnum
CREATE TYPE "EntitlementStatus" AS ENUM ('PURCHASED', 'ACTIVE', 'CONSUMED', 'EXPIRED', 'REFUND_PENDING', 'REFUNDED', 'REVOKED');

-- CreateEnum
CREATE TYPE "PaymentRefundStatus" AS ENUM ('REQUESTED', 'APPROVED', 'SUBMITTED', 'SUCCEEDED', 'REJECTED', 'FAILED');

-- CreateEnum
CREATE TYPE "PaymentRefundKind" AS ENUM ('CUSTOMER_REQUEST', 'DUPLICATE_PAYMENT', 'TECHNICAL_FAILURE');

-- CreateTable
CREATE TABLE "FiatProductVersion" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "displayOrder" INTEGER NOT NULL,
    "status" "FiatProductStatus" NOT NULL DEFAULT 'DRAFT',
    "kind" "FiatProductKind" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "content" JSONB NOT NULL DEFAULT '{}',
    "currency" CHAR(3) NOT NULL,
    "unitAmountMinor" DECIMAL(36,0) NOT NULL,
    "durationSeconds" INTEGER,
    "effectType" TEXT NOT NULL,
    "effectConfig" JSONB NOT NULL DEFAULT '{}',
    "ruleVersion" INTEGER,
    "refundPolicyVersion" TEXT NOT NULL,
    "refundWindowBusinessDays" INTEGER NOT NULL DEFAULT 5,
    "saleStartsAt" TIMESTAMP(3),
    "saleEndsAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "retiredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FiatProductVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentOrder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "productVersionId" TEXT NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "environment" "PaymentEnvironment" NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "externalReference" TEXT NOT NULL,
    "status" "PaymentOrderStatus" NOT NULL DEFAULT 'CREATED',
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "currency" CHAR(3) NOT NULL,
    "unitAmountMinor" DECIMAL(36,0) NOT NULL,
    "totalAmountMinor" DECIMAL(36,0) NOT NULL,
    "productSnapshot" JSONB NOT NULL,
    "termsVersion" TEXT NOT NULL,
    "refundPolicyVersion" TEXT NOT NULL,
    "paidAttemptId" TEXT,
    "checkoutExpiresAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "refundEligibleUntil" TIMESTAMP(3),
    "refundPendingAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "expiredAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentAttempt" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "attemptNo" INTEGER NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "environment" "PaymentEnvironment" NOT NULL,
    "providerIdempotencyKey" TEXT NOT NULL,
    "providerCheckoutId" TEXT,
    "providerPaymentId" TEXT,
    "status" "PaymentAttemptStatus" NOT NULL DEFAULT 'CREATED',
    "providerStatus" TEXT,
    "providerStatusDetail" TEXT,
    "observedAmountMinor" DECIMAL(36,0),
    "observedCurrency" CHAR(3),
    "verificationEvidence" JSONB NOT NULL DEFAULT '{}',
    "checkoutUrl" TEXT,
    "expiresAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "lastProviderSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentWebhookInbox" (
    "id" TEXT NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "environment" "PaymentEnvironment" NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "providerEventId" TEXT,
    "providerObjectId" TEXT,
    "status" "PaymentWebhookStatus" NOT NULL DEFAULT 'RECEIVED',
    "signatureVerifiedAt" TIMESTAMP(3),
    "payloadHash" TEXT NOT NULL,
    "payload" JSONB,
    "orderId" TEXT,
    "attemptId" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "nextRetryAt" TIMESTAMP(3),
    "lockedAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "processedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentWebhookInbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Entitlement" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "status" "EntitlementStatus" NOT NULL DEFAULT 'PURCHASED',
    "activationIdempotencyKey" TEXT,
    "activationRequestHash" TEXT,
    "effectType" TEXT NOT NULL,
    "effectSnapshot" JSONB NOT NULL,
    "effectRef" TEXT,
    "purchasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activatedAt" TIMESTAMP(3),
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),
    "refundPendingAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Entitlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentRefund" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "requestedById" TEXT,
    "provider" "PaymentProvider" NOT NULL,
    "environment" "PaymentEnvironment" NOT NULL,
    "kind" "PaymentRefundKind" NOT NULL,
    "status" "PaymentRefundStatus" NOT NULL DEFAULT 'REQUESTED',
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "amountMinor" DECIMAL(36,0) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "reasonCode" TEXT NOT NULL,
    "reasonDetail" TEXT,
    "providerRefundId" TEXT,
    "providerStatus" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentRefund_pkey" PRIMARY KEY ("id")
);

-- AlterTable: nullable, metadata-only additions; existing miners need no backfill.
ALTER TABLE "UserMiner"
  ADD COLUMN "sourceEntitlementId" TEXT,
  ADD COLUMN "expiresAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "FiatProductVersion_sku_version_key" ON "FiatProductVersion"("sku", "version");
CREATE INDEX "FiatProductVersion_sku_status_idx" ON "FiatProductVersion"("sku", "status");
CREATE INDEX "FiatProductVersion_status_displayOrder_idx" ON "FiatProductVersion"("status", "displayOrder");
CREATE INDEX "FiatProductVersion_status_currency_saleStartsAt_saleEndsAt_idx" ON "FiatProductVersion"("status", "currency", "saleStartsAt", "saleEndsAt");
CREATE UNIQUE INDEX "FiatProductVersion_one_active_sku_key" ON "FiatProductVersion"("sku") WHERE "status" = 'ACTIVE';

CREATE UNIQUE INDEX "PaymentOrder_idempotencyKey_key" ON "PaymentOrder"("idempotencyKey");
CREATE UNIQUE INDEX "PaymentOrder_externalReference_key" ON "PaymentOrder"("externalReference");
CREATE UNIQUE INDEX "PaymentOrder_paidAttemptId_key" ON "PaymentOrder"("paidAttemptId");
CREATE INDEX "PaymentOrder_userId_status_createdAt_idx" ON "PaymentOrder"("userId", "status", "createdAt");
CREATE INDEX "PaymentOrder_provider_environment_status_createdAt_idx" ON "PaymentOrder"("provider", "environment", "status", "createdAt");
CREATE INDEX "PaymentOrder_productVersionId_status_createdAt_idx" ON "PaymentOrder"("productVersionId", "status", "createdAt");

CREATE UNIQUE INDEX "PaymentAttempt_providerIdempotencyKey_key" ON "PaymentAttempt"("providerIdempotencyKey");
CREATE UNIQUE INDEX "PaymentAttempt_orderId_attemptNo_key" ON "PaymentAttempt"("orderId", "attemptNo");
CREATE UNIQUE INDEX "PaymentAttempt_provider_environment_providerCheckoutId_key" ON "PaymentAttempt"("provider", "environment", "providerCheckoutId");
CREATE UNIQUE INDEX "PaymentAttempt_provider_environment_providerPaymentId_key" ON "PaymentAttempt"("provider", "environment", "providerPaymentId");
CREATE INDEX "PaymentAttempt_orderId_status_createdAt_idx" ON "PaymentAttempt"("orderId", "status", "createdAt");

CREATE UNIQUE INDEX "PaymentWebhookInbox_provider_environment_dedupeKey_key" ON "PaymentWebhookInbox"("provider", "environment", "dedupeKey");
CREATE INDEX "PaymentWebhookInbox_status_nextRetryAt_receivedAt_idx" ON "PaymentWebhookInbox"("status", "nextRetryAt", "receivedAt");
CREATE INDEX "PaymentWebhookInbox_provider_environment_providerObjectId_idx" ON "PaymentWebhookInbox"("provider", "environment", "providerObjectId");
CREATE INDEX "PaymentWebhookInbox_orderId_receivedAt_idx" ON "PaymentWebhookInbox"("orderId", "receivedAt");

CREATE UNIQUE INDEX "Entitlement_orderId_key" ON "Entitlement"("orderId");
CREATE UNIQUE INDEX "Entitlement_activationIdempotencyKey_key" ON "Entitlement"("activationIdempotencyKey");
CREATE INDEX "Entitlement_status_purchasedAt_idx" ON "Entitlement"("status", "purchasedAt");

CREATE UNIQUE INDEX "PaymentRefund_attemptId_key" ON "PaymentRefund"("attemptId");
CREATE UNIQUE INDEX "PaymentRefund_idempotencyKey_key" ON "PaymentRefund"("idempotencyKey");
CREATE UNIQUE INDEX "PaymentRefund_provider_environment_providerRefundId_key" ON "PaymentRefund"("provider", "environment", "providerRefundId");
CREATE INDEX "PaymentRefund_orderId_status_createdAt_idx" ON "PaymentRefund"("orderId", "status", "createdAt");
CREATE INDEX "PaymentRefund_provider_environment_status_createdAt_idx" ON "PaymentRefund"("provider", "environment", "status", "createdAt");

CREATE UNIQUE INDEX "UserMiner_sourceEntitlementId_key" ON "UserMiner"("sourceEntitlementId");
CREATE INDEX "UserMiner_userId_status_expiresAt_idx" ON "UserMiner"("userId", "status", "expiresAt");

-- AddForeignKey
ALTER TABLE "FiatProductVersion" ADD CONSTRAINT "FiatProductVersion_ruleVersion_fkey" FOREIGN KEY ("ruleVersion") REFERENCES "EconomicConfigVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentOrder" ADD CONSTRAINT "PaymentOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentOrder" ADD CONSTRAINT "PaymentOrder_productVersionId_fkey" FOREIGN KEY ("productVersionId") REFERENCES "FiatProductVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentAttempt" ADD CONSTRAINT "PaymentAttempt_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "PaymentOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentOrder" ADD CONSTRAINT "PaymentOrder_paidAttemptId_fkey" FOREIGN KEY ("paidAttemptId") REFERENCES "PaymentAttempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentWebhookInbox" ADD CONSTRAINT "PaymentWebhookInbox_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "PaymentOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentWebhookInbox" ADD CONSTRAINT "PaymentWebhookInbox_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "PaymentAttempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Entitlement" ADD CONSTRAINT "Entitlement_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "PaymentOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentRefund" ADD CONSTRAINT "PaymentRefund_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "PaymentOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentRefund" ADD CONSTRAINT "PaymentRefund_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "PaymentAttempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentRefund" ADD CONSTRAINT "PaymentRefund_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "UserMiner" ADD CONSTRAINT "UserMiner_sourceEntitlementId_fkey" FOREIGN KEY ("sourceEntitlementId") REFERENCES "Entitlement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Database-boundary invariants. Cross-table checks use narrow triggers below.
ALTER TABLE "FiatProductVersion"
  ADD CONSTRAINT "FiatProductVersion_economics_check" CHECK (
    "version" >= 1 AND
    "displayOrder" >= 1 AND
    "unitAmountMinor" > 0 AND
    ("durationSeconds" IS NULL OR "durationSeconds" > 0) AND
    "refundWindowBusinessDays" >= 0 AND
    "currency" ~ '^[A-Z]{3}$' AND
    ("saleEndsAt" IS NULL OR "saleStartsAt" IS NULL OR "saleEndsAt" > "saleStartsAt")
  ),
  ADD CONSTRAINT "FiatProductVersion_active_check" CHECK (
    "status" <> 'ACTIVE' OR ("publishedAt" IS NOT NULL AND "ruleVersion" IS NOT NULL)
  );

ALTER TABLE "PaymentOrder"
  ADD CONSTRAINT "PaymentOrder_amounts_check" CHECK (
    "quantity" = 1 AND
    "unitAmountMinor" > 0 AND
    "totalAmountMinor" = "unitAmountMinor" * "quantity" AND
    "currency" ~ '^[A-Z]{3}$'
  ),
  ADD CONSTRAINT "PaymentOrder_state_check" CHECK (
    ("status" NOT IN ('PAID', 'REFUND_PENDING', 'REFUNDED', 'DISPUTED') OR ("paidAttemptId" IS NOT NULL AND "paidAt" IS NOT NULL)) AND
    ("status" <> 'REFUND_PENDING' OR "refundPendingAt" IS NOT NULL) AND
    ("status" <> 'REFUNDED' OR "refundedAt" IS NOT NULL) AND
    ("status" <> 'CANCELLED' OR "cancelledAt" IS NOT NULL) AND
    ("status" <> 'EXPIRED' OR "expiredAt" IS NOT NULL)
  );

ALTER TABLE "PaymentAttempt"
  ADD CONSTRAINT "PaymentAttempt_values_check" CHECK (
    "attemptNo" >= 1 AND
    ("observedAmountMinor" IS NULL OR "observedAmountMinor" >= 0) AND
    ("observedCurrency" IS NULL OR "observedCurrency" ~ '^[A-Z]{3}$')
  ),
  ADD CONSTRAINT "PaymentAttempt_approved_check" CHECK (
    "status" <> 'APPROVED' OR (
      "providerPaymentId" IS NOT NULL AND
      "approvedAt" IS NOT NULL AND
      "observedAmountMinor" IS NOT NULL AND
      "observedCurrency" IS NOT NULL
    )
  );

ALTER TABLE "PaymentWebhookInbox"
  ADD CONSTRAINT "PaymentWebhookInbox_processing_check" CHECK (
    "attemptCount" >= 0 AND
    ("status" NOT IN ('PROCESSED', 'IGNORED') OR "processedAt" IS NOT NULL) AND
    ("status" <> 'PROCESSED' OR "signatureVerifiedAt" IS NOT NULL)
  );

ALTER TABLE "Entitlement"
  ADD CONSTRAINT "Entitlement_interval_check" CHECK (
    ("endsAt" IS NULL OR ("startsAt" IS NOT NULL AND "endsAt" > "startsAt"))
  ),
  ADD CONSTRAINT "Entitlement_state_check" CHECK (
    ("status" <> 'PURCHASED' OR ("activatedAt" IS NULL AND "refundPendingAt" IS NULL AND "refundedAt" IS NULL AND "revokedAt" IS NULL)) AND
    ("status" <> 'ACTIVE' OR ("activatedAt" IS NOT NULL AND "startsAt" IS NOT NULL)) AND
    ("status" <> 'CONSUMED' OR ("activatedAt" IS NOT NULL AND "consumedAt" IS NOT NULL)) AND
    ("status" <> 'EXPIRED' OR ("activatedAt" IS NOT NULL AND "endsAt" IS NOT NULL)) AND
    ("status" <> 'REFUND_PENDING' OR ("activatedAt" IS NULL AND "refundPendingAt" IS NOT NULL)) AND
    ("status" <> 'REFUNDED' OR ("activatedAt" IS NULL AND "refundedAt" IS NOT NULL)) AND
    ("status" <> 'REVOKED' OR "revokedAt" IS NOT NULL)
  );

ALTER TABLE "PaymentRefund"
  ADD CONSTRAINT "PaymentRefund_amount_check" CHECK (
    "amountMinor" > 0 AND "currency" ~ '^[A-Z]{3}$'
  ),
  ADD CONSTRAINT "PaymentRefund_state_check" CHECK (
    ("status" NOT IN ('APPROVED', 'SUBMITTED', 'SUCCEEDED', 'REJECTED') OR "reviewedAt" IS NOT NULL) AND
    ("status" NOT IN ('SUBMITTED', 'SUCCEEDED') OR "submittedAt" IS NOT NULL) AND
    ("status" <> 'SUCCEEDED' OR "completedAt" IS NOT NULL) AND
    ("status" <> 'FAILED' OR "failedAt" IS NOT NULL)
  );

ALTER TABLE "UserMiner"
  ADD CONSTRAINT "UserMiner_purchase_source_check" CHECK (
    NOT ("sourcePurchaseId" IS NOT NULL AND "sourceEntitlementId" IS NOT NULL)
  );

-- Once ordered, an economic product version is immutable. Editorial copy and
-- operational status remain changeable; price/effect changes require version+1.
CREATE FUNCTION "guard_fiat_product_version_economics"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "PaymentOrder" WHERE "productVersionId" = OLD."id") AND (
    NEW."sku" IS DISTINCT FROM OLD."sku" OR
    NEW."version" IS DISTINCT FROM OLD."version" OR
    NEW."displayOrder" IS DISTINCT FROM OLD."displayOrder" OR
    NEW."kind" IS DISTINCT FROM OLD."kind" OR
    NEW."currency" IS DISTINCT FROM OLD."currency" OR
    NEW."unitAmountMinor" IS DISTINCT FROM OLD."unitAmountMinor" OR
    NEW."durationSeconds" IS DISTINCT FROM OLD."durationSeconds" OR
    NEW."effectType" IS DISTINCT FROM OLD."effectType" OR
    NEW."effectConfig" IS DISTINCT FROM OLD."effectConfig" OR
    NEW."ruleVersion" IS DISTINCT FROM OLD."ruleVersion" OR
    NEW."refundPolicyVersion" IS DISTINCT FROM OLD."refundPolicyVersion" OR
    NEW."refundWindowBusinessDays" IS DISTINCT FROM OLD."refundWindowBusinessDays"
  ) THEN
    RAISE EXCEPTION 'Referenced fiat product economics are immutable; publish a new version';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "FiatProductVersion_economics_immutable"
BEFORE UPDATE ON "FiatProductVersion"
FOR EACH ROW EXECUTE FUNCTION "guard_fiat_product_version_economics"();

-- An attempt cannot silently switch provider/environment from its order.
CREATE FUNCTION "guard_payment_attempt_order_identity"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "PaymentOrder"
    WHERE "id" = NEW."orderId"
      AND "provider" = NEW."provider"
      AND "environment" = NEW."environment"
  ) THEN
    RAISE EXCEPTION 'Payment attempt provider/environment does not match its order';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "PaymentAttempt_order_identity"
BEFORE INSERT OR UPDATE OF "orderId", "provider", "environment" ON "PaymentAttempt"
FOR EACH ROW EXECUTE FUNCTION "guard_payment_attempt_order_identity"();

-- Order prices and refund terms are immutable snapshots of one catalog version;
-- the client cannot substitute a currency, amount, or policy version.
CREATE FUNCTION "guard_payment_order_product_snapshot"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "FiatProductVersion"
    WHERE "id" = NEW."productVersionId"
      AND "currency" = NEW."currency"
      AND "unitAmountMinor" = NEW."unitAmountMinor"
      AND "refundPolicyVersion" = NEW."refundPolicyVersion"
  ) THEN
    RAISE EXCEPTION 'Payment order currency, amount, or refund policy does not match its product version';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "PaymentOrder_product_snapshot_guard"
BEFORE INSERT OR UPDATE OF "productVersionId", "currency", "unitAmountMinor", "refundPolicyVersion" ON "PaymentOrder"
FOR EACH ROW EXECUTE FUNCTION "guard_payment_order_product_snapshot"();

-- A paid attempt must be verified and belong to the same order.
CREATE FUNCTION "guard_payment_order_paid_attempt"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."paidAttemptId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "PaymentAttempt"
    WHERE "id" = NEW."paidAttemptId"
      AND "orderId" = NEW."id"
      AND "provider" = NEW."provider"
      AND "environment" = NEW."environment"
      AND "status" = 'APPROVED'
      AND "observedAmountMinor" = NEW."totalAmountMinor"
      AND "observedCurrency" = NEW."currency"
  ) THEN
    RAISE EXCEPTION 'Paid attempt must be approved for the same order, amount and currency';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "PaymentOrder_paid_attempt_guard"
BEFORE INSERT OR UPDATE OF "paidAttemptId", "provider", "environment" ON "PaymentOrder"
FOR EACH ROW EXECUTE FUNCTION "guard_payment_order_paid_attempt"();

-- Fulfillment is exactly-once and can only originate from a paid order.
CREATE FUNCTION "guard_entitlement_paid_order"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "PaymentOrder"
    WHERE "id" = NEW."orderId"
      AND "status" = 'PAID'
      AND "paidAttemptId" IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Entitlement requires a paid order';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "Entitlement_paid_order_guard"
BEFORE INSERT OR UPDATE OF "orderId" ON "Entitlement"
FOR EACH ROW EXECUTE FUNCTION "guard_entitlement_paid_order"();

-- The purchased effect is an immutable snapshot. Runtime state and effectRef
-- may advance, but changing the effect itself requires a new entitlement.
CREATE FUNCTION "guard_entitlement_effect_snapshot"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."effectType" IS DISTINCT FROM OLD."effectType"
     OR NEW."effectSnapshot" IS DISTINCT FROM OLD."effectSnapshot" THEN
    RAISE EXCEPTION 'Entitlement effect snapshots are immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "Entitlement_effect_snapshot_immutable"
BEFORE UPDATE OF "effectType", "effectSnapshot" ON "Entitlement"
FOR EACH ROW EXECUTE FUNCTION "guard_entitlement_effect_snapshot"();

-- Refund records are full-attempt records in the beta and must preserve the
-- provider, environment, amount and currency observed on that attempt.
CREATE FUNCTION "guard_payment_refund_attempt"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "PaymentAttempt"
    WHERE "id" = NEW."attemptId"
      AND "orderId" = NEW."orderId"
      AND "provider" = NEW."provider"
      AND "environment" = NEW."environment"
      AND "providerPaymentId" IS NOT NULL
      AND "observedAmountMinor" = NEW."amountMinor"
      AND "observedCurrency" = NEW."currency"
  ) THEN
    RAISE EXCEPTION 'Refund identity or amount does not match its payment attempt';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "PaymentRefund_attempt_guard"
BEFORE INSERT OR UPDATE OF "orderId", "attemptId", "provider", "environment", "amountMinor", "currency" ON "PaymentRefund"
FOR EACH ROW EXECUTE FUNCTION "guard_payment_refund_attempt"();

-- A miner created from fiat inventory must belong to the purchaser who owns
-- the entitlement; cross-account attachment is rejected at the DB boundary.
CREATE FUNCTION "guard_user_miner_entitlement_owner"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."sourceEntitlementId" IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM "Entitlement" AS entitlement
    JOIN "PaymentOrder" AS payment_order
      ON payment_order."id" = entitlement."orderId"
    WHERE entitlement."id" = NEW."sourceEntitlementId"
      AND payment_order."userId" = NEW."userId"
  ) THEN
    RAISE EXCEPTION 'Miner and source entitlement must belong to the same user';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "UserMiner_entitlement_owner_guard"
BEFORE INSERT OR UPDATE OF "sourceEntitlementId", "userId" ON "UserMiner"
FOR EACH ROW EXECUTE FUNCTION "guard_user_miner_entitlement_owner"();

-- Seed the approved document catalog. These records are visible inventory,
-- never an authorization to charge: 3 beta miners are PAUSED and every other
-- product is COMING_SOON.
WITH active_config AS (
  SELECT "id"
  FROM "EconomicConfigVersion"
  WHERE "status" = 'ACTIVE'
  ORDER BY "id" DESC
  LIMIT 1
), catalog_seed(
  "id", "sku", "version", "displayOrder", "status", "kind", "name", "description", "content",
  "currency", "unitAmountMinor", "durationSeconds", "effectType", "effectConfig"
) AS (
  VALUES
    ('10000000-0000-4000-8000-000000000001', 'BOOST_ENERGY_DROP', 1, 1, 'COMING_SOON'::"FiatProductStatus", 'CONSUMABLE'::"FiatProductKind", 'Energy Drop', 'Entrega 100 unidades de energía al activarse.', '{"es":{"duration":"Uso inmediato","effect":"+100 unidades de energía"},"en":{"duration":"Immediate use","effect":"+100 energy units"}}'::jsonb, 'COP', 3900, NULL::integer, 'MINING_ENERGY_CREDIT', '{"energyUnits":100,"activation":"USER_INITIATED"}'::jsonb),
    ('10000000-0000-4000-8000-000000000002', 'BOOST_REPAIR_KIT', 1, 2, 'COMING_SOON'::"FiatProductStatus", 'CONSUMABLE'::"FiatProductKind", 'Repair Kit', 'Entrega 25 puntos de durabilidad al activarse.', '{"es":{"duration":"Uso inmediato","effect":"+25 puntos de durabilidad"},"en":{"duration":"Immediate use","effect":"+25 durability points"}}'::jsonb, 'COP', 4900, NULL::integer, 'MINER_REPAIR_CREDIT', '{"durabilityPoints":25,"activation":"USER_INITIATED"}'::jsonb),
    ('10000000-0000-4000-8000-000000000003', 'BOOST_QUICK_CLAIM', 1, 3, 'COMING_SOON'::"FiatProductStatus", 'BOOST'::"FiatProductKind", 'Quick Claim', 'Reduce 20% el cooldown del faucet durante 24 horas.', '{"es":{"duration":"24 horas","effect":"-20% cooldown del faucet"},"en":{"duration":"24 hours","effect":"-20% faucet cooldown"}}'::jsonb, 'COP', 5900, 86400, 'FAUCET_COOLDOWN_BOOST', '{"cooldownReductionBps":2000,"activation":"USER_INITIATED"}'::jsonb),
    ('10000000-0000-4000-8000-000000000004', 'BOOST_GAME_PULSE', 1, 4, 'COMING_SOON'::"FiatProductStatus", 'BOOST'::"FiatProductKind", 'Game Pulse', 'Aumenta 15% las recompensas válidas de juegos durante 24 horas.', '{"es":{"duration":"24 horas","effect":"+15% recompensas válidas de juegos"},"en":{"duration":"24 hours","effect":"+15% valid game rewards"}}'::jsonb, 'COP', 6900, 86400, 'GAME_REWARD_BOOST', '{"rewardBonusBps":1500,"activation":"USER_INITIATED"}'::jsonb),
    ('10000000-0000-4000-8000-000000000005', 'BOOST_HASH_SPARK', 1, 5, 'COMING_SOON'::"FiatProductStatus", 'BOOST'::"FiatProductKind", 'Hash Spark', 'Aumenta 20% el hashpower durante 24 horas.', '{"es":{"duration":"24 horas","effect":"+20% hashpower"},"en":{"duration":"24 hours","effect":"+20% hashpower"}}'::jsonb, 'COP', 7900, 86400, 'MINING_HASH_BOOST', '{"hashBonusBps":2000,"activation":"USER_INITIATED"}'::jsonb),
    ('10000000-0000-4000-8000-000000000006', 'BOOST_HASH_SURGE', 1, 6, 'COMING_SOON'::"FiatProductStatus", 'BOOST'::"FiatProductKind", 'Hash Surge', 'Aumenta 50% el hashpower durante 24 horas.', '{"es":{"duration":"24 horas","effect":"+50% hashpower"},"en":{"duration":"24 hours","effect":"+50% hashpower"}}'::jsonb, 'COP', 14900, 86400, 'MINING_HASH_BOOST', '{"hashBonusBps":5000,"activation":"USER_INITIATED"}'::jsonb),
    ('10000000-0000-4000-8000-000000000007', 'BOOST_MINING_WEEK', 1, 7, 'COMING_SOON'::"FiatProductStatus", 'BOOST'::"FiatProductKind", 'Mining Week', 'Aumenta 25% el hashpower durante siete días.', '{"es":{"duration":"7 días","effect":"+25% hashpower"},"en":{"duration":"7 days","effect":"+25% hashpower"}}'::jsonb, 'COP', 29900, 604800, 'MINING_HASH_BOOST', '{"hashBonusBps":2500,"activation":"USER_INITIATED"}'::jsonb),
    ('10000000-0000-4000-8000-000000000008', 'BOOST_FULL_ACCELERATOR', 1, 8, 'COMING_SOON'::"FiatProductStatus", 'BUNDLE'::"FiatProductKind", 'Full Accelerator', 'Combina hashpower, cooldown y energía diaria durante siete días.', '{"es":{"duration":"7 días","effect":"+20% hashpower, -15% cooldown y +100 energía diaria"},"en":{"duration":"7 days","effect":"+20% hashpower, -15% cooldown and +100 daily energy"}}'::jsonb, 'COP', 39900, 604800, 'MULTI_EFFECT_BUNDLE', '{"hashBonusBps":2000,"cooldownReductionBps":1500,"dailyEnergyUnits":100,"activation":"USER_INITIATED"}'::jsonb),
    ('10000000-0000-4000-8000-000000000009', 'MINER_DRIPPER_MINI', 1, 9, 'PAUSED'::"FiatProductStatus", 'MINER'::"FiatProductKind", 'Dripper Mini', 'Minero virtual temporal anunciado con 0,25 MH/s.', '{"es":{"duration":"30 días","effect":"0,25 MH/s"},"en":{"duration":"30 days","effect":"0.25 MH/s"}}'::jsonb, 'COP', 19900, 2592000, 'VIRTUAL_MINER', '{"advertisedHashRateMilliMh":250,"runtimeMappingRequired":true,"activation":"USER_INITIATED"}'::jsonb),
    ('10000000-0000-4000-8000-000000000010', 'MINER_FLOW_ONE', 1, 10, 'PAUSED'::"FiatProductStatus", 'MINER'::"FiatProductKind", 'Flow One', 'Minero virtual temporal anunciado con 0,75 MH/s.', '{"es":{"duration":"30 días","effect":"0,75 MH/s"},"en":{"duration":"30 days","effect":"0.75 MH/s"}}'::jsonb, 'COP', 49900, 2592000, 'VIRTUAL_MINER', '{"advertisedHashRateMilliMh":750,"runtimeMappingRequired":true,"activation":"USER_INITIATED"}'::jsonb),
    ('10000000-0000-4000-8000-000000000011', 'MINER_AQUA_RIG', 1, 11, 'PAUSED'::"FiatProductStatus", 'MINER'::"FiatProductKind", 'Aqua Rig', 'Minero virtual temporal anunciado con 2 MH/s.', '{"es":{"duration":"60 días","effect":"2 MH/s"},"en":{"duration":"60 days","effect":"2 MH/s"}}'::jsonb, 'COP', 119900, 5184000, 'VIRTUAL_MINER', '{"advertisedHashRateMilliMh":2000,"runtimeMappingRequired":true,"activation":"USER_INITIATED"}'::jsonb),
    ('10000000-0000-4000-8000-000000000012', 'MINER_ZYXE_CORE', 1, 12, 'COMING_SOON'::"FiatProductStatus", 'MINER'::"FiatProductKind", 'Zyxe Core', 'Minero virtual temporal anunciado con 5 MH/s.', '{"es":{"duration":"90 días","effect":"5 MH/s"},"en":{"duration":"90 days","effect":"5 MH/s"}}'::jsonb, 'COP', 249900, 7776000, 'VIRTUAL_MINER', '{"advertisedHashRateMilliMh":5000,"runtimeMappingRequired":true,"activation":"USER_INITIATED"}'::jsonb),
    ('10000000-0000-4000-8000-000000000013', 'MINER_NEON_FORGE', 1, 13, 'COMING_SOON'::"FiatProductStatus", 'MINER'::"FiatProductKind", 'Neon Forge', 'Minero virtual temporal anunciado con 12 MH/s.', '{"es":{"duration":"180 días","effect":"12 MH/s"},"en":{"duration":"180 days","effect":"12 MH/s"}}'::jsonb, 'COP', 549900, 15552000, 'VIRTUAL_MINER', '{"advertisedHashRateMilliMh":12000,"runtimeMappingRequired":true,"activation":"USER_INITIATED"}'::jsonb)
)
INSERT INTO "FiatProductVersion" (
  "id", "sku", "version", "displayOrder", "status", "kind", "name", "description", "content",
  "currency", "unitAmountMinor", "durationSeconds", "effectType", "effectConfig",
  "ruleVersion", "refundPolicyVersion", "refundWindowBusinessDays", "publishedAt"
)
SELECT
  seed."id", seed."sku", seed."version", seed."displayOrder", seed."status", seed."kind", seed."name",
  seed."description", seed."content", seed."currency", seed."unitAmountMinor",
  seed."durationSeconds", seed."effectType", seed."effectConfig",
  (SELECT "id" FROM active_config), 'fiat-beta-2026-07-13', 5,
  TIMESTAMP '2026-07-13 00:00:00'
FROM catalog_seed AS seed
ON CONFLICT ("sku", "version") DO UPDATE SET
  "status" = EXCLUDED."status",
  "displayOrder" = EXCLUDED."displayOrder",
  "kind" = EXCLUDED."kind",
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "content" = EXCLUDED."content",
  "currency" = EXCLUDED."currency",
  "unitAmountMinor" = EXCLUDED."unitAmountMinor",
  "durationSeconds" = EXCLUDED."durationSeconds",
  "effectType" = EXCLUDED."effectType",
  "effectConfig" = EXCLUDED."effectConfig",
  "ruleVersion" = EXCLUDED."ruleVersion",
  "refundPolicyVersion" = EXCLUDED."refundPolicyVersion",
  "refundWindowBusinessDays" = EXCLUDED."refundWindowBusinessDays",
  "publishedAt" = EXCLUDED."publishedAt";

-- Migration-time negative proof: a forged amount for a real product version
-- must be rejected by the PaymentOrder snapshot trigger. A temporary relation
-- keeps this test independent from user/auth seed data and leaves no rows.
CREATE TEMPORARY TABLE "_PaymentOrderProductGuardTest" (
  "productVersionId" TEXT NOT NULL,
  "currency" CHAR(3) NOT NULL,
  "unitAmountMinor" DECIMAL(36,0) NOT NULL,
  "refundPolicyVersion" TEXT NOT NULL
);

CREATE TRIGGER "PaymentOrder_product_snapshot_negative_test_trigger"
BEFORE INSERT ON "_PaymentOrderProductGuardTest"
FOR EACH ROW EXECUTE FUNCTION "guard_payment_order_product_snapshot"();

DO $negative_test$
DECLARE
  rejected BOOLEAN := false;
BEGIN
  BEGIN
    INSERT INTO "_PaymentOrderProductGuardTest" (
      "productVersionId", "currency", "unitAmountMinor", "refundPolicyVersion"
    ) VALUES (
      '10000000-0000-4000-8000-000000000001', 'COP', 3901, 'fiat-beta-2026-07-13'
    );
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'Payment order currency, amount, or refund policy does not match its product version' THEN
      rejected := true;
    ELSE
      RAISE;
    END IF;
  END;

  IF NOT rejected THEN
    RAISE EXCEPTION 'Negative PaymentOrder product snapshot test unexpectedly succeeded';
  END IF;
END;
$negative_test$;

DROP TABLE "_PaymentOrderProductGuardTest";
