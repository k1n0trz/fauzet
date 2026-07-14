import { describe, expect, it } from "vitest";
import { AuthService } from "./auth.js";
import { MemoryAuthStore } from "../infrastructure/memory-auth-store.js";

const registration = {
  email: "mateo@example.com",
  password: "ValidPassword123",
  displayName: "Mateo",
  countryCode: "CO",
  locale: "es" as const,
  acceptedTerms: true as const,
  isAdult: true as const,
};

describe("AuthService", () => {
  it("registers, authenticates and revokes an opaque session", async () => {
    const service = new AuthService(
      new MemoryAuthStore(),
      "a-secret-with-more-than-thirty-two-characters",
      30,
    );
    const session = await service.register(registration);
    expect(session.token).not.toContain(session.user.id);
    expect((await service.authenticate(session.token)).email).toBe(
      registration.email,
    );
    await service.logout(session.token);
    await expect(service.authenticate(session.token)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
  it("does not reveal whether a bad login email exists", async () => {
    const service = new AuthService(
      new MemoryAuthStore(),
      "a-secret-with-more-than-thirty-two-characters",
      30,
    );
    await expect(
      service.login({ email: "missing@example.com", password: "bad" }),
    ).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
  });
  it("links a verified Google identity to an existing email without duplicating the user", async () => {
    const store = new MemoryAuthStore();
    const service = new AuthService(
      store,
      "a-secret-with-more-than-thirty-two-characters",
      30,
    );
    const registered = await service.register(registration);
    const google = await service.loginWithGoogle(
      {
        subject: "google-subject-existing",
        email: registration.email,
        displayName: registration.displayName,
      },
      undefined,
    );
    expect(google.created).toBe(false);
    expect(google.becameVerified).toBe(true);
    expect(google.session.user.id).toBe(registered.user.id);
    expect(google.session.user.status).toBe("ACTIVE");
  });
  it("requires explicit registration consent before creating a Google-only user", async () => {
    const service = new AuthService(
      new MemoryAuthStore(),
      "a-secret-with-more-than-thirty-two-characters",
      30,
    );
    const identity = {
      subject: "google-subject-new",
      email: "google-new@example.com",
      displayName: "Google New",
    };
    await expect(
      service.loginWithGoogle(identity, undefined),
    ).rejects.toMatchObject({ code: "GOOGLE_REGISTRATION_REQUIRED" });
    const created = await service.loginWithGoogle(identity, {
      displayName: "Google New",
      countryCode: "CO",
      locale: "es",
      acceptedTerms: true,
      isAdult: true,
    });
    expect(created.created).toBe(true);
    expect(created.session.user.status).toBe("ACTIVE");
  });
  it("rejects a second Google subject for an already linked email", async () => {
    const service = new AuthService(
      new MemoryAuthStore(),
      "a-secret-with-more-than-thirty-two-characters",
      30,
    );
    const registrationDetails = {
      displayName: "Google User",
      countryCode: "CO",
      locale: "es" as const,
      acceptedTerms: true as const,
      isAdult: true as const,
    };
    await service.loginWithGoogle(
      {
        subject: "google-subject-first",
        email: "linked@example.com",
        displayName: "Google User",
      },
      registrationDetails,
    );
    await expect(
      service.loginWithGoogle(
        {
          subject: "google-subject-second",
          email: "linked@example.com",
          displayName: "Google User",
        },
        undefined,
      ),
    ).rejects.toMatchObject({ code: "GOOGLE_IDENTITY_CONFLICT" });
  });
});
