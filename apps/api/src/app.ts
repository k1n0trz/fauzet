import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import Fastify from "fastify";
import { getDatabase } from "@fauzet/database";
import type { AppConfig } from "./config.js";
import {
  AuthService,
  type AuthStore,
  type GoogleIdentityVerifier,
} from "./domain/auth.js";
import {
  AccountSecurityService,
  type AccountSecurityStore,
  type TransactionalMailer,
} from "./domain/account-security.js";
import { BalanceService, type BalanceStore } from "./domain/balances.js";
import {
  AccountActivityService,
  type AccountActivityStore,
} from "./domain/account-activity.js";
import { FaucetService, type FaucetStore } from "./domain/faucet.js";
import { GameService, type GameStore } from "./domain/games.js";
import { MissionService, type MissionStore } from "./domain/missions.js";
import {
  MiningService,
  StoreService,
  type CommerceStore,
} from "./domain/commerce.js";
import {
  FiatCommerceService,
  type FiatCommerceStore,
} from "./domain/fiat-commerce.js";
import {
  FiatPaymentService,
  type FiatPaymentGateway,
  type FiatPaymentStore,
} from "./domain/fiat-payments.js";
import { ReferralService, type ReferralStore } from "./domain/referrals.js";
import { AdminService, type AdminStore } from "./domain/admin.js";
import {
  SandboxWithdrawalService,
  type SandboxWithdrawalStore,
} from "./domain/sandbox-withdrawals.js";
import { MemoryAuthStore } from "./infrastructure/memory-auth-store.js";
import { MemoryAccountSecurityStore } from "./infrastructure/memory-account-security-store.js";
import { MemoryBalanceStore } from "./infrastructure/memory-balance-store.js";
import { MemoryAccountActivityStore } from "./infrastructure/memory-account-activity-store.js";
import { MemoryFaucetStore } from "./infrastructure/memory-faucet-store.js";
import { MemoryGameStore } from "./infrastructure/memory-game-store.js";
import { MemoryMissionStore } from "./infrastructure/memory-mission-store.js";
import { MemoryCommerceStore } from "./infrastructure/memory-commerce-store.js";
import { MemoryFiatCommerceStore } from "./infrastructure/memory-fiat-commerce-store.js";
import { MemoryFiatPaymentStore } from "./infrastructure/memory-fiat-payment-store.js";
import { MemoryReferralStore } from "./infrastructure/memory-referral-store.js";
import { MemoryMailer } from "./infrastructure/memory-mailer.js";
import { PrismaAuthStore } from "./infrastructure/prisma-auth-store.js";
import { FirebaseGoogleIdentityVerifier } from "./infrastructure/firebase-google-identity.js";
import { PrismaAccountSecurityStore } from "./infrastructure/prisma-account-security-store.js";
import { PrismaBalanceStore } from "./infrastructure/prisma-balance-store.js";
import { PrismaAccountActivityStore } from "./infrastructure/prisma-account-activity-store.js";
import { PrismaFaucetStore } from "./infrastructure/prisma-faucet-store.js";
import { PrismaGameStore } from "./infrastructure/prisma-game-store.js";
import { PrismaMissionStore } from "./infrastructure/prisma-mission-store.js";
import { PrismaCommerceStore } from "./infrastructure/prisma-commerce-store.js";
import { PrismaFiatCommerceStore } from "./infrastructure/prisma-fiat-commerce-store.js";
import { PrismaFiatPaymentStore } from "./infrastructure/prisma-fiat-payment-store.js";
import { MercadoPagoGateway } from "./infrastructure/mercadopago-gateway.js";
import { PrismaReferralStore } from "./infrastructure/prisma-referral-store.js";
import { PrismaAdminStore } from "./infrastructure/prisma-admin-store.js";
import { PrismaSandboxWithdrawalStore } from "./infrastructure/prisma-sandbox-withdrawal-store.js";
import { SmtpMailer } from "./infrastructure/smtp-mailer.js";
import { PrismaWelcomeBonusIssuer } from "./infrastructure/prisma-welcome-bonus.js";
import type { WelcomeBonusIssuer } from "./domain/welcome-bonus.js";
import { registerAccountSecurityRoutes } from "./routes/account-security.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerBalanceRoutes } from "./routes/balances.js";
import { registerAccountActivityRoutes } from "./routes/account-activity.js";
import { registerFaucetRoutes } from "./routes/faucet.js";
import { registerGameRoutes } from "./routes/games.js";
import { registerMissionRoutes } from "./routes/missions.js";
import { registerCommerceRoutes } from "./routes/commerce.js";
import { registerFiatCommerceRoutes } from "./routes/fiat-commerce.js";
import { registerFiatPaymentRoutes } from "./routes/fiat-payments.js";
import { registerReferralRoutes } from "./routes/referrals.js";
import { registerAdminRoutes } from "./routes/admin.js";
import { registerSandboxWithdrawalRoutes } from "./routes/sandbox-withdrawals.js";
import { registerProfileRoutes } from "./routes/profile.js";

