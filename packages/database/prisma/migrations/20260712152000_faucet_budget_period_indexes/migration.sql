DROP INDEX "FaucetClaim_deviceId_createdAt_status_idx";
DROP INDEX "FaucetClaim_ipHash_createdAt_status_idx";

CREATE INDEX "FaucetClaim_userId_budgetDate_status_idx"
ON "FaucetClaim"("userId", "budgetDate", "status");

CREATE INDEX "FaucetClaim_deviceId_budgetDate_status_idx"
ON "FaucetClaim"("deviceId", "budgetDate", "status");

CREATE INDEX "FaucetClaim_ipHash_budgetDate_status_idx"
ON "FaucetClaim"("ipHash", "budgetDate", "status");
