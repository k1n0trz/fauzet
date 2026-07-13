import { describe, expect, it } from "vitest";
import {
  fiatCatalogResponseSchema,
  fiatInventoryResponseSchema,
} from "@fauzet/contracts";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { MemoryAuthStore } from "./infrastructure/memory-auth-store.js";

describe("API", () => {
  it("trusts no forwarded proxy by default and accepts an exact hop count", () => {
    expect(loadConfig({ NODE_ENV: "test" }).trustProxy).toBe(false);
    expect(
      loadConfig({ NODE_ENV: "test", TRUST_PROXY_HOPS: "2" }).trustProxy,
    ).toBe(2);
  });

  it("reports health and keeps value-external features disabled", async () => {
    const app = await createApp(loadConfig({ NODE_ENV: "test" }));
    const health = await app.inject({ method: "GET", url: "/health" });
    const platform = await app.inject({ method: "GET", url: "/v1/platform" });

    expect(health.statusCode).toBe(200);
    expect(health.json().status).toBe("ok");
    expect(platform.json().features).toEqual({
      realMoney: false,
      withdrawals: false,
      trading: false,
      sandboxWithdrawals: true,
      fiatCatalog: true,
      fiatSandboxCheckout: false,
      fiatSandboxActivation: false,
    });
    await app.close();
  });

  it("registers a user and protects the current-user endpoint", async () => {
    const app = await createApp(loadConfig({ NODE_ENV: "test" }));
    const anonymous = await app.inject({ method: "GET", url: "/v1/me" });
    expect(anonymous.statusCode).toBe(401);
    const registration = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        email: "mateo@example.com",
        password: "ValidPassword123",
        displayName: "Mateo",
        countryCode: "CO",
        locale: "es",
        acceptedTerms: true,
        isAdult: true,
      },
    });
    expect(registration.statusCode).toBe(201);
    const cookie = registration.cookies.find(
      ({ name }) => name === "fz_session",
    );
    const me = await app.inject({
      method: "GET",
      url: "/v1/me",
      cookies: { fz_session: cookie!.value },
    });
    expect(me.json().user.email).toBe("mateo@example.com");
    const balances = await app.inject({
      method: "GET",
      url: "/v1/balances",
      cookies: { fz_session: cookie!.value },
    });
    expect(balances.json().balances).toHaveLength(7);
    expect(
      balances
        .json()
        .balances.every(
          ({ minorUnits }: { minorUnits: string }) => minorUnits === "0",
        ),
    ).toBe(true);
    const activity = await app.inject({
      method: "GET",
      url: "/v1/account/activity?limit=10",
      cookies: { fz_session: cookie!.value },
    });
    expect(activity.statusCode).toBe(200);
    expect(activity.headers["cache-control"]).toBe("no-store");
    expect(activity.json()).toEqual({ items: [], nextCursor: null });
    await app.close();
  });

  it("serves a catalog-only fiat sandbox and an empty real inventory", async () => {
    const authStore = new MemoryAuthStore();
    const app = await createApp(loadConfig({ NODE_ENV: "test" }), {
      authStore,
    });
    const registration = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        email: "fiat-catalog@example.com",
        password: "ValidPassword123",
        displayName: "Fiat Catalog",
        countryCode: "CO",
        locale: "es",
        acceptedTerms: true,
        isAdult: true,
      },
    });
    const cookie = registration.cookies.find(
      ({ name }) => name === "fz_session",
    )!;
    const storedUser = await authStore.findUserByEmail(
      "fiat-catalog@example.com",
    );
    if (!storedUser) throw new Error("Expected registered test user");
    storedUser.status = "ACTIVE";

    const catalogResponse = await app.inject({
      method: "GET",
      url: "/v1/fiat/catalog",
      cookies: { fz_session: cookie.value },
    });
    const inventoryResponse = await app.inject({
      method: "GET",
      url: "/v1/fiat/entitlements",
      cookies: { fz_session: cookie.value },
    });

    expect(catalogResponse.statusCode).toBe(200);
    expect(catalogResponse.headers["cache-control"]).toBe("no-store");
    expect(
      fiatCatalogResponseSchema.parse(catalogResponse.json()),
    ).toMatchObject({
      checkoutEnabled: false,
      activationEnabled: false,
      realChargeEnabled: false,
    });
    expect(inventoryResponse.statusCode).toBe(200);
    expect(
      fiatInventoryResponseSchema.parse(inventoryResponse.json()),
    ).toMatchObject({ items: [] });
    await app.close();
  });
});
