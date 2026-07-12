-- Enforce one account per user, asset, and balance bucket.
CREATE UNIQUE INDEX "LedgerAccount_userId_asset_bucket_key"
ON "LedgerAccount"("userId", "asset", "bucket");
