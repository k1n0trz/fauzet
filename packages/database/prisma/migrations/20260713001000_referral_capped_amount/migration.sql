ALTER TABLE "ReferralCommission"
  ADD COLUMN "cappedMinor" DECIMAL(36,0) NOT NULL DEFAULT 0;

ALTER TABLE "ReferralCommission"
  DROP CONSTRAINT "ReferralCommission_amount_check",
  ADD CONSTRAINT "ReferralCommission_amount_check" CHECK (
    "level" BETWEEN 1 AND 4 AND "rateBps" BETWEEN 0 AND 10000 AND
    "baseMinor" > 0 AND "rewardMinor" >= 0 AND "cappedMinor" >= 0 AND
    "rewardMinor" + "cappedMinor" <= "baseMinor" AND
    "capMonth" ~ '^[0-9]{4}-[0-9]{2}$'
  );
