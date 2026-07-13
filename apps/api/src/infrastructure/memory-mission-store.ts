import {
  MissionError,
  type MissionCatalogResult,
  type MissionClaimResult,
  type MissionStore,
} from "../domain/missions.js";

export class MemoryMissionStore implements MissionStore {
  async catalog(): Promise<MissionCatalogResult> {
    const now = new Date();
    const date = now.toISOString().slice(0, 10);
    const expiresAt = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
    ).toISOString();
    return {
      missions: [
        mission(
          "m1",
          date,
          "Reclama 3 veces hoy",
          "daily",
          0,
          3,
          30,
          expiresAt,
        ),
        mission(
          "m2",
          date,
          "Gana 50 ZYXE en juegos",
          "daily",
          0,
          50,
          40,
          expiresAt,
        ),
      ],
      configVersion: 1,
    };
  }

  async claim(): Promise<MissionClaimResult> {
    throw new MissionError(
      "MISSION_CONFIG_INVALID",
      "Persistent mission store is required for mission claims",
      503,
    );
  }
}

function mission(
  id: string,
  periodKey: string,
  title: string,
  category: string,
  progress: number,
  target: number,
  reward: number,
  expiresAt: string,
) {
  return {
    id,
    periodKey,
    configVersion: 1,
    title,
    category,
    requirement: id === "m1" ? "Valid faucet claims" : "Validated game rewards",
    premium: false,
    status: "IN_PROGRESS" as const,
    reasonCode: null,
    progress,
    target,
    reward: {
      asset: "ZYXE" as const,
      minorUnits: String(reward),
      bucket: "AVAILABLE" as const,
    },
    periodEndsAt: expiresAt,
    expiresAt,
  };
}
