CREATE INDEX "FaucetClaim_deviceId_createdAt_status_idx"
ON "FaucetClaim"("deviceId", "createdAt", "status");

CREATE INDEX "FaucetClaim_ipHash_createdAt_status_idx"
ON "FaucetClaim"("ipHash", "createdAt", "status");

CREATE INDEX "FaucetClaim_budgetDate_status_idx"
ON "FaucetClaim"("budgetDate", "status");
