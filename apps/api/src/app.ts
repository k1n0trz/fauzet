import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import Fastify from "fastify";
import type { AppConfig } from "./config.js";

export async function createApp(config: AppConfig) {
  const app = Fastify({
    logger: config.nodeEnv !== "test",
    genReqId: () => crypto.randomUUID(),
  });

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, { origin: config.webOrigin, credentials: true });
  await app.register(rateLimit, { max: 100, timeWindow: "1 minute" });

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
