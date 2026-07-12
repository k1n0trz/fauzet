import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import Fastify from "fastify";
import type { AppConfig } from "./config.js";
import { AuthService, type AuthStore } from "./domain/auth.js";
import { BalanceService, type BalanceStore } from "./domain/balances.js";
import { MemoryAuthStore } from "./infrastructure/memory-auth-store.js";
import { MemoryBalanceStore } from "./infrastructure/memory-balance-store.js";
import { PrismaAuthStore } from "./infrastructure/prisma-auth-store.js";
import { PrismaBalanceStore } from "./infrastructure/prisma-balance-store.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerBalanceRoutes } from "./routes/balances.js";

export interface AppDependencies {
  authStore?: AuthStore;
  balanceStore?: BalanceStore;
}

export async function createApp(
  config: AppConfig,
  dependencies: AppDependencies = {},
) {
  const app = Fastify({
    logger: config.nodeEnv !== "test",
    genReqId: () => crypto.randomUUID(),
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
  await registerBalanceRoutes(app, auth, new BalanceService(balanceStore));

  app.get("/health", async () => ({
    status: "ok" as const,
    service: "fauzet-api",
    timestamp: new Date().toISOString(),
  }));

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
