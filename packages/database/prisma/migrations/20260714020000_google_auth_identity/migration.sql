-- Persist the stable Firebase/Google subject without storing OAuth tokens.
ALTER TABLE "User"
  ADD COLUMN "googleSubject" TEXT,
  ADD COLUMN "googleLinkedAt" TIMESTAMP(3),
  ADD COLUMN "googleLastLoginAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "User_googleSubject_key" ON "User"("googleSubject");

ALTER TABLE "User"
  ADD CONSTRAINT "User_google_identity_timestamps_check" CHECK (
    ("googleSubject" IS NULL AND "googleLinkedAt" IS NULL AND "googleLastLoginAt" IS NULL) OR
    ("googleSubject" IS NOT NULL AND "googleLinkedAt" IS NOT NULL AND "googleLastLoginAt" IS NOT NULL)
  );
