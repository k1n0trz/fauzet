import { getDatabase, Prisma, type PrismaClient } from "@fauzet/database";

const profileInclude = Prisma.validator<Prisma.UserInclude>()({
  profile: true,
  sessions: {
    where: { revokedAt: null },
    orderBy: { createdAt: "desc" },
  },
  externalWallets: {
    where: { revokedAt: null },
    orderBy: { createdAt: "desc" },
  },
});
type ProfileRecord = Prisma.UserGetPayload<{ include: typeof profileInclude }>;

export type ProfileUpdate = {
  displayName?: string | undefined;
  locale?: "es" | "en" | undefined;
  countryCode?: string | undefined;
  username?: string | null | undefined;
  firstName?: string | null | undefined;
  lastName?: string | null | undefined;
  phone?: string | null | undefined;
  birthDate?: string | null | undefined;
  timezone?: string | undefined;
  theme?: "DARK" | "LIGHT" | "SYSTEM" | undefined;
  addressLine1?: string | null | undefined;
  addressLine2?: string | null | undefined;
  city?: string | null | undefined;
  region?: string | null | undefined;
  postalCode?: string | null | undefined;
  billingName?: string | null | undefined;
  billingTaxId?: string | null | undefined;
  billingEmail?: string | null | undefined;
  marketingEmails?: boolean | undefined;
  productEmails?: boolean | undefined;
};

export class ProfileConflictError extends Error {}

export class PrismaProfileStore {
  constructor(private readonly database: PrismaClient = getDatabase()) {}

  async get(userId: string, currentTokenHash: string) {
    const user = await this.database.user.findUniqueOrThrow({
      where: { id: userId },
      include: profileInclude,
    });
    return serialize(user, currentTokenHash);
  }

  async update(userId: string, input: ProfileUpdate) {
    const { displayName, locale, countryCode, birthDate, ...profile } = input;
    try {
      await this.database.$transaction(async (tx) => {
        if (
          displayName !== undefined ||
          locale !== undefined ||
          countryCode !== undefined
        ) {
          const userData: Prisma.UserUpdateInput = {};
          if (displayName !== undefined) userData.displayName = displayName;
          if (locale !== undefined) userData.locale = locale;
          if (countryCode !== undefined) userData.countryCode = countryCode;
          await tx.user.update({
            where: { id: userId },
            data: userData,
          });
        }
        const profileData = Object.fromEntries(
          Object.entries(profile).filter(([, value]) => value !== undefined),
        ) as Prisma.UserProfileUncheckedUpdateInput;
        if (birthDate !== undefined) {
          profileData.birthDate =
            birthDate === null ? null : new Date(`${birthDate}T00:00:00.000Z`);
        }
        await tx.userProfile.upsert({
          where: { userId },
          create: {
            userId,
            ...profileData,
          } as Prisma.UserProfileUncheckedCreateInput,
          update: profileData,
        });
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ProfileConflictError("El nombre de usuario ya está en uso");
      }
      throw error;
    }
  }

  async setAvatar(userId: string, mime: string | null, data: Buffer | null) {
    await this.database.userProfile.upsert({
      where: { userId },
      create: { userId, avatarMime: mime, avatarData: data },
      update: { avatarMime: mime, avatarData: data },
    });
  }

  async avatar(userId: string) {
    return this.database.userProfile.findUnique({
      where: { userId },
      select: { avatarMime: true, avatarData: true, updatedAt: true },
    });
  }

  async revokeSession(userId: string, sessionId: string) {
    return this.database.session.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeOtherSessions(userId: string, currentTokenHash: string) {
    return this.database.session.updateMany({
      where: { userId, tokenHash: { not: currentTokenHash }, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async requestClosure(userId: string, requested: boolean) {
    await this.database.userProfile.upsert({
      where: { userId },
      create: { userId, closureRequestedAt: requested ? new Date() : null },
      update: { closureRequestedAt: requested ? new Date() : null },
    });
  }
}

function serialize(user: ProfileRecord, currentTokenHash: string) {
  const profile = user.profile;
  return {
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      locale: user.locale,
      countryCode: user.countryCode,
      status: user.status,
      emailVerified: Boolean(user.emailVerifiedAt),
      createdAt: user.createdAt.toISOString(),
    },
    profile: {
      username: profile?.username ?? null,
      firstName: profile?.firstName ?? null,
      lastName: profile?.lastName ?? null,
      phone: profile?.phone ?? null,
      phoneVerified: false,
      birthDate: profile?.birthDate?.toISOString().slice(0, 10) ?? null,
      timezone: profile?.timezone ?? "America/Bogota",
      theme: profile?.theme ?? "SYSTEM",
      addressLine1: profile?.addressLine1 ?? null,
      addressLine2: profile?.addressLine2 ?? null,
      city: profile?.city ?? null,
      region: profile?.region ?? null,
      postalCode: profile?.postalCode ?? null,
      billingName: profile?.billingName ?? null,
      billingTaxId: profile?.billingTaxId ?? null,
      billingEmail: profile?.billingEmail ?? null,
      marketingEmails: profile?.marketingEmails ?? false,
      productEmails: profile?.productEmails ?? true,
      avatarAvailable: Boolean(profile?.avatarData),
      kyc: {
        status: profile?.kycStatus ?? "NOT_STARTED",
        provider: profile?.kycProvider ?? null,
      },
      closureRequestedAt: profile?.closureRequestedAt?.toISOString() ?? null,
    },
    security: {
      twoFactor: {
        enabled: false,
        available: false,
        reason: "TOTP_PENDING_IMPLEMENTATION",
      },
      google: {
        linked: Boolean(user.googleSubject),
        available: true,
        reason: user.googleSubject ? "LINKED" : "AVAILABLE",
      },
    },
    sessions: user.sessions
      .filter((session) => session.expiresAt > new Date())
      .map((session) => ({
        id: session.id,
        current: session.tokenHash === currentTokenHash,
        device: session.deviceId
          ? `${session.deviceId.slice(0, 8)}…`
          : "No identificado",
        createdAt: session.createdAt.toISOString(),
        expiresAt: session.expiresAt.toISOString(),
      })),
    wallets: user.externalWallets.map((wallet) => ({
      id: wallet.id,
      network: wallet.network,
      label: wallet.label,
      address: maskAddress(wallet.address),
      status: wallet.status,
      availableAt: wallet.availableAt.toISOString(),
    })),
    paymentMethods: [],
  };
}

function maskAddress(address: string) {
  return address.length <= 14
    ? address
    : `${address.slice(0, 7)}…${address.slice(-5)}`;
}
