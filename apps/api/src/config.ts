import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  WEB_ORIGIN: z.string().url().default("http://localhost:3000"),
  SESSION_SECRET: z
    .string()
    .min(32)
    .default("development-only-secret-change-me-now"),
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  REAL_MONEY_ENABLED: z.enum(["true", "false"]).default("false"),
  WITHDRAWALS_ENABLED: z.enum(["true", "false"]).default("false"),
  TRADING_ENABLED: z.enum(["true", "false"]).default("false"),
});

export type AppConfig = ReturnType<typeof loadConfig>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const parsed = envSchema.parse(env);
  return {
    nodeEnv: parsed.NODE_ENV,
    port: parsed.API_PORT,
    webOrigin: parsed.WEB_ORIGIN,
    sessionSecret: parsed.SESSION_SECRET,
    sessionTtlDays: parsed.SESSION_TTL_DAYS,
    features: {
      realMoney: parsed.REAL_MONEY_ENABLED === "true",
      withdrawals: parsed.WITHDRAWALS_ENABLED === "true",
      trading: parsed.TRADING_ENABLED === "true",
    },
  } as const;
}
