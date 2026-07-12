-- CreateEnum
CREATE TYPE "StorePurchaseStatus" AS ENUM ('POSTED', 'REJECTED', 'REVERSED', 'REVERSAL_PENDING');

-- CreateEnum
CREATE TYPE "MinerStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "MinerActionKind" AS ENUM ('UPGRADE', 'REPAIR');

-- CreateEnum
CREATE TYPE "MinerActionStatus" AS ENUM ('POSTED', 'REJECTED', 'REVERSAL_PENDING');

-- CreateEnum
CREATE TYPE "MiningEpochStatus" AS ENUM ('OPEN', 'BLOCKED', 'SETTLED', 'REVERSED');

-- CreateEnum
CREATE TYPE "MiningPayoutStatus" AS ENUM ('POSTED', 'REJECTED', 'REVERSED');

-- CreateTable
CREATE TABLE "StorePurchase" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" "StorePurchaseStatus" NOT NULL DEFAULT 'POSTED',
    "priceMinor" DECIMAL(36,0) NOT NULL,
    "availableDebitMinor" DECIMAL(36,0) NOT NULL,
    "promotionalDebitMinor" DECIMAL(36,0) NOT NULL,
    "burnMinor" DECIMAL(36,0) NOT NULL,
    "recycleMinor" DECIMAL(36,0) NOT NULL,
    "treasuryMinor" DECIMAL(36,0) NOT NULL,
    "effectType" TEXT NOT NULL,
    "effectRef" TEXT,
    "evidence" JSONB NOT NULL DEFAULT '{}',
    "ruleVersion" INTEGER NOT NULL,
    "periodDate" DATE NOT NULL,
    "transactionId" TEXT,
    "postedAt" TIMESTAMP(3),
    "reversedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StorePurchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MiningProfile" (
    "userId" TEXT NOT NULL,
    "energyCreditMillis" DECIMAL(36,0) NOT NULL,
    "lastCheckpointAt" TIMESTAMP(3) NOT NULL,
    "boostExpiresAt" TIMESTAMP(3),
    "repairKitCount" INTEGER NOT NULL DEFAULT 0,
    "ruleVersion" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MiningProfile_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "UserMiner" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "status" "MinerStatus" NOT NULL DEFAULT 'ACTIVE',
    "slot" INTEGER NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "hashRate" INTEGER NOT NULL,
    "energyPerHour" INTEGER NOT NULL,
    "efficiencyBps" INTEGER NOT NULL,
    "durabilityBps" INTEGER NOT NULL DEFAULT 10000,
    "ruleVersion" INTEGER NOT NULL,
    "sourcePurchaseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserMiner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MinerAction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "minerId" TEXT NOT NULL,
    "kind" "MinerActionKind" NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" "MinerActionStatus" NOT NULL DEFAULT 'POSTED',
    "costMinor" DECIMAL(36,0) NOT NULL,
    "levelBefore" INTEGER NOT NULL,
    "levelAfter" INTEGER NOT NULL,
    "durabilityBefore" INTEGER NOT NULL,
    "durabilityAfter" INTEGER NOT NULL,
    "formula" JSONB NOT NULL DEFAULT '{}',
    "ruleVersion" INTEGER NOT NULL,
    "transactionId" TEXT,
    "postedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MinerAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MiningContribution" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "periodDate" DATE NOT NULL,
    "hashMillis" DECIMAL(36,0) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MiningContribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MiningEpoch" (
    "periodDate" DATE NOT NULL,
    "status" "MiningEpochStatus" NOT NULL DEFAULT 'OPEN',
    "ruleVersion" INTEGER NOT NULL,
    "configuredMinor" DECIMAL(36,0) NOT NULL,
    "distributableMinor" DECIMAL(36,0) NOT NULL,
    "allocatedMinor" DECIMAL(36,0) NOT NULL,
    "residueMinor" DECIMAL(36,0) NOT NULL,
    "totalHashMillis" DECIMAL(36,0) NOT NULL,
    "reasonCode" TEXT,
    "settlementKey" TEXT,
    "transactionId" TEXT,
    "settledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MiningEpoch_pkey" PRIMARY KEY ("periodDate")
);

