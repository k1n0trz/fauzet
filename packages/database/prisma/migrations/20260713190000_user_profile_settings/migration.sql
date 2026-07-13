CREATE TABLE "UserProfile" (
    "userId" TEXT NOT NULL,
    "username" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "phone" TEXT,
    "birthDate" DATE,
    "timezone" TEXT NOT NULL DEFAULT 'America/Bogota',
    "theme" TEXT NOT NULL DEFAULT 'SYSTEM',
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "region" TEXT,
    "postalCode" TEXT,
    "billingName" TEXT,
    "billingTaxId" TEXT,
    "billingEmail" TEXT,
    "marketingEmails" BOOLEAN NOT NULL DEFAULT false,
    "productEmails" BOOLEAN NOT NULL DEFAULT true,
    "avatarMime" TEXT,
    "avatarData" BYTEA,
    "kycStatus" TEXT NOT NULL DEFAULT 'NOT_STARTED',
    "kycProvider" TEXT,
    "kycReference" TEXT,
    "closureRequestedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("userId")
);

CREATE UNIQUE INDEX "UserProfile_username_key" ON "UserProfile"("username");
CREATE INDEX "UserProfile_kycStatus_updatedAt_idx" ON "UserProfile"("kycStatus", "updatedAt");
ALTER TABLE "UserProfile" ADD CONSTRAINT "UserProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
