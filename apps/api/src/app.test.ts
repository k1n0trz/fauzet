import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";

describe("API", () => {
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
    await app.close();
  });
});
