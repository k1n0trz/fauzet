import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import {
  GoogleIdentityVerificationError,
  type GoogleIdentityVerifier,
} from "./domain/auth.js";

const idToken = "firebase-id-token".padEnd(120, "x");
const verifier: GoogleIdentityVerifier = {
  async verify() {
    return {
      subject: "google-route-subject",
      email: "google-route@example.com",
      displayName: "Google Route",
    };
  },
};

describe("Google authentication routes", () => {
  it("stays fail-closed when the server verifier is disabled", async () => {
    const app = await createApp(loadConfig({ NODE_ENV: "test" }));
    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/google",
      payload: { idToken },
    });
    expect(response.statusCode).toBe(503);
    expect(response.json().error.code).toBe("GOOGLE_AUTH_UNAVAILABLE");
    await app.close();
  });

  it("requires consent for a new Google user and reuses the linked account", async () => {
    const app = await createApp(loadConfig({ NODE_ENV: "test" }), {
      googleIdentityVerifier: verifier,
    });
    const first = await app.inject({
      method: "POST",
      url: "/v1/auth/google",
      payload: { idToken },
    });
    expect(first.statusCode).toBe(409);
    expect(first.json().error.code).toBe("GOOGLE_REGISTRATION_REQUIRED");

    const created = await app.inject({
      method: "POST",
      url: "/v1/auth/google",
      payload: {
        idToken,
        registration: {
          displayName: "Google Route",
          countryCode: "CO",
          locale: "es",
          acceptedTerms: true,
          isAdult: true,
        },
      },
    });
    expect(created.statusCode).toBe(200);
    expect(created.json()).toMatchObject({
      created: true,
      user: { email: "google-route@example.com", status: "ACTIVE" },
    });

    const repeated = await app.inject({
      method: "POST",
      url: "/v1/auth/google",
      payload: { idToken },
    });
    expect(repeated.statusCode).toBe(200);
    expect(repeated.json()).toMatchObject({ created: false });
    await app.close();
  });

  it("rejects an invalid or expired Firebase token", async () => {
    const app = await createApp(loadConfig({ NODE_ENV: "test" }), {
      googleIdentityVerifier: {
        async verify() {
          throw new GoogleIdentityVerificationError("Invalid Google token");
        },
      },
    });
    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/google",
      payload: { idToken },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe("GOOGLE_TOKEN_INVALID");
    await app.close();
  });
});
