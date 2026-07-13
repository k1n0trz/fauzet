-- CreateEnum
CREATE TYPE "RiskSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateTable
CREATE TABLE "AdminSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "baseSessionHash" TEXT NOT NULL,
    "assurance" TEXT NOT NULL DEFAULT 'PASSWORD_REAUTH',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AdminSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskSignal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "actorId" TEXT,
    "type" TEXT NOT NULL,
    "severity" "RiskSeverity" NOT NULL,
    "scoreDelta" INTEGER NOT NULL,
    "previousScore" INTEGER NOT NULL,
    "nextScore" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "evidence" JSONB NOT NULL DEFAULT '{}',
    "requestId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RiskSignal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdminSession_tokenHash_key" ON "AdminSession"("tokenHash");
CREATE INDEX "AdminSession_userId_expiresAt_idx" ON "AdminSession"("userId", "expiresAt");
CREATE INDEX "AdminSession_baseSessionHash_expiresAt_idx" ON "AdminSession"("baseSessionHash", "expiresAt");
CREATE INDEX "RiskSignal_userId_createdAt_idx" ON "RiskSignal"("userId", "createdAt");
CREATE INDEX "RiskSignal_severity_createdAt_idx" ON "RiskSignal"("severity", "createdAt");

ALTER TABLE "AdminSession"
  ADD CONSTRAINT "AdminSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "AdminSession_hash_check" CHECK (
    "tokenHash" ~ '^[0-9a-f]{64}$' AND "baseSessionHash" ~ '^[0-9a-f]{64}$'
  ),
  ADD CONSTRAINT "AdminSession_assurance_check" CHECK ("assurance" = 'PASSWORD_REAUTH');

ALTER TABLE "RiskSignal"
  ADD CONSTRAINT "RiskSignal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "RiskSignal_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "RiskSignal_score_check" CHECK (
    "previousScore" BETWEEN 0 AND 100 AND "nextScore" BETWEEN 0 AND 100 AND
    "nextScore" - "previousScore" = "scoreDelta" AND length("reason") >= 10
  );

ALTER TABLE "User"
  ADD CONSTRAINT "User_riskLevel_check" CHECK ("riskLevel" BETWEEN 0 AND 100);

CREATE FUNCTION "prevent_append_only_control_mutation"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Control and audit records are append-only';
END;
$$;

CREATE TRIGGER "AuditEvent_append_only"
BEFORE UPDATE OR DELETE ON "AuditEvent"
FOR EACH ROW EXECUTE FUNCTION "prevent_append_only_control_mutation"();

CREATE TRIGGER "RiskSignal_append_only"
BEFORE UPDATE OR DELETE ON "RiskSignal"
FOR EACH ROW EXECUTE FUNCTION "prevent_append_only_control_mutation"();
