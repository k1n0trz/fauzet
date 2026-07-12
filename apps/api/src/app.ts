import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import Fastify from "fastify";
import { getDatabase } from "@fauzet/database";
import type { AppConfig } from "./config.js";
import { AuthService, type AuthStore } from "./domain/auth.js";
import {
  AccountSecurityService,
  type AccountSecurityStore,
  type TransactionalMailer,
} from "./domain/account-security.js";
import { BalanceService, type BalanceStore } from "./domain/balances.js";
import { MemoryAuthStore } from "./infrastructure/memory-auth-store.js";
import { MemoryAccountSecurityStore } from "./infrastructure/memory-account-security-store.js";
import { MemoryBalanceStore } from "./infrastructure/memory-balance-store.js";
import { MemoryMailer } from "./infrastructure/memory-mailer.js";
import { PrismaAuthStore } from "./infrastructure/prisma-auth-store.js";
import { PrismaAccountSecurityStore } from "./infrastructure/prisma-account-security-store.js";
import { PrismaBalanceStore } from "./infrastructure/prisma-balance-store.js";
import { SmtpMailer } from "./infrastructure/smtp-mailer.js";
import { PrismaWelcomeBonusIssuer } from "./infrastructure/prisma-welcome-bonus.js";
import type { WelcomeBonusIssuer } from "./domain/welcome-bonus.js";
import { registerAccountSecurityRoutes } from "./routes/account-security.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerBalanceRoutes } from "./routes/balances.js";

export interface AppDependencies {
  authStore?: AuthStore;
  balanceStore?: BalanceStore;
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
  await app.register(rateLimit, { max: 100, timeWindow: "1 minute" });
  const authStore =
    dependencies.authStore ??
    (config.nodeEnv === "test" ? new MemoryAuthStore() : new PrismaAuthStore());
  const auth = new AuthService(
    authStore,
    config.sessionSecret,
    config.sessionTtlDays,
  );
  const balanceStore =
    dependencies.balanceStore ??
    (config.nodeEnv === "test"
      ? new MemoryBalanceStore()
      : new PrismaBalanceStore());
  await registerAuthRoutes(app, auth);
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
  const welcomeBonus =
    dependencies.welcomeBonus ??
    (config.nodeEnv === "test" ? undefined : new PrismaWelcomeBonusIssuer());
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
  await registerBalanceRoutes(app, auth, new BalanceService(balanceStore));

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
