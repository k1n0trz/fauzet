import { describe, expect, it } from "vitest";
import { formatAsset, formatMinor } from "./sandbox-convert-experience";

describe("sandbox conversion unit formatting", () => {
  it("formats ZYXE minor units exactly beyond Number.MAX_SAFE_INTEGER", () => {
    expect(formatMinor("9007199254740993123")).toBe(
      "90.071.992.547.409.931,23",
    );
  });

  it("formats eight-decimal sandbox assets without rounding", () => {
    expect(formatAsset("90071992547409931234567890")).toBe(
      "900.719.925.474.099.312,3456789",
    );
    expect(formatAsset("100000000")).toBe("1");
  });
});
