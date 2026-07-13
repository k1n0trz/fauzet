import { z } from "zod";

const portSchema = z.coerce.number().int().min(1).max(65535);
const optionalNonEmptyString = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().min(1).optional(),
);

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  API_PORT: portSchema.default(4000),
  PORT: portSchema.optional(),
  WEB_ORIGIN: z.string().url().default("http://localhost:3000"),
  SESSION_SECRET: z.string().min(32).optional(),
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  APP_BASE_URL: z.string().url().default("http://localhost:3000"),
  SMTP_HOST: z.string().default("localhost"),
  SMTP_PORT: portSchema.default(1025),
  SMTP_USER: optionalNonEmptyString,
  SMTP_PASSWORD: optionalNonEmptyString,
  SMTP_SECURE: z.enum(["true", "false"]).default("false"),
  SMTP_REQUIRE_TLS: z.enum(["true", "false"]).default("false"),
  EMAIL_FROM: z.string().default("Fauzet <no-reply@fauzet.local>"),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(0),
  REAL_MONEY_ENABLED: z.enum(["true", "false"]).default("false"),
  WITHDRAWALS_ENABLED: z.enum(["true", "false"]).default("false"),
  TRADING_ENABLED: z.enum(["true", "false"]).default("false"),
  SANDBOX_WITHDRAWALS_ENABLED: z.enum(["true", "false"]).default("true"),
  FIAT_CATALOG_ENABLED: z.enum(["true", "false"]).default("true"),
  FIAT_SANDBOX_CHECKOUT_ENABLED: z.enum(["true", "false"]).default("false"),
  FIAT_SANDBOX_ACTIVATION_ENABLED: z.enum(["true", "false"]).default("false"),
});

export type AppConfig = ReturnType<typeof loadConfig>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const parsed = envSchema.parse(env);
  const hasSmtpUser = parsed.SMTP_USER !== undefined;
  const hasSmtpPassword = parsed.SMTP_PASSWORD !== undefined;
  const smtpSecure = parsed.SMTP_SECURE === "true";
  const smtpRequireTls = parsed.SMTP_REQUIRE_TLS === "true";

  if (hasSmtpUser !== hasSmtpPassword) {
    throw new Error("SMTP_USER and SMTP_PASSWORD must be set together");
  }
  if (smtpSecure && smtpRequireTls) {
    throw new Error(
      "Use SMTP_SECURE for implicit TLS or SMTP_REQUIRE_TLS for STARTTLS, not both",
    );
  }

  if (parsed.NODE_ENV === "production") {
    assertProductionConfig(parsed, env, {
      hasSmtpUser,
      smtpSecure,
      smtpRequireTls,
    });
  }

  return {
    nodeEnv: parsed.NODE_ENV,
    // Managed platforms such as Cloud Run own PORT. API_PORT remains the
    // convenient local override when the platform variable is absent.
    port: parsed.PORT ?? parsed.API_PORT,
    webOrigin: parsed.WEB_ORIGIN,
    sessionSecret:
      parsed.SESSION_SECRET ?? "development-only-secret-change-me-now",
    sessionTtlDays: parsed.SESSION_TTL_DAYS,
    appBaseUrl: parsed.APP_BASE_URL,
    smtp: {
      host: parsed.SMTP_HOST,
      port: parsed.SMTP_PORT,
      from: parsed.EMAIL_FROM,
      secure: smtpSecure,
      requireTls: smtpRequireTls,
      ...(parsed.SMTP_USER && parsed.SMTP_PASSWORD
        ? { auth: { user: parsed.SMTP_USER, pass: parsed.SMTP_PASSWORD } }
        : {}),
    },
    trustProxy: parsed.TRUST_PROXY_HOPS === 0 ? false : parsed.TRUST_PROXY_HOPS,
    features: {
      realMoney: parsed.REAL_MONEY_ENABLED === "true",
      withdrawals: parsed.WITHDRAWALS_ENABLED === "true",
      trading: parsed.TRADING_ENABLED === "true",
      sandboxWithdrawals: parsed.SANDBOX_WITHDRAWALS_ENABLED === "true",
      fiatCatalog: parsed.FIAT_CATALOG_ENABLED === "true",
      fiatSandboxCheckout: parsed.FIAT_SANDBOX_CHECKOUT_ENABLED === "true",
      fiatSandboxActivation: parsed.FIAT_SANDBOX_ACTIVATION_ENABLED === "true",
    },
  } as const;
}

function assertProductionConfig(
  parsed: z.infer<typeof envSchema>,
  raw: NodeJS.ProcessEnv,
  smtp: {
    hasSmtpUser: boolean;
    smtpSecure: boolean;
    smtpRequireTls: boolean;
  },
) {
  if (
    !parsed.SESSION_SECRET ||
    [
      "development-only-secret-change-me-now",
      "replace-with-at-least-32-random-characters",
    ].includes(parsed.SESSION_SECRET)
  ) {
    throw new Error(
      "A unique SESSION_SECRET of at least 32 characters is required in production",
    );
  }
  if (!isHttps(parsed.WEB_ORIGIN) || !isHttps(parsed.APP_BASE_URL)) {
    throw new Error("WEB_ORIGIN and APP_BASE_URL must use HTTPS in production");
  }
  if (!raw.DATABASE_URL?.trim()) {
    throw new Error("DATABASE_URL is required in production");
  }
  const enabledValueExternalGates = [
    ["REAL_MONEY_ENABLED", parsed.REAL_MONEY_ENABLED],
    ["WITHDRAWALS_ENABLED", parsed.WITHDRAWALS_ENABLED],
    ["TRADING_ENABLED", parsed.TRADING_ENABLED],
  ]
    .filter(([, value]) => value === "true")
    .map(([name]) => name);
  if (enabledValueExternalGates.length > 0) {
    throw new Error(
      `${enabledValueExternalGates.join(", ")} cannot be enabled: real-value integrations are not implemented`,
    );
  }
  const enabledUnimplementedFiatGates = [
    ["FIAT_SANDBOX_CHECKOUT_ENABLED", parsed.FIAT_SANDBOX_CHECKOUT_ENABLED],
    ["FIAT_SANDBOX_ACTIVATION_ENABLED", parsed.FIAT_SANDBOX_ACTIVATION_ENABLED],
  ]
    .filter(([, value]) => value === "true")
    .map(([name]) => name);
  if (enabledUnimplementedFiatGates.length > 0) {
    throw new Error(
      `${enabledUnimplementedFiatGates.join(", ")} cannot be enabled: fiat sandbox checkout and activation are not implemented`,
    );
  }
  if (!raw.SMTP_HOST?.trim() || !raw.SMTP_PORT?.trim()) {
    throw new Error(
      "SMTP_HOST and SMTP_PORT must be set explicitly in production",
    );
  }
  if (!smtp.hasSmtpUser) {
    throw new Error("SMTP_USER and SMTP_PASSWORD are required in production");
  }
  if (!smtp.smtpSecure && !smtp.smtpRequireTls) {
    throw new Error(
      "SMTP_SECURE or SMTP_REQUIRE_TLS must be enabled in production",
    );
  }
  if (!raw.EMAIL_FROM?.trim()) {
    throw new Error("EMAIL_FROM must be set explicitly in production");
  }
}

function isHttps(value: string) {
  return new URL(value).protocol === "https:";
}
