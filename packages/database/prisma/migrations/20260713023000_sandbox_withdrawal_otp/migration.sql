CREATE TABLE "WithdrawalChallenge" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "conversionId" TEXT NOT NULL,
  "walletId" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WithdrawalChallenge_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WithdrawalChallenge_userId_conversionId_walletId_expiresAt_idx"
  ON "WithdrawalChallenge"("userId", "conversionId", "walletId", "expiresAt");

ALTER TABLE "WithdrawalChallenge"
  ADD CONSTRAINT "WithdrawalChallenge_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WithdrawalChallenge"
  ADD CONSTRAINT "WithdrawalChallenge_conversionId_fkey"
  FOREIGN KEY ("conversionId") REFERENCES "Conversion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WithdrawalChallenge"
  ADD CONSTRAINT "WithdrawalChallenge_walletId_fkey"
  FOREIGN KEY ("walletId") REFERENCES "ExternalWallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Withdrawal" DROP CONSTRAINT "Withdrawal_state_check";
ALTER TABLE "Withdrawal"
  ADD CONSTRAINT "Withdrawal_state_check" CHECK (
    "riskScore" BETWEEN 0 AND 100 AND "assurance" IN ('PASSWORD_REAUTH_SANDBOX', 'PASSWORD_EMAIL_OTP_SANDBOX') AND
    (("status" = 'REVIEW' AND "sandboxTxId" IS NULL AND "settlementTransactionId" IS NULL AND "confirmations" = 0) OR
     ("status" = 'CONFIRMED' AND "sandboxTxId" IS NOT NULL AND "settlementTransactionId" IS NOT NULL AND "confirmations" >= 1) OR
     ("status" IN ('REJECTED', 'CANCELLED') AND "sandboxTxId" IS NULL AND "settlementTransactionId" IS NULL AND "confirmations" = 0))
  );

CREATE TRIGGER "WithdrawalChallenge_no_delete"
BEFORE DELETE ON "WithdrawalChallenge"
FOR EACH ROW EXECUTE FUNCTION "prevent_sandbox_economic_delete"();
