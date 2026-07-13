-- CreateEnum
CREATE TYPE "MonetizableActivityStatus" AS ENUM ('QUALIFIED', 'REVERSAL_PENDING', 'REVERSED');

-- CreateEnum
CREATE TYPE "ReferralCommissionStatus" AS ENUM ('PENDING', 'AVAILABLE', 'CAPPED', 'HELD', 'REVERSED', 'CLAWBACK_PENDING');

-- CreateTable
CREATE TABLE "ReferralProfile" (
    "userId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferralProfile_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "ReferralEdge" (
    "id" TEXT NOT NULL,
    "sponsorId" TEXT NOT NULL,
    "referredUserId" TEXT NOT NULL,
    "codeSnapshot" TEXT NOT NULL,
    "attributionEvidence" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferralEdge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferralAncestor" (
    "descendantId" TEXT NOT NULL,
    "ancestorId" TEXT NOT NULL,
    "depth" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferralAncestor_pkey" PRIMARY KEY ("descendantId","depth")
);

-- CreateTable
CREATE TABLE "MonetizableActivity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" "MonetizableActivityStatus" NOT NULL DEFAULT 'QUALIFIED',
    "baseMinor" DECIMAL(36,0) NOT NULL,
    "evidence" JSONB NOT NULL DEFAULT '{}',
    "ruleVersion" INTEGER NOT NULL,
    "qualifiedAt" TIMESTAMP(3) NOT NULL,
    "reversedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MonetizableActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferralCommission" (
    "id" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "beneficiaryId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "rateBps" INTEGER NOT NULL,
    "baseMinor" DECIMAL(36,0) NOT NULL,
    "rewardMinor" DECIMAL(36,0) NOT NULL,
    "status" "ReferralCommissionStatus" NOT NULL DEFAULT 'PENDING',
    "capMonth" TEXT NOT NULL,
    "ruleVersion" INTEGER NOT NULL,
    "pendingTransactionId" TEXT,
    "releaseTransactionId" TEXT,
    "clawbackTransactionId" TEXT,
    "availableAt" TIMESTAMP(3),
    "reversedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferralCommission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReferralProfile_code_key" ON "ReferralProfile"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ReferralEdge_referredUserId_key" ON "ReferralEdge"("referredUserId");

-- CreateIndex
CREATE INDEX "ReferralEdge_sponsorId_createdAt_idx" ON "ReferralEdge"("sponsorId", "createdAt");

-- CreateIndex
CREATE INDEX "ReferralAncestor_ancestorId_depth_createdAt_idx" ON "ReferralAncestor"("ancestorId", "depth", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReferralAncestor_descendantId_ancestorId_key" ON "ReferralAncestor"("descendantId", "ancestorId");

-- CreateIndex
CREATE UNIQUE INDEX "MonetizableActivity_idempotencyKey_key" ON "MonetizableActivity"("idempotencyKey");

-- CreateIndex
CREATE INDEX "MonetizableActivity_userId_status_qualifiedAt_idx" ON "MonetizableActivity"("userId", "status", "qualifiedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MonetizableActivity_sourceType_sourceId_key" ON "MonetizableActivity"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "ReferralCommission_beneficiaryId_status_createdAt_idx" ON "ReferralCommission"("beneficiaryId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ReferralCommission_capMonth_beneficiaryId_status_idx" ON "ReferralCommission"("capMonth", "beneficiaryId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ReferralCommission_activityId_beneficiaryId_key" ON "ReferralCommission"("activityId", "beneficiaryId");

-- AddForeignKey
ALTER TABLE "ReferralProfile" ADD CONSTRAINT "ReferralProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralEdge" ADD CONSTRAINT "ReferralEdge_sponsorId_fkey" FOREIGN KEY ("sponsorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralEdge" ADD CONSTRAINT "ReferralEdge_referredUserId_fkey" FOREIGN KEY ("referredUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralAncestor" ADD CONSTRAINT "ReferralAncestor_descendantId_fkey" FOREIGN KEY ("descendantId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralAncestor" ADD CONSTRAINT "ReferralAncestor_ancestorId_fkey" FOREIGN KEY ("ancestorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonetizableActivity" ADD CONSTRAINT "MonetizableActivity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonetizableActivity" ADD CONSTRAINT "MonetizableActivity_ruleVersion_fkey" FOREIGN KEY ("ruleVersion") REFERENCES "EconomicConfigVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralCommission" ADD CONSTRAINT "ReferralCommission_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "MonetizableActivity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralCommission" ADD CONSTRAINT "ReferralCommission_beneficiaryId_fkey" FOREIGN KEY ("beneficiaryId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralCommission" ADD CONSTRAINT "ReferralCommission_ruleVersion_fkey" FOREIGN KEY ("ruleVersion") REFERENCES "EconomicConfigVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralCommission" ADD CONSTRAINT "ReferralCommission_pendingTransactionId_fkey" FOREIGN KEY ("pendingTransactionId") REFERENCES "LedgerTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralCommission" ADD CONSTRAINT "ReferralCommission_releaseTransactionId_fkey" FOREIGN KEY ("releaseTransactionId") REFERENCES "LedgerTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralCommission" ADD CONSTRAINT "ReferralCommission_clawbackTransactionId_fkey" FOREIGN KEY ("clawbackTransactionId") REFERENCES "LedgerTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Immutable graph and economic projection invariants.
ALTER TABLE "ReferralProfile"
  ADD CONSTRAINT "ReferralProfile_code_check" CHECK ("code" ~ '^FZ-[A-Z2-9]{8,16}$');

ALTER TABLE "ReferralEdge"
  ADD CONSTRAINT "ReferralEdge_no_self_check" CHECK ("sponsorId" <> "referredUserId");

ALTER TABLE "ReferralAncestor"
  ADD CONSTRAINT "ReferralAncestor_depth_check" CHECK (
    "depth" BETWEEN 1 AND 4 AND "ancestorId" <> "descendantId"
  );

ALTER TABLE "MonetizableActivity"
  ADD CONSTRAINT "MonetizableActivity_amount_check" CHECK ("baseMinor" > 0),
  ADD CONSTRAINT "MonetizableActivity_state_check" CHECK (
    ("status" = 'QUALIFIED' AND "reversedAt" IS NULL) OR
    ("status" = 'REVERSAL_PENDING' AND "reversedAt" IS NULL) OR
    ("status" = 'REVERSED' AND "reversedAt" IS NOT NULL)
  );

ALTER TABLE "ReferralCommission"
  ADD CONSTRAINT "ReferralCommission_amount_check" CHECK (
    "level" BETWEEN 1 AND 4 AND "rateBps" BETWEEN 0 AND 10000 AND
    "baseMinor" > 0 AND "rewardMinor" >= 0 AND "rewardMinor" <= "baseMinor" AND
    "capMonth" ~ '^[0-9]{4}-[0-9]{2}$'
  ),
  ADD CONSTRAINT "ReferralCommission_state_check" CHECK (
    ("status" = 'PENDING' AND "rewardMinor" > 0 AND "pendingTransactionId" IS NOT NULL) OR
    ("status" = 'AVAILABLE' AND "rewardMinor" > 0 AND "pendingTransactionId" IS NOT NULL AND "releaseTransactionId" IS NOT NULL AND "availableAt" IS NOT NULL) OR
    ("status" = 'CAPPED' AND "rewardMinor" = 0 AND "pendingTransactionId" IS NULL AND "releaseTransactionId" IS NULL AND "clawbackTransactionId" IS NULL) OR
    ("status" = 'REVERSED' AND "reversedAt" IS NOT NULL AND ("rewardMinor" = 0 OR "clawbackTransactionId" IS NOT NULL)) OR
    ("status" IN ('HELD', 'CLAWBACK_PENDING'))
  );
