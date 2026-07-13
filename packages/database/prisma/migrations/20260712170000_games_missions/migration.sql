CREATE TYPE "GameKind" AS ENUM ('TAP_MINER', 'MEMORY_DROPS');
CREATE TYPE "GameSessionStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'HELD', 'REJECTED', 'EXPIRED', 'ABORTED');

CREATE TABLE "GameEnergy" (
    "userId" TEXT NOT NULL,
    "current" INTEGER NOT NULL,
    "regeneratedAt" TIMESTAMP(3) NOT NULL,
    "ruleVersion" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GameEnergy_pkey" PRIMARY KEY ("userId"),
    CONSTRAINT "GameEnergy_current_check" CHECK ("current" >= 0 AND "current" <= 100)
);

CREATE TABLE "GameSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "game" "GameKind" NOT NULL,
    "status" "GameSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "creationKey" TEXT NOT NULL,
    "completionKey" TEXT,
    "nonce" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "ruleVersion" INTEGER NOT NULL,
    "budgetDate" DATE NOT NULL,
    "energyCost" INTEGER NOT NULL,
    "nextSequence" INTEGER NOT NULL DEFAULT 1,
    "lastEventAtMs" INTEGER NOT NULL DEFAULT -1,
    "eventCount" INTEGER NOT NULL DEFAULT 0,
    "score" INTEGER NOT NULL DEFAULT 0,
    "state" JSONB NOT NULL DEFAULT '{}',
    "layout" JSONB,
    "rewardMinor" DECIMAL(36,0),
    "transactionId" TEXT,
    "reasonCode" TEXT,
    "deviceId" TEXT NOT NULL,
    "ipHash" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GameSession_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "GameSession_energyCost_check" CHECK ("energyCost" >= 0),
    CONSTRAINT "GameSession_sequence_check" CHECK ("nextSequence" >= 1 AND "eventCount" >= 0 AND "score" >= 0),
    CONSTRAINT "GameSession_reward_check" CHECK ("rewardMinor" IS NULL OR "rewardMinor" >= 0)
);

CREATE TABLE "GameEvent" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "eventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "atMs" INTEGER NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GameEvent_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "GameEvent_sequence_time_check" CHECK ("sequence" >= 1 AND "atMs" >= 0)
);

CREATE TABLE "MissionClaim" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "missionId" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "progress" DECIMAL(36,0) NOT NULL,
    "target" DECIMAL(36,0) NOT NULL,
    "rewardMinor" DECIMAL(36,0) NOT NULL,
    "ruleVersion" INTEGER NOT NULL,
    "transactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MissionClaim_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "MissionClaim_amounts_check" CHECK ("progress" >= 0 AND "target" > 0 AND "rewardMinor" >= 0),
    CONSTRAINT "MissionClaim_status_check" CHECK ("status" IN ('POSTED', 'REJECTED'))
);

CREATE UNIQUE INDEX "GameSession_creationKey_key" ON "GameSession"("creationKey");
CREATE UNIQUE INDEX "GameSession_completionKey_key" ON "GameSession"("completionKey");
CREATE UNIQUE INDEX "GameSession_nonce_key" ON "GameSession"("nonce");
CREATE UNIQUE INDEX "GameSession_tokenHash_key" ON "GameSession"("tokenHash");
CREATE UNIQUE INDEX "GameSession_transactionId_key" ON "GameSession"("transactionId");
CREATE INDEX "GameSession_userId_game_budgetDate_status_idx" ON "GameSession"("userId", "game", "budgetDate", "status");
CREATE INDEX "GameSession_deviceId_budgetDate_status_idx" ON "GameSession"("deviceId", "budgetDate", "status");
CREATE INDEX "GameSession_ipHash_budgetDate_status_idx" ON "GameSession"("ipHash", "budgetDate", "status");
CREATE INDEX "GameSession_budgetDate_status_idx" ON "GameSession"("budgetDate", "status");
CREATE UNIQUE INDEX "GameSession_userId_game_active_key" ON "GameSession"("userId", "game") WHERE "status" = 'ACTIVE';
CREATE UNIQUE INDEX "GameEvent_sessionId_sequence_key" ON "GameEvent"("sessionId", "sequence");
CREATE UNIQUE INDEX "GameEvent_sessionId_eventId_key" ON "GameEvent"("sessionId", "eventId");
CREATE INDEX "GameEvent_sessionId_acceptedAt_idx" ON "GameEvent"("sessionId", "acceptedAt");
CREATE UNIQUE INDEX "MissionClaim_idempotencyKey_key" ON "MissionClaim"("idempotencyKey");
CREATE UNIQUE INDEX "MissionClaim_transactionId_key" ON "MissionClaim"("transactionId");
CREATE UNIQUE INDEX "MissionClaim_userId_missionId_periodKey_key" ON "MissionClaim"("userId", "missionId", "periodKey");
CREATE INDEX "MissionClaim_ruleVersion_periodKey_status_idx" ON "MissionClaim"("ruleVersion", "periodKey", "status");

ALTER TABLE "GameEnergy" ADD CONSTRAINT "GameEnergy_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GameEnergy" ADD CONSTRAINT "GameEnergy_ruleVersion_fkey" FOREIGN KEY ("ruleVersion") REFERENCES "EconomicConfigVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GameSession" ADD CONSTRAINT "GameSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GameSession" ADD CONSTRAINT "GameSession_ruleVersion_fkey" FOREIGN KEY ("ruleVersion") REFERENCES "EconomicConfigVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GameSession" ADD CONSTRAINT "GameSession_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "LedgerTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GameEvent" ADD CONSTRAINT "GameEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "GameSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MissionClaim" ADD CONSTRAINT "MissionClaim_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MissionClaim" ADD CONSTRAINT "MissionClaim_ruleVersion_fkey" FOREIGN KEY ("ruleVersion") REFERENCES "EconomicConfigVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MissionClaim" ADD CONSTRAINT "MissionClaim_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "LedgerTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
