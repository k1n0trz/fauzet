import type { GameEventRequest, GameSlug } from "@fauzet/contracts";
import {
  GameError,
  type GameCatalogResult,
  type GameContext,
  type GameEventResult,
  type GameSessionView,
  type GameStore,
} from "../domain/games.js";

export class MemoryGameStore implements GameStore {
  async catalog(): Promise<GameCatalogResult> {
    return {
      games: [
        catalogGame("tap-miner", "Tap Miner", "quick", "EASY", 5, 10, 5, 25),
        catalogGame(
          "memory-drops",
          "Memory Drops",
          "skill",
          "MEDIUM",
          8,
          45,
          10,
          40,
        ),
      ],
      energy: {
        current: 100,
        max: 100,
        regenIntervalSeconds: 300,
        nextUnitAt: null,
      },
      configVersion: 1,
    };
  }

  async createSession(_input: {
    userId: string;
    game: GameSlug;
    idempotencyKey: string;
    context: GameContext;
  }): Promise<{ session: GameSessionView; replayed: boolean }> {
    throw unavailable();
  }

  async getSession(_input: {
    userId: string;
    sessionId: string;
    sessionToken: string;
    context: GameContext;
  }): Promise<{ session: GameSessionView }> {
    throw unavailable();
  }

  async recordEvent(_input: {
    userId: string;
    game: GameSlug;
    sessionId: string;
    event: GameEventRequest;
    context: GameContext;
  }): Promise<GameEventResult> {
    throw unavailable();
  }

  async complete(_input: {
    userId: string;
    game: GameSlug;
    sessionId: string;
    sessionToken: string;
    idempotencyKey: string;
    context: GameContext;
  }): Promise<{ session: GameSessionView; replayed: boolean }> {
    throw unavailable();
  }
}

function catalogGame(
  slug: GameSlug,
  name: string,
  category: "quick" | "skill",
  difficulty: "EASY" | "MEDIUM",
  energyCost: number,
  durationSeconds: number,
  min: number,
  max: number,
) {
  return {
    slug,
    name,
    category,
    difficulty,
    enabled: true,
    lockedReason: null,
    energyCost,
    durationSeconds,
    reward: {
      asset: "ZYXE" as const,
      minMinorUnits: String(min),
      maxMinorUnits: String(max),
      bucket: "AVAILABLE" as const,
    },
    dailyRemaining: 10,
    bestScore: null,
  };
}

function unavailable() {
  return new GameError(
    "GAME_CONFIG_INVALID",
    "Persistent game store is required for session mutations",
    503,
  );
}
