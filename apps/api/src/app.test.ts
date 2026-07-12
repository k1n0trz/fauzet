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
});
