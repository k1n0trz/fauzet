-- Persist one-time, user-bound faucet challenges.
CREATE TABLE "FaucetChallenge" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ISSUED',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "ipHash" TEXT NOT NULL,
    "deviceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FaucetChallenge_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "FaucetClaim"
ADD COLUMN "idempotencyKey" TEXT,
ADD COLUMN "budgetDate" DATE,
ADD COLUMN "streakDays" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "bonusPercent" INTEGER NOT NULL DEFAULT 0;

-- Preserve compatibility if an environment already contains early claims.
INSERT INTO "FaucetChallenge" (
    "id", "userId", "status", "expiresAt", "consumedAt", "ipHash", "deviceId", "createdAt"
)
SELECT
    "challengeId", "userId", 'CONSUMED', "createdAt", "createdAt",
    COALESCE("ipHash", 'legacy'), "deviceId", "createdAt"
FROM "FaucetClaim";

UPDATE "FaucetClaim"
SET
    "idempotencyKey" = 'legacy:faucet:' || "id",
    "budgetDate" = ("createdAt" AT TIME ZONE 'UTC')::date;

ALTER TABLE "FaucetClaim"
ALTER COLUMN "idempotencyKey" SET NOT NULL,
ALTER COLUMN "budgetDate" SET NOT NULL;

CREATE UNIQUE INDEX "FaucetClaim_idempotencyKey_key"
ON "FaucetClaim"("idempotencyKey");

CREATE INDEX "FaucetChallenge_userId_status_expiresAt_idx"
ON "FaucetChallenge"("userId", "status", "expiresAt");

CREATE INDEX "FaucetClaim_ruleVersion_budgetDate_status_idx"
ON "FaucetClaim"("ruleVersion", "budgetDate", "status");

ALTER TABLE "FaucetChallenge"
ADD CONSTRAINT "FaucetChallenge_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FaucetClaim"
ADD CONSTRAINT "FaucetClaim_challengeId_fkey"
FOREIGN KEY ("challengeId") REFERENCES "FaucetChallenge"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FaucetClaim"
ADD CONSTRAINT "FaucetClaim_transactionId_fkey"
FOREIGN KEY ("transactionId") REFERENCES "LedgerTransaction"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FaucetClaim"
ADD CONSTRAINT "FaucetClaim_ruleVersion_fkey"
FOREIGN KEY ("ruleVersion") REFERENCES "EconomicConfigVersion"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
