import { describe, expect, it } from "vitest";
import { loadFiatReconciliationConfig } from "./fiat-reconciliation-config.js";

const validEnv = {
  MERCADOPAGO_MODE: "test",
  MERCADOPAGO_ACCESS_TOKEN: "APP_USR-test-access-token-with-enough-length",
  MERCADOPAGO_APPLICATION_ID: "123456789012345",
  MERCADOPAGO_SELLER_USER_ID: "12345678901234567890",
} satisfies NodeJS.ProcessEnv;

describe("loadFiatReconciliationConfig", () => {
  it("loads only the Mercado Pago TEST identity required by the worker", () => {
    expect(loadFiatReconciliationConfig(validEnv)).toEqual({
      mode: "test",
      accessToken: validEnv.MERCADOPAGO_ACCESS_TOKEN,
      applicationId: validEnv.MERCADOPAGO_APPLICATION_ID,
      sellerUserId: validEnv.MERCADOPAGO_SELLER_USER_ID,
    });
  });

  it("does not require HTTP, session, SMTP or webhook configuration", () => {
    expect(() => loadFiatReconciliationConfig(validEnv)).not.toThrow();
  });

  it("rejects live mode", () => {
    expect(() =>
      loadFiatReconciliationConfig({
        ...validEnv,
        MERCADOPAGO_MODE: "live",
      }),
    ).toThrow();
  });

  it.each([
    "MERCADOPAGO_MODE",
    "MERCADOPAGO_ACCESS_TOKEN",
    "MERCADOPAGO_APPLICATION_ID",
    "MERCADOPAGO_SELLER_USER_ID",
  ] as const)("requires %s", (name) => {
    expect(() =>
      loadFiatReconciliationConfig({ ...validEnv, [name]: undefined }),
    ).toThrow();
  });

  it("rejects non-numeric provider identities", () => {
    expect(() =>
      loadFiatReconciliationConfig({
        ...validEnv,
        MERCADOPAGO_APPLICATION_ID: "application-test",
      }),
    ).toThrow();
    expect(() =>
      loadFiatReconciliationConfig({
        ...validEnv,
        MERCADOPAGO_SELLER_USER_ID: "seller-test",
      }),
    ).toThrow();
  });
});
