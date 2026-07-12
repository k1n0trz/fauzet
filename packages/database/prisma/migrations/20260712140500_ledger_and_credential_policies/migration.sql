-- Bind sessions to the credential version that created them.
ALTER TABLE "User"
ADD COLUMN "credentialVersion" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "Session"
ADD COLUMN "credentialVersion" INTEGER NOT NULL DEFAULT 1;

-- Negative balances must be an explicit property of a technical account.
ALTER TABLE "LedgerAccount"
ADD COLUMN "allowNegative" BOOLEAN NOT NULL DEFAULT false;

-- Every posting must retain the economic configuration that authorized it.
ALTER TABLE "LedgerTransaction"
ADD CONSTRAINT "LedgerTransaction_configVersion_fkey"
FOREIGN KEY ("configVersion") REFERENCES "EconomicConfigVersion"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
