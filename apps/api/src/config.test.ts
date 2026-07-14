import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";

const productionEnv = {
  NODE_ENV: "production",
  SESSION_SECRET: "unique-production-session-secret-with-ample-entropy",
  WEB_ORIGIN: "https://fauzet.example",
  APP_BASE_URL: "https://fauzet.example",
  DATABASE_URL: "postgresql://application-host/fauzet",
  SMTP_HOST: "smtp.example.com",
  SMTP_PORT: "587",
  SMTP_USER: "smtp-user",
  SMTP_PASSWORD: "smtp-password",
  SMTP_REQUIRE_TLS: "true",
  EMAIL_FROM: "Fauzet <no-reply@fauzet.example>",
} satisfies NodeJS.ProcessEnv;

describe("loadConfig", () => {
  it("prefers the managed-platform PORT and keeps API_PORT as its fallback", () => {
    expect(
      loadConfig({ NODE_ENV: "test", PORT: "8080", API_PORT: "4001" }).port,
    ).toBe(8080);
    expect(loadConfig({ NODE_ENV: "test", API_PORT: "4001" }).port).toBe(4001);
  });

  it("maps authenticated STARTTLS settings without exposing local defaults", () => {
    expect(
      loadConfig({
        NODE_ENV: "test",
        SMTP_HOST: "smtp.example.com",
        SMTP_PORT: "587",
        SMTP_USER: "mailer",
        SMTP_PASSWORD: "secret",
        SMTP_REQUIRE_TLS: "true",
        EMAIL_FROM: "Fauzet <no-reply@example.com>",
      }).smtp,
    ).toEqual({
      host: "smtp.example.com",
      port: 587,
      from: "Fauzet <no-reply@example.com>",
      secure: false,
      requireTls: true,
      auth: { user: "mailer", pass: "secret" },
    });
  });

  it("requires SMTP username and password as a pair", () => {
    expect(() => loadConfig({ NODE_ENV: "test", SMTP_USER: "mailer" })).toThrow(
      "SMTP_USER and SMTP_PASSWORD must be set together",
    );
    expect(() =>
      loadConfig({ NODE_ENV: "test", SMTP_PASSWORD: "secret" }),
    ).toThrow("SMTP_USER and SMTP_PASSWORD must be set together");
  });

  it("rejects ambiguous implicit-TLS and STARTTLS settings", () => {
    expect(() =>
      loadConfig({
        NODE_ENV: "test",
        SMTP_SECURE: "true",
        SMTP_REQUIRE_TLS: "true",
      }),
    ).toThrow("not both");
  });

  it("rejects placeholder secrets and insecure public origins in production", () => {
    expect(() =>
      loadConfig({
        ...productionEnv,
        SESSION_SECRET: "replace-with-at-least-32-random-characters",
      }),
    ).toThrow("unique SESSION_SECRET");
    expect(() =>
      loadConfig({ ...productionEnv, WEB_ORIGIN: "http://fauzet.example" }),
    ).toThrow("must use HTTPS");
  });

  it("requires an explicit authenticated and encrypted SMTP relay in production", () => {
    expect(() =>
      loadConfig({ ...productionEnv, SMTP_HOST: undefined }),
    ).toThrow("must be set explicitly");
    expect(() =>
      loadConfig({ ...productionEnv, SMTP_PASSWORD: undefined }),
    ).toThrow("must be set together");
    expect(() =>
      loadConfig({ ...productionEnv, SMTP_REQUIRE_TLS: "false" }),
    ).toThrow("must be enabled");
    expect(() =>
      loadConfig({ ...productionEnv, EMAIL_FROM: undefined }),
    ).toThrow("EMAIL_FROM must be set explicitly");
  });

  it("requires the production database and keeps unimplemented value gates closed", () => {
    expect(() =>
      loadConfig({ ...productionEnv, DATABASE_URL: undefined }),
    ).toThrow("DATABASE_URL is required in production");
    expect(() =>
      loadConfig({ ...productionEnv, WITHDRAWALS_ENABLED: "true" }),
    ).toThrow("real-value integrations are not implemented");
    expect(() =>
      loadConfig({
        ...productionEnv,
        FIAT_SANDBOX_CHECKOUT_ENABLED: "true",
      }),
    ).toThrow("MERCADOPAGO_ACCESS_TOKEN");
    expect(() =>
      loadConfig({
        ...productionEnv,
        FIAT_SANDBOX_ACTIVATION_ENABLED: "true",
      }),
    ).toThrow("fiat sandbox activation is not implemented");
  });

  it("requires complete TEST identity, webhook signing and an allowlist before sandbox checkout", () => {
    const checkoutEnv = {
      ...productionEnv,
      FIAT_SANDBOX_CHECKOUT_ENABLED: "true",
      FIAT_SANDBOX_CHECKOUT_ALLOWED_USERS: "buyer@example.com",
      MERCADOPAGO_MODE: "test",
      MERCADOPAGO_ACCESS_TOKEN: "APP_USR-test-access-token-with-enough-length",
      MERCADOPAGO_WEBHOOK_SECRET: "webhook-secret-with-enough-length",
      MERCADOPAGO_APPLICATION_ID: "123456789012345",
      MERCADOPAGO_SELLER_USER_ID: "12345678901234567890",
    } satisfies NodeJS.ProcessEnv;
    const config = loadConfig(checkoutEnv);
    expect(config.features.fiatSandboxCheckout).toBe(true);
    expect(config.fiatSandbox.checkoutAllowedUsers).toEqual([
      "buyer@example.com",
    ]);
    expect(config.mercadoPago).toMatchObject({
      mode: "test",
      applicationId: "123456789012345",
      sellerUserId: "12345678901234567890",
    });
    expect(() =>
      loadConfig({
        ...checkoutEnv,
        FIAT_SANDBOX_CHECKOUT_ALLOWED_USERS: "",
      }),
    ).toThrow("must contain at least one user");
    expect(() =>
      loadConfig({ ...checkoutEnv, MERCADOPAGO_MODE: "live" }),
    ).toThrow("live is not authorized in this release");
    expect(() =>
      loadConfig({ NODE_ENV: "test", MERCADOPAGO_MODE: "live" }),
    ).toThrow("live is not authorized in this release");
  });

  it("supports the existing local Mercado Pago variable names only outside production", () => {
    const local = loadConfig({
      NODE_ENV: "test",
      MERCADOPAGO_TEST_API_KEY: "APP_USR-local-test-token-with-enough-length",
      NUMERO_DE_LA_APLICACION: "123456789012345",
      USER_ID: "1234567890",
    });
    expect(local.mercadoPago).toMatchObject({
      accessToken: "APP_USR-local-test-token-with-enough-length",
      applicationId: "123456789012345",
      sellerUserId: "1234567890",
    });
    expect(
      loadConfig({
        ...productionEnv,
        MERCADOPAGO_TEST_API_KEY: "APP_USR-legacy-production-token",
        NUMERO_DE_LA_APLICACION: "123456789012345",
        USER_ID: "1234567890",
      }).mercadoPago.accessToken,
    ).toBeUndefined();
  });

  it("keeps Google Auth fail-closed until a Firebase project is explicit", () => {
    expect(loadConfig({ NODE_ENV: "test" }).googleAuth).toEqual({
      enabled: false,
      projectId: undefined,
    });
    expect(() =>
      loadConfig({ NODE_ENV: "test", GOOGLE_AUTH_ENABLED: "true" }),
    ).toThrow("FIREBASE_PROJECT_ID");
    expect(
      loadConfig({
        NODE_ENV: "test",
        GOOGLE_AUTH_ENABLED: "true",
        FIREBASE_PROJECT_ID: "fauzet",
      }).googleAuth,
    ).toEqual({ enabled: true, projectId: "fauzet" });
  });

  it("accepts a complete production configuration", () => {
    const config = loadConfig(productionEnv);
    expect(config.nodeEnv).toBe("production");
    expect(config.smtp.auth?.user).toBe("smtp-user");
    expect(config.smtp.requireTls).toBe(true);
    expect(config.features.fiatCatalog).toBe(true);
    expect(config.features.fiatSandboxCheckout).toBe(false);
    expect(config.features.fiatSandboxActivation).toBe(false);
  });
});
