import { describe, expect, it } from "vitest";
import {
  applyMemoryFlip,
  memoryReward,
  memoryScore,
  tapReward,
  validateTapOffsets,
  type MemoryRules,
  type MemoryState,
  type TapRules,
} from "./games.js";

const tapRules: TapRules = {
  enabled: true,
  energyCost: 5,
  durationSeconds: 10,
  rewardMinMinor: 5,
  rewardMaxMinor: 25,
  rewardStepTaps: 4,
  maxTaps: 100,
  minTapIntervalMs: 80,
  maxBatchSize: 25,
};
const memoryRules: MemoryRules = {
  enabled: true,
  energyCost: 8,
  durationSeconds: 45,
  rewardMinMinor: 10,
  rewardMaxMinor: 40,
  symbols: ["A", "B", "C", "D", "E", "F"],
  mismatchLockMs: 700,
  minFlipIntervalMs: 120,
  completionBaseReward: 15,
  partialBaseReward: 5,
  rewardPerPair: 3,
  timeBonusDivisorSeconds: 2,
  scorePerPair: 10,
};
const emptyMemory: MemoryState = {
  matchedIndices: [],
  pendingIndex: null,
  pairs: 0,
  flips: 0,
  lockedUntilMs: 0,
};

describe("server-authoritative game rules", () => {
  it("derives Tap Miner reward only from physically valid accepted taps", () => {
    expect(() => validateTapOffsets(-1, [0, 80, 160], tapRules)).not.toThrow();
    expect(() => validateTapOffsets(160, [200], tapRules)).toThrowError(
      expect.objectContaining({ code: "GAME_EVENT_TOO_FAST" }),
    );
    expect(() => validateTapOffsets(-1, [10_001], tapRules)).toThrowError(
      expect.objectContaining({ code: "GAME_EVENT_INVALID" }),
    );
    expect(tapReward(0, tapRules)).toBe(5);
    expect(tapReward(84, tapRules)).toBe(25);
    expect(tapReward(1_000, tapRules)).toBe(25);
  });

  it("reveals Memory cards one at a time and validates mismatch lock", () => {
    const layout = ["A", "B", "A", "B", "C", "D", "C", "D", "E", "F", "E", "F"];
    const first = applyMemoryFlip(emptyMemory, layout, 0, 0, memoryRules);
    expect(first.reveal).toMatchObject({
      cardIndex: 0,
      symbol: "A",
      matched: false,
    });
    expect(() =>
      applyMemoryFlip(first.state, layout, 0, 120, memoryRules),
    ).toThrow();
    const mismatch = applyMemoryFlip(first.state, layout, 1, 120, memoryRules);
    expect(mismatch.reveal.matched).toBe(false);
    expect(() =>
      applyMemoryFlip(mismatch.state, layout, 2, 500, memoryRules),
    ).toThrow();
    const afterLock = applyMemoryFlip(
      mismatch.state,
      layout,
      0,
      820,
      memoryRules,
    );
    const pair = applyMemoryFlip(afterLock.state, layout, 2, 940, memoryRules);
    expect(pair.reveal).toMatchObject({ matched: true, pairs: 1 });
    expect(pair.state.matchedIndices).toEqual([0, 2]);
  });

  it("uses versioned Memory score and reward parameters within catalog bounds", () => {
    const complete: MemoryState = {
      ...emptyMemory,
      matchedIndices: Array.from({ length: 12 }, (_, index) => index),
      pairs: 6,
      flips: 12,
    };
    expect(memoryScore(complete, 5_000, memoryRules)).toBe(100);
    expect(memoryReward(emptyMemory, 45_000, memoryRules)).toBe(10);
    expect(memoryReward(complete, 0, memoryRules)).toBe(37);
    expect(memoryReward(complete, 45_000, memoryRules)).toBe(15);
  });
});
