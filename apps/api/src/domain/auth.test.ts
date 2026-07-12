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
});
