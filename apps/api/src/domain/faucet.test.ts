import { describe, expect, it } from "vitest";
import type { PublicUser } from "@fauzet/contracts";
import { FaucetService } from "./faucet.js";
import { MemoryFaucetStore } from "../infrastructure/memory-faucet-store.js";

const activeUser: PublicUser = {
  id: "10000000-0000-4000-8000-000000000001",
  email: "active@fauzet.local",
  displayName: "Active User",
  locale: "es",
  countryCode: "CO",
  status: "ACTIVE",
  roles: ["USER"],
};
const context = {
  ipHash: "ip-hash-a",
  deviceId: "20000000-0000-4000-8000-000000000002",
};

describe("FaucetService", () => {
  it("requires an ACTIVE verified user and a UUID-bound device context", async () => {
    const service = new FaucetService(new MemoryFaucetStore());
    await expect(
      service.status(
        { ...activeUser, status: "PENDING_VERIFICATION" },
        context,
      ),
    ).rejects.toMatchObject({ code: "FAUCET_ACCOUNT_NOT_ELIGIBLE" });
    await expect(
      service.createChallenge(activeUser, { ipHash: "ip-hash-a" }),
    ).rejects.toMatchObject({ code: "FAUCET_DEVICE_REQUIRED" });
  });

  it("consumes a challenge once, replays the same idempotent claim and enforces cooldown", async () => {
    let now = new Date("2026-07-12T00:00:00.000Z");
    const service = new FaucetService(
      new MemoryFaucetStore(),
      () => new Date(now),
    );
    const challenge = await service.createChallenge(activeUser, context);
    const first = await service.claim(
      activeUser,
      { challengeId: challenge.id, idempotencyKey: "claim-one" },
      context,
    );
    const replay = await service.claim(
      activeUser,
      { challengeId: challenge.id, idempotencyKey: "claim-one" },
      context,
    );
    expect(first.replayed).toBe(false);
    expect(replay).toMatchObject({
      replayed: true,
      claim: { id: first.claim.id, transactionId: first.claim.transactionId },
    });
    await expect(
      service.createChallenge(activeUser, context),
    ).rejects.toMatchObject({ code: "FAUCET_COOLDOWN" });

    now = new Date(now.getTime() + 900_001);
    await expect(service.status(activeUser, context)).resolves.toMatchObject({
      state: "READY",
      claimsToday: 1,
    });
  });

  it("binds challenges to the issuing IP and device", async () => {
    const service = new FaucetService(new MemoryFaucetStore());
    const challenge = await service.createChallenge(activeUser, context);
    await expect(
      service.claim(
        activeUser,
        { challengeId: challenge.id, idempotencyKey: "claim-context" },
        { ...context, ipHash: "ip-hash-b" },
      ),
    ).rejects.toMatchObject({ code: "FAUCET_CONTEXT_MISMATCH" });
  });

  it("blocks after the honest CAPTCHA threshold when no provider exists", async () => {
    let now = new Date("2026-07-12T01:00:00.000Z");
    const service = new FaucetService(
      new MemoryFaucetStore(),
      () => new Date(now),
    );
    for (let index = 0; index < 3; index += 1) {
      const challenge = await service.createChallenge(activeUser, context);
      await service.claim(
        activeUser,
        {
          challengeId: challenge.id,
          idempotencyKey: `captcha-${index}`,
        },
        context,
      );
      now = new Date(now.getTime() + 900_001);
    }
    await expect(service.status(activeUser, context)).resolves.toMatchObject({
      state: "CAPTCHA_REQUIRED",
      canClaim: false,
      captchaRequired: true,
    });
    await expect(
      service.createChallenge(activeUser, context),
    ).rejects.toMatchObject({ code: "FAUCET_CAPTCHA_REQUIRED" });
  });

  it("applies the configured 20 percent reward multiplier on day seven", async () => {
    let now = new Date("2026-07-01T12:00:00.000Z");
    const service = new FaucetService(
      new MemoryFaucetStore(),
      () => new Date(now),
    );
    let lastReward = "0";
    for (let day = 1; day <= 7; day += 1) {
      const challenge = await service.createChallenge(activeUser, context);
      const result = await service.claim(
        activeUser,
        { challengeId: challenge.id, idempotencyKey: `streak-${day}` },
        context,
      );
      lastReward = result.claim.reward.minorUnits;
      if (day < 7) now = new Date(now.getTime() + 86_400_000);
    }
    expect(lastReward).toBe("6");
    await expect(service.status(activeUser, context)).resolves.toMatchObject({
      streakDays: 7,
      bonusMultiplier: "1.2",
    });
  });

  it("enforces shared daily device and IP limits across accounts", async () => {
    const now = new Date("2026-07-12T05:00:00.000Z");
    const deviceStore = new MemoryFaucetStore();
    const deviceService = new FaucetService(deviceStore, () => now);
    for (let index = 0; index < 8; index += 1) {
      const user = { ...activeUser, id: `device-user-${index}` };
      const challenge = await deviceService.createChallenge(user, context);
      await deviceService.claim(
        user,
        { challengeId: challenge.id, idempotencyKey: `device-${index}` },
        context,
      );
    }
    await expect(
      deviceService.status(
        { ...activeUser, id: "device-user-blocked" },
        context,
      ),
    ).resolves.toMatchObject({ state: "DEVICE_LIMIT" });

    const ipStore = new MemoryFaucetStore();
    const ipService = new FaucetService(ipStore, () => now);
    for (let index = 0; index < 24; index += 1) {
      const user = { ...activeUser, id: `ip-user-${index}` };
      const uniqueContext = {
        ipHash: "shared-ip",
        deviceId: `30000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      };
      const challenge = await ipService.createChallenge(user, uniqueContext);
      await ipService.claim(
        user,
        { challengeId: challenge.id, idempotencyKey: `ip-claim-${index}` },
        uniqueContext,
      );
    }
    await expect(
      ipService.status(
        { ...activeUser, id: "ip-user-blocked" },
        {
          ipHash: "shared-ip",
          deviceId: "40000000-0000-4000-8000-000000000001",
        },
      ),
    ).resolves.toMatchObject({ state: "IP_LIMIT" });
  });
});
