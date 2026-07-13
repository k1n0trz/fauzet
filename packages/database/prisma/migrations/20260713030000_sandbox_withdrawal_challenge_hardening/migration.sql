ALTER TABLE "WithdrawalChallenge"
  ADD COLUMN "failedAttempts" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "WithdrawalChallenge"
  ADD CONSTRAINT "WithdrawalChallenge_failedAttempts_check"
  CHECK ("failedAttempts" BETWEEN 0 AND 5);

CREATE UNIQUE INDEX "WithdrawalChallenge_one_active_per_destination"
  ON "WithdrawalChallenge"("userId", "conversionId", "walletId")
  WHERE "consumedAt" IS NULL;