-- CreateTable
CREATE TABLE "MiningPayout" (
    "id" TEXT NOT NULL,
    "periodDate" DATE NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "MiningPayoutStatus" NOT NULL DEFAULT 'POSTED',
    "hashMillis" DECIMAL(36,0) NOT NULL,
    "rewardMinor" DECIMAL(36,0) NOT NULL,
    "transactionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reversedAt" TIMESTAMP(3),

    CONSTRAINT "MiningPayout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StorePurchase_idempotencyKey_key" ON "StorePurchase"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "StorePurchase_transactionId_key" ON "StorePurchase"("transactionId");

-- CreateIndex
CREATE INDEX "StorePurchase_userId_periodDate_productId_status_idx" ON "StorePurchase"("userId", "periodDate", "productId", "status");

-- CreateIndex
CREATE INDEX "StorePurchase_ruleVersion_periodDate_status_idx" ON "StorePurchase"("ruleVersion", "periodDate", "status");

-- CreateIndex
CREATE INDEX "UserMiner_userId_status_createdAt_idx" ON "UserMiner"("userId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserMiner_sourcePurchaseId_key" ON "UserMiner"("sourcePurchaseId");

-- CreateIndex
CREATE UNIQUE INDEX "UserMiner_userId_slot_key" ON "UserMiner"("userId", "slot");

-- CreateIndex
CREATE UNIQUE INDEX "MinerAction_idempotencyKey_key" ON "MinerAction"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "MinerAction_transactionId_key" ON "MinerAction"("transactionId");

-- CreateIndex
CREATE INDEX "MinerAction_userId_minerId_createdAt_idx" ON "MinerAction"("userId", "minerId", "createdAt");

-- CreateIndex
CREATE INDEX "MiningContribution_periodDate_hashMillis_idx" ON "MiningContribution"("periodDate", "hashMillis");

-- CreateIndex
CREATE UNIQUE INDEX "MiningContribution_userId_periodDate_key" ON "MiningContribution"("userId", "periodDate");

-- CreateIndex
CREATE UNIQUE INDEX "MiningEpoch_settlementKey_key" ON "MiningEpoch"("settlementKey");

-- CreateIndex
CREATE UNIQUE INDEX "MiningEpoch_transactionId_key" ON "MiningEpoch"("transactionId");

-- CreateIndex
CREATE INDEX "MiningPayout_userId_periodDate_status_idx" ON "MiningPayout"("userId", "periodDate", "status");

-- CreateIndex
CREATE INDEX "MiningPayout_transactionId_status_idx" ON "MiningPayout"("transactionId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MiningPayout_periodDate_userId_key" ON "MiningPayout"("periodDate", "userId");

-- AddForeignKey
ALTER TABLE "StorePurchase" ADD CONSTRAINT "StorePurchase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorePurchase" ADD CONSTRAINT "StorePurchase_ruleVersion_fkey" FOREIGN KEY ("ruleVersion") REFERENCES "EconomicConfigVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorePurchase" ADD CONSTRAINT "StorePurchase_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "LedgerTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MiningProfile" ADD CONSTRAINT "MiningProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MiningProfile" ADD CONSTRAINT "MiningProfile_ruleVersion_fkey" FOREIGN KEY ("ruleVersion") REFERENCES "EconomicConfigVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserMiner" ADD CONSTRAINT "UserMiner_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserMiner" ADD CONSTRAINT "UserMiner_ruleVersion_fkey" FOREIGN KEY ("ruleVersion") REFERENCES "EconomicConfigVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserMiner" ADD CONSTRAINT "UserMiner_sourcePurchaseId_fkey" FOREIGN KEY ("sourcePurchaseId") REFERENCES "StorePurchase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MinerAction" ADD CONSTRAINT "MinerAction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MinerAction" ADD CONSTRAINT "MinerAction_minerId_fkey" FOREIGN KEY ("minerId") REFERENCES "UserMiner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MinerAction" ADD CONSTRAINT "MinerAction_ruleVersion_fkey" FOREIGN KEY ("ruleVersion") REFERENCES "EconomicConfigVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MinerAction" ADD CONSTRAINT "MinerAction_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "LedgerTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MiningContribution" ADD CONSTRAINT "MiningContribution_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MiningContribution" ADD CONSTRAINT "MiningContribution_periodDate_fkey" FOREIGN KEY ("periodDate") REFERENCES "MiningEpoch"("periodDate") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MiningEpoch" ADD CONSTRAINT "MiningEpoch_ruleVersion_fkey" FOREIGN KEY ("ruleVersion") REFERENCES "EconomicConfigVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MiningEpoch" ADD CONSTRAINT "MiningEpoch_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "LedgerTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MiningPayout" ADD CONSTRAINT "MiningPayout_periodDate_fkey" FOREIGN KEY ("periodDate") REFERENCES "MiningEpoch"("periodDate") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MiningPayout" ADD CONSTRAINT "MiningPayout_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MiningPayout" ADD CONSTRAINT "MiningPayout_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "LedgerTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Economic invariants are enforced at the database boundary as a final guard.
ALTER TABLE "StorePurchase"
  ADD CONSTRAINT "StorePurchase_amounts_check" CHECK (
    "priceMinor" > 0 AND
    "availableDebitMinor" >= 0 AND "promotionalDebitMinor" >= 0 AND
    "availableDebitMinor" + "promotionalDebitMinor" = "priceMinor" AND
    "burnMinor" >= 0 AND "recycleMinor" >= 0 AND "treasuryMinor" >= 0 AND
    "burnMinor" + "recycleMinor" + "treasuryMinor" = "priceMinor"
  ),
  ADD CONSTRAINT "StorePurchase_posted_transaction_check" CHECK (
    "status" <> 'POSTED' OR ("transactionId" IS NOT NULL AND "postedAt" IS NOT NULL)
  );

ALTER TABLE "MiningProfile"
  ADD CONSTRAINT "MiningProfile_energy_inventory_check" CHECK (
    "energyCreditMillis" >= 0 AND "repairKitCount" >= 0
  );

ALTER TABLE "UserMiner"
  ADD CONSTRAINT "UserMiner_snapshot_check" CHECK (
    "slot" BETWEEN 1 AND 4 AND "level" >= 1 AND "hashRate" > 0 AND "energyPerHour" > 0 AND
    "efficiencyBps" BETWEEN 1 AND 10000 AND
    "durabilityBps" BETWEEN 0 AND 10000
  );

ALTER TABLE "MinerAction"
  ADD CONSTRAINT "MinerAction_snapshot_check" CHECK (
    "costMinor" >= 0 AND "levelBefore" >= 1 AND "levelAfter" >= 1 AND
    "durabilityBefore" BETWEEN 0 AND 10000 AND
    "durabilityAfter" BETWEEN 0 AND 10000
  ),
  ADD CONSTRAINT "MinerAction_posted_transaction_check" CHECK (
    "status" <> 'POSTED' OR (
      "postedAt" IS NOT NULL AND (
        ("costMinor" = 0 AND "kind" = 'REPAIR' AND "transactionId" IS NULL) OR
        ("costMinor" > 0 AND "transactionId" IS NOT NULL)
      )
    )
  );

ALTER TABLE "MiningContribution"
  ADD CONSTRAINT "MiningContribution_hash_check" CHECK ("hashMillis" >= 0);

ALTER TABLE "MiningEpoch"
  ADD CONSTRAINT "MiningEpoch_economics_check" CHECK (
    "configuredMinor" >= 0 AND "distributableMinor" >= 0 AND
    "allocatedMinor" >= 0 AND "residueMinor" >= 0 AND
    "totalHashMillis" >= 0 AND
    "distributableMinor" <= "configuredMinor" AND
    "allocatedMinor" + "residueMinor" = "distributableMinor"
  ),
  ADD CONSTRAINT "MiningEpoch_state_check" CHECK (
    ("status" = 'SETTLED' AND "settlementKey" IS NOT NULL AND "settledAt" IS NOT NULL AND (
      ("allocatedMinor" = 0 AND "transactionId" IS NULL) OR
      ("allocatedMinor" > 0 AND "transactionId" IS NOT NULL)
    )) OR
    ("status" = 'REVERSED' AND "settlementKey" IS NOT NULL AND "transactionId" IS NOT NULL AND "settledAt" IS NOT NULL) OR
    ("status" IN ('OPEN', 'BLOCKED') AND "transactionId" IS NULL AND "settledAt" IS NULL)
  );

ALTER TABLE "MiningPayout"
  ADD CONSTRAINT "MiningPayout_amounts_check" CHECK (
    "hashMillis" > 0 AND "rewardMinor" > 0
  );