export interface AppDependencies {
  authStore?: AuthStore;
  googleIdentityVerifier?: GoogleIdentityVerifier | null;
  balanceStore?: BalanceStore;
  accountActivityStore?: AccountActivityStore;
  faucetStore?: FaucetStore;
  gameStore?: GameStore;
  missionStore?: MissionStore;
  commerceStore?: CommerceStore;
  fiatCommerceStore?: FiatCommerceStore;
  fiatPaymentStore?: FiatPaymentStore;
  fiatPaymentGateway?: FiatPaymentGateway | null;
  referralStore?: ReferralStore;
  adminStore?: AdminStore;
  sandboxWithdrawalStore?: SandboxWithdrawalStore;
  accountSecurityStore?: AccountSecurityStore;
  mailer?: TransactionalMailer;
  welcomeBonus?: WelcomeBonusIssuer;
}

export async function createApp(
  config: AppConfig,
  dependencies: AppDependencies = {},
) {
  const app = Fastify({
    logger: config.nodeEnv !== "test",
    genReqId: () => crypto.randomUUID(),
    trustProxy: config.trustProxy,
  });

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cookie);
  await app.register(cors, { origin: config.webOrigin, credentials: true });
  await app.register(rateLimit, {
    max: config.nodeEnv === "test" ? 10_000 : 100,
    timeWindow: "1 minute",
    ...(config.nodeEnv === "test" ? { allowList: () => true } : {}),
  });
  const authStore =
    dependencies.authStore ??
    (config.nodeEnv === "test" ? new MemoryAuthStore() : new PrismaAuthStore());
  const auth = new AuthService(
    authStore,
    config.sessionSecret,
    config.sessionTtlDays,
  );
  const welcomeBonus =
    dependencies.welcomeBonus ??
    (config.nodeEnv === "test" ? undefined : new PrismaWelcomeBonusIssuer());
  const googleIdentityVerifier =
    dependencies.googleIdentityVerifier !== undefined
      ? dependencies.googleIdentityVerifier
      : config.googleAuth.enabled && config.googleAuth.projectId
        ? new FirebaseGoogleIdentityVerifier(config.googleAuth.projectId)
        : null;
  const balanceStore =
    dependencies.balanceStore ??
    (config.nodeEnv === "test"
      ? new MemoryBalanceStore()
      : new PrismaBalanceStore());
  await registerAuthRoutes(app, auth, googleIdentityVerifier, welcomeBonus);
  const accountSecurityStore =
    dependencies.accountSecurityStore ??
    (config.nodeEnv === "test"
      ? new MemoryAccountSecurityStore()
      : new PrismaAccountSecurityStore());
  const mailer =
    dependencies.mailer ??
    (config.nodeEnv === "test"
      ? new MemoryMailer()
      : new SmtpMailer({ ...config.smtp, appBaseUrl: config.appBaseUrl }));
  await registerAccountSecurityRoutes(
    app,
    auth,
    new AccountSecurityService(
      accountSecurityStore,
      mailer,
      config.sessionSecret,
    ),
    welcomeBonus,
  );
  if (config.nodeEnv !== "test")
    await registerProfileRoutes(app, auth, config.sessionSecret);
  await registerBalanceRoutes(app, auth, new BalanceService(balanceStore));
  const accountActivityStore =
    dependencies.accountActivityStore ??
    (config.nodeEnv === "test"
      ? new MemoryAccountActivityStore()
      : new PrismaAccountActivityStore());
  await registerAccountActivityRoutes(
    app,
    auth,
    new AccountActivityService(accountActivityStore),
  );
  const faucetStore =
    dependencies.faucetStore ??
    (config.nodeEnv === "test"
      ? new MemoryFaucetStore()
      : new PrismaFaucetStore());
  await registerFaucetRoutes(
    app,
    auth,
    new FaucetService(faucetStore),
    config.sessionSecret,
  );
  const gameStore =
    dependencies.gameStore ??
    (config.nodeEnv === "test"
      ? new MemoryGameStore()
      : new PrismaGameStore(undefined, config.sessionSecret));
  await registerGameRoutes(
    app,
    auth,
    new GameService(gameStore),
    config.sessionSecret,
  );
  const missionStore =
    dependencies.missionStore ??
    (config.nodeEnv === "test"
      ? new MemoryMissionStore()
      : new PrismaMissionStore());
  await registerMissionRoutes(
    app,
    auth,
    new MissionService(missionStore),
    config.sessionSecret,
  );
  const commerceStore =
    dependencies.commerceStore ??
    (config.nodeEnv === "test"
      ? new MemoryCommerceStore()
      : new PrismaCommerceStore());
  await registerCommerceRoutes(
    app,
    auth,
    new StoreService(commerceStore),
    new MiningService(commerceStore),
    config.sessionSecret,
  );
  const fiatCommerceStore =
    dependencies.fiatCommerceStore ??
    (config.nodeEnv === "test"
      ? new MemoryFiatCommerceStore()
      : new PrismaFiatCommerceStore());
  await registerFiatCommerceRoutes(
    app,
    auth,
    new FiatCommerceService(
      fiatCommerceStore,
      {
        catalogEnabled: config.features.fiatCatalog,
        checkoutEnabled: config.features.fiatSandboxCheckout,
        activationEnabled: config.features.fiatSandboxActivation,
      },
      config.fiatSandbox.checkoutAllowedUsers,
    ),
  );
  const fiatPaymentStore =
    dependencies.fiatPaymentStore ??
    (config.nodeEnv === "test"
      ? new MemoryFiatPaymentStore()
      : new PrismaFiatPaymentStore());
  const fiatPaymentGateway =
    dependencies.fiatPaymentGateway !== undefined
      ? dependencies.fiatPaymentGateway
      : config.mercadoPago.accessToken
        ? new MercadoPagoGateway({
            accessToken: config.mercadoPago.accessToken,
            mode: config.mercadoPago.mode,
          })
        : null;
  await registerFiatPaymentRoutes(
    app,
    auth,
    new FiatPaymentService(fiatPaymentStore, fiatPaymentGateway, {
      checkoutEnabled: config.features.fiatSandboxCheckout,
      checkoutAllowedUsers: config.fiatSandbox.checkoutAllowedUsers,
      mode: config.mercadoPago.mode,
      appBaseUrl: config.appBaseUrl,
      ...(config.mercadoPago.sellerUserId
        ? { sellerUserId: config.mercadoPago.sellerUserId }
        : {}),
      ...(config.mercadoPago.applicationId
        ? { applicationId: config.mercadoPago.applicationId }
        : {}),
      ...(config.mercadoPago.webhookSecret
        ? { webhookSecret: config.mercadoPago.webhookSecret }
        : {}),
    }),
  );
  const referralStore =
    dependencies.referralStore ??
    (config.nodeEnv === "test"
      ? new MemoryReferralStore()
      : new PrismaReferralStore());
  await registerReferralRoutes(app, auth, new ReferralService(referralStore));
  const adminStore =
    dependencies.adminStore ??
    (config.nodeEnv === "test" ? undefined : new PrismaAdminStore());
  if (adminStore)
    await registerAdminRoutes(
      app,
      auth,
      new AdminService(adminStore, config.sessionSecret),
      config.sessionSecret,
    );
  const sandboxWithdrawalStore =
    dependencies.sandboxWithdrawalStore ??
    (config.nodeEnv === "test"
      ? undefined
      : new PrismaSandboxWithdrawalStore(
          undefined,
          undefined,
          mailer,
          config.sessionSecret,
        ));
  if (sandboxWithdrawalStore)
    await registerSandboxWithdrawalRoutes(
      app,
      auth,
      new SandboxWithdrawalService(
        sandboxWithdrawalStore,
        config.features.sandboxWithdrawals,
      ),
    );

  app.get("/health", async () => ({
    status: "ok" as const,
    service: "fauzet-api",
    timestamp: new Date().toISOString(),
  }));

  app.get("/health/ready", async (_request, reply) => {
    if (config.nodeEnv !== "test") {
      await getDatabase().$queryRaw`SELECT 1`;
    }
    return reply.send({
      status: "ok" as const,
      service: "fauzet-api",
      database: config.nodeEnv === "test" ? "memory" : "ready",
      timestamp: new Date().toISOString(),
    });
  });

  app.get("/v1/platform", async () => ({
    name: "Fauzet",
    unit: "ZYXE",
    tagline: "Drip sats. Every day.",
    stage: "closed_beta",
    features: config.features,
    disclaimer: "ZYXE is an internal utility unit and is not an investment.",
  }));

  return app;
}
