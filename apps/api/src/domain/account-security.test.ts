import { describe, expect, it } from "vitest";
import { AccountSecurityService } from "./account-security.js";
import { MemoryAccountSecurityStore } from "../infrastructure/memory-account-security-store.js";
import { MemoryMailer } from "../infrastructure/memory-mailer.js";

describe("AccountSecurityService", () => {
  it("verifies email with a single-use opaque token", async () => {
    const store = new MemoryAccountSecurityStore();
    const mailer = new MemoryMailer();
    const user = {
      id: crypto.randomUUID(),
      email: "mateo@example.com",
      displayName: "Mateo",
      status: "PENDING_VERIFICATION",
    };
    store.addUser(user);
    const service = new AccountSecurityService(
      store,
      mailer,
      "token-secret-with-at-least-thirty-two-chars",
    );
    await service.requestEmailVerification(user);
    expect(mailer.verification).toHaveLength(1);
    await expect(
      service.confirmEmail(mailer.verification[0]!.token),
    ).resolves.toMatchObject(user);
    await expect(
      service.confirmEmail(mailer.verification[0]!.token),
    ).rejects.toMatchObject({ code: "TOKEN_INVALID_OR_EXPIRED" });
  });
  it("does not reveal unknown reset emails and consumes a reset once", async () => {
    const store = new MemoryAccountSecurityStore();
    const mailer = new MemoryMailer();
    const user = {
      id: crypto.randomUUID(),
      email: "mateo@example.com",
      displayName: "Mateo",
      status: "PENDING_VERIFICATION",
    };
    store.addUser(user);
    const service = new AccountSecurityService(
      store,
      mailer,
      "token-secret-with-at-least-thirty-two-chars",
    );
    await service.requestPasswordReset("unknown@example.com");
    expect(mailer.resets).toHaveLength(0);
    await service.requestPasswordReset(user.email);
    expect(mailer.resets).toHaveLength(1);
    await expect(
      service.resetPassword(mailer.resets[0]!.token, "NewValidPassword123"),
    ).resolves.toMatchObject(user);
  });
});
