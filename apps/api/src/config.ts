import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  WEB_ORIGIN: z.string().url().default("http://localhost:3000"),
  SESSION_SECRET: z.string().min(32).optional(),
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  APP_BASE_URL: z.string().url().default("http://localhost:3000"),
  SMTP_HOST: z.string().default("localhost"),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(1025),
  EMAIL_FROM: z.string().default("Fauzet <no-reply@fauzet.local>"),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(0),
  REAL_MONEY_ENABLED: z.enum(["true", "false"]).default("false"),
  WITHDRAWALS_ENABLED: z.enum(["true", "false"]).default("false"),
  TRADING_ENABLED: z.enum(["true", "false"]).default("false"),
});

export type AppConfig = ReturnType<typeof loadConfig>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const parsed = envSchema.parse(env);
  if (parsed.NODE_ENV === "production" && !parsed.SESSION_SECRET)
    throw new Error("SESSION_SECRET is required in production");
  return {
    nodeEnv: parsed.NODE_ENV,
    port: parsed.API_PORT,
    webOrigin: parsed.WEB_ORIGIN,
    sessionSecret:
      parsed.SESSION_SECRET ?? "development-only-secret-change-me-now",
    sessionTtlDays: parsed.SESSION_TTL_DAYS,
    appBaseUrl: parsed.APP_BASE_URL,
    smtp: {
      host: parsed.SMTP_HOST,
      port: parsed.SMTP_PORT,
      from: parsed.EMAIL_FROM,
    },
    trustProxy: parsed.TRUST_PROXY_HOPS === 0 ? false : parsed.TRUST_PROXY_HOPS,
    features: {
      realMoney: parsed.REAL_MONEY_ENABLED === "true",
      withdrawals: parsed.WITHDRAWALS_ENABLED === "true",
      trading: parsed.TRADING_ENABLED === "true",
    },
  } as const;
}
