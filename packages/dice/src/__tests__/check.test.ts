import { describe, it, expect, vi } from "vitest";
import { performCheck, getSuccessLevel, calculateSuccessLevel } from "../check";

describe("getSuccessLevel", () => {
  describe("critical success", () => {
    it("returns critical for roll of 01", () => {
      expect(getSuccessLevel(1, 50)).toBe("critical");
    });

    it("does NOT return critical when roll is 1 and target is 1", () => {
      // 技能只有 1 時，擲出 1 不算大成功
      expect(getSuccessLevel(1, 1)).toBe("regular");
    });
  });

  describe("fumble", () => {
    it("returns fumble for roll of 100", () => {
      expect(getSuccessLevel(100, 50)).toBe("fumble");
    });

    it("returns fumble for roll >= 96 when target < 50", () => {
      expect(getSuccessLevel(96, 40)).toBe("fumble");
      expect(getSuccessLevel(99, 30)).toBe("fumble");
    });

    it("does not fumble on 96-99 when target >= 50", () => {
      expect(getSuccessLevel(96, 50)).toBe("failure");
      expect(getSuccessLevel(99, 60)).toBe("failure");
    });
  });

  describe("extreme success", () => {
    it("returns extreme for roll <= target/5", () => {
      expect(getSuccessLevel(10, 50)).toBe("extreme"); // 10 <= 10
      expect(getSuccessLevel(5, 50)).toBe("extreme"); // 5 <= 10
    });
  });

  describe("hard success", () => {
    it("returns hard for roll <= target/2 but > target/5", () => {
      expect(getSuccessLevel(25, 50)).toBe("hard"); // 25 <= 25, 25 > 10
      expect(getSuccessLevel(15, 50)).toBe("hard"); // 15 <= 25, 15 > 10
    });
  });

  describe("regular success", () => {
    it("returns regular for roll <= target but > target/2", () => {
      expect(getSuccessLevel(50, 50)).toBe("regular"); // 50 <= 50, 50 > 25
      expect(getSuccessLevel(30, 50)).toBe("regular"); // 30 <= 50, 30 > 25
    });
  });

  describe("failure", () => {
    it("returns failure for roll > target", () => {
      expect(getSuccessLevel(51, 50)).toBe("failure");
      expect(getSuccessLevel(80, 50)).toBe("failure");
    });
  });

  describe("edge cases", () => {
    it("handles target of 0", () => {
      expect(getSuccessLevel(1, 0)).toBe("failure");
    });

    it("handles target of 100", () => {
      expect(getSuccessLevel(20, 100)).toBe("extreme");
      expect(getSuccessLevel(50, 100)).toBe("hard");
      expect(getSuccessLevel(100, 100)).toBe("fumble");
    });
  });
});

describe("calculateSuccessLevel (alias)", () => {
  it("is an alias for getSuccessLevel", () => {
    expect(calculateSuccessLevel).toBe(getSuccessLevel);
  });

  it("works identically to getSuccessLevel", () => {
    expect(calculateSuccessLevel(1, 50)).toBe("critical");
    expect(calculateSuccessLevel(10, 50)).toBe("extreme");
    expect(calculateSuccessLevel(25, 50)).toBe("hard");
    expect(calculateSuccessLevel(50, 50)).toBe("regular");
    expect(calculateSuccessLevel(51, 50)).toBe("failure");
    expect(calculateSuccessLevel(100, 50)).toBe("fumble");
  });
});

describe("performCheck", () => {
  it("returns correct check result structure", () => {
    // To get roll 30: need Math.floor(x * 100) + 1 = 30, so x = 0.29 + epsilon
    // Using 29/100 = 0.29 has floating point issues, use a cleaner fraction
    const mockRandom = vi.spyOn(Math, "random").mockReturnValue(0.295);

    const result = performCheck(50);

    expect(result.target).toBe(50);
    expect(result.targetHalf).toBe(25);
    expect(result.targetFifth).toBe(10);
    expect(result.rolled).toBe(30);
    expect(result.successLevel).toBe("regular");
    expect(result.isSuccess).toBe(true);
    expect(result.margin).toBe(20); // 50 - 30

    mockRandom.mockRestore();
  });

  it("calculates failure correctly", () => {
    // To get roll 80: need Math.floor(x * 100) + 1 = 80, so x in [0.79, 0.80)
    const mockRandom = vi.spyOn(Math, "random").mockReturnValue(0.795);

    const result = performCheck(50);

    expect(result.rolled).toBe(80);
    expect(result.successLevel).toBe("failure");
    expect(result.isSuccess).toBe(false);
    expect(result.margin).toBe(-30); // 50 - 80

    mockRandom.mockRestore();
  });
});
