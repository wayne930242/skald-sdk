import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  rollDice,
  rollDiceExpression,
  rollD100,
  rollCoC7eSkillCheck,
} from "../roller";

describe("rollDice", () => {
  it("rolls specified number of dice", () => {
    const result = rollDice({ count: 3, sides: 6 });
    expect(result.rolls).toHaveLength(3);
    expect(result.die).toEqual({ count: 3, sides: 6 });
  });

  it("rolls values within valid range", () => {
    const result = rollDice({ count: 10, sides: 6 });
    for (const roll of result.rolls) {
      expect(roll).toBeGreaterThanOrEqual(1);
      expect(roll).toBeLessThanOrEqual(6);
    }
  });

  it("calculates subtotal correctly", () => {
    const mockRandom = vi.spyOn(Math, "random");
    mockRandom
      .mockReturnValueOnce(0.0) // 1
      .mockReturnValueOnce(0.5) // 4
      .mockReturnValueOnce(0.99); // 6

    const result = rollDice({ count: 3, sides: 6 });
    expect(result.rolls).toEqual([1, 4, 6]);
    expect(result.subtotal).toBe(11);
  });
});

describe("rollD100", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns value between 1 and 100", () => {
    for (let i = 0; i < 100; i++) {
      const result = rollD100();
      expect(result).toBeGreaterThanOrEqual(1);
      expect(result).toBeLessThanOrEqual(100);
    }
  });

  it("calculates correct value with mocked random", () => {
    const mockRandom = vi.spyOn(Math, "random");

    // Test minimum value
    mockRandom.mockReturnValueOnce(0.0);
    expect(rollD100()).toBe(1);

    // Test middle value
    mockRandom.mockReturnValueOnce(0.5);
    expect(rollD100()).toBe(51);

    // Test maximum value (0.99... should give 100)
    mockRandom.mockReturnValueOnce(0.99);
    expect(rollD100()).toBe(100);
  });
});

describe("rollDiceExpression", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("rolls a simple expression: 1D6", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);

    const result = rollDiceExpression("1D6");
    expect(result).not.toBeNull();
    expect(result!.expression).toBe("1D6");
    expect(result!.total).toBe(4); // floor(0.5 * 6) + 1 = 4
  });

  it("applies positive modifier: 2D6+6", () => {
    vi.spyOn(Math, "random")
      .mockReturnValueOnce(0.5) // 4
      .mockReturnValueOnce(0.5); // 4

    const result = rollDiceExpression("2D6+6");
    expect(result!.total).toBe(14); // 4 + 4 + 6
  });

  it("applies negative modifier: 2D6-3", () => {
    vi.spyOn(Math, "random")
      .mockReturnValueOnce(0.5) // 4
      .mockReturnValueOnce(0.5); // 4

    const result = rollDiceExpression("2D6-3");
    expect(result!.total).toBe(5); // 4 + 4 - 3
  });

  it("applies multiplier: 3D6×5", () => {
    vi.spyOn(Math, "random")
      .mockReturnValueOnce(0.5) // 4
      .mockReturnValueOnce(0.5) // 4
      .mockReturnValueOnce(0.5); // 4

    const result = rollDiceExpression("3D6×5");
    expect(result!.total).toBe(60); // (4 + 4 + 4) × 5
  });

  it("applies modifier and multiplier: (2D6+6)×5", () => {
    vi.spyOn(Math, "random")
      .mockReturnValueOnce(0.5) // 4
      .mockReturnValueOnce(0.5); // 4

    const result = rollDiceExpression("(2D6+6)×5");
    expect(result!.total).toBe(70); // (4 + 4 + 6) × 5
  });

  it("returns null for invalid expression", () => {
    const result = rollDiceExpression("invalid");
    expect(result).toBeNull();
  });

  it("subtracts a negative dice group: 2D6-1D4", () => {
    vi.spyOn(Math, "random")
      .mockReturnValueOnce(0.5) // 4
      .mockReturnValueOnce(0.5) // 4
      .mockReturnValueOnce(0.5); // 3

    const result = rollDiceExpression("2D6-1D4");
    expect(result!.total).toBe(5); // (4 + 4) - 3
  });
});

describe("rollCoC7eSkillCheck", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns correct structure for basic check", () => {
    const result = rollCoC7eSkillCheck({
      skillName: "Spot Hidden",
      targetValue: 50,
    });

    expect(result.type).toBe("skill_check");
    expect(result.skillName).toBe("Spot Hidden");
    expect(result.targetValue).toBe(50);
    expect(result.roll).toBeGreaterThanOrEqual(1);
    expect(result.roll).toBeLessThanOrEqual(100);
    expect(result.successLevel).toBeDefined();
    expect(result.unitsDice).toHaveLength(1);
    expect(result.tensDice).toHaveLength(1);
  });

  it("handles bonus dice correctly", () => {
    const result = rollCoC7eSkillCheck({
      skillName: "Dodge",
      targetValue: 40,
      bonusDice: 1,
    });

    expect(result.bonusDice).toBe(1);
    expect(result.tensDice).toHaveLength(2); // Original + 1 bonus
    expect(result.unitsDice).toHaveLength(1);
    // Should pick the lower tens die for success
    expect(result.selectedTens).toBe(Math.min(...result.tensDice!));
  });

  it("handles penalty dice correctly", () => {
    const result = rollCoC7eSkillCheck({
      skillName: "Dodge",
      targetValue: 40,
      bonusDice: -1, // Penalty
    });

    expect(result.bonusDice).toBe(-1);
    expect(result.tensDice).toHaveLength(2); // Original + 1 penalty
    expect(result.unitsDice).toHaveLength(1);
    // Should pick the higher tens die for failure
    expect(result.selectedTens).toBe(Math.max(...result.tensDice!));
  });

  it("handles multiple bonus dice", () => {
    const result = rollCoC7eSkillCheck({
      skillName: "Listen",
      targetValue: 60,
      bonusDice: 2,
    });

    expect(result.bonusDice).toBe(2);
    expect(result.tensDice).toHaveLength(3); // Original + 2 bonus
    expect(result.selectedTens).toBe(Math.min(...result.tensDice!));
  });

  it("handles multiple penalty dice", () => {
    const result = rollCoC7eSkillCheck({
      skillName: "Listen",
      targetValue: 60,
      bonusDice: -2,
    });

    expect(result.bonusDice).toBe(-2);
    expect(result.tensDice).toHaveLength(3); // Original + 2 penalty
    expect(result.selectedTens).toBe(Math.max(...result.tensDice!));
  });

  it("calculates roll correctly with mocked random", () => {
    const mockRandom = vi.spyOn(Math, "random");
    // Units die: 0.3 * 10 = 3
    mockRandom.mockReturnValueOnce(0.3);
    // Tens die: 0.4 * 10 = 4, * 10 = 40
    mockRandom.mockReturnValueOnce(0.4);

    const result = rollCoC7eSkillCheck({
      skillName: "Spot Hidden",
      targetValue: 50,
    });

    expect(result.selectedUnits).toBe(3);
    expect(result.selectedTens).toBe(40);
    expect(result.roll).toBe(43);
  });

  it("handles 00 + 0 = 100 special case", () => {
    const mockRandom = vi.spyOn(Math, "random");
    // Units die: 0.0 * 10 = 0
    mockRandom.mockReturnValueOnce(0.0);
    // Tens die: 0.0 * 10 = 0, * 10 = 0 (00)
    mockRandom.mockReturnValueOnce(0.0);

    const result = rollCoC7eSkillCheck({
      skillName: "Spot Hidden",
      targetValue: 50,
    });

    expect(result.selectedUnits).toBe(0);
    expect(result.selectedTens).toBe(0);
    expect(result.roll).toBe(100); // 00 + 0 = 100
  });

  it("picks lowest tens with bonus dice (mocked)", () => {
    const mockRandom = vi.spyOn(Math, "random");
    // Units die: 5
    mockRandom.mockReturnValueOnce(0.5);
    // First tens die: 70
    mockRandom.mockReturnValueOnce(0.7);
    // Second tens die (bonus): 20
    mockRandom.mockReturnValueOnce(0.2);

    const result = rollCoC7eSkillCheck({
      skillName: "Dodge",
      targetValue: 40,
      bonusDice: 1,
    });

    expect(result.tensDice).toEqual([70, 20]);
    expect(result.selectedTens).toBe(20); // Pick lower
    expect(result.roll).toBe(25); // 20 + 5
  });

  it("picks highest tens with penalty dice (mocked)", () => {
    const mockRandom = vi.spyOn(Math, "random");
    // Units die: 5
    mockRandom.mockReturnValueOnce(0.5);
    // First tens die: 20
    mockRandom.mockReturnValueOnce(0.2);
    // Second tens die (penalty): 70
    mockRandom.mockReturnValueOnce(0.7);

    const result = rollCoC7eSkillCheck({
      skillName: "Dodge",
      targetValue: 40,
      bonusDice: -1,
    });

    expect(result.tensDice).toEqual([20, 70]);
    expect(result.selectedTens).toBe(70); // Pick higher
    expect(result.roll).toBe(75); // 70 + 5
  });

  it("returns undefined bonusDice when no bonus/penalty", () => {
    const result = rollCoC7eSkillCheck({
      skillName: "Spot Hidden",
      targetValue: 50,
    });

    expect(result.bonusDice).toBeUndefined();
  });

  it("calculates correct success level", () => {
    const mockRandom = vi.spyOn(Math, "random");
    // Units die: 5
    mockRandom.mockReturnValueOnce(0.5);
    // Tens die: 20
    mockRandom.mockReturnValueOnce(0.2);

    const result = rollCoC7eSkillCheck({
      skillName: "Spot Hidden",
      targetValue: 50,
    });

    expect(result.roll).toBe(25);
    expect(result.successLevel).toBe("hard"); // 25 <= 25 (half of 50)
  });
});

describe("rollDice - Fudge dice", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should roll Fudge dice with values -1, 0, or 1", () => {
    const result = rollDice({ count: 4, sides: "F" });
    expect(result.rolls).toHaveLength(4);
    result.rolls.forEach((roll) => {
      expect([-1, 0, 1]).toContain(roll);
    });
  });

  it("should calculate subtotal correctly for Fudge dice", () => {
    // Mock random to return predictable values
    const mockRandom = vi.spyOn(Math, "random");
    // Returns: 0.1 (-1), 0.4 (0), 0.7 (+1), 0.9 (+1) = total 1
    mockRandom
      .mockReturnValueOnce(0.1)
      .mockReturnValueOnce(0.4)
      .mockReturnValueOnce(0.7)
      .mockReturnValueOnce(0.9);

    const result = rollDice({ count: 4, sides: "F" });
    expect(result.rolls).toEqual([-1, 0, 1, 1]);
    expect(result.subtotal).toBe(1);
  });
});

describe("rollDiceExpression - Fudge dice", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should roll 4dF+3", () => {
    const mockRandom = vi.spyOn(Math, "random");
    // All zeros = 0, +3 modifier = 3
    mockRandom.mockReturnValue(0.5);

    const result = rollDiceExpression("4dF+3");
    expect(result).not.toBeNull();
    expect(result!.dice[0].die).toEqual({ count: 4, sides: "F" });
    expect(result!.modifier).toBe(3);
    expect(result!.total).toBe(3);
  });

  it("should roll 4dF-2 (negative modifier)", () => {
    const mockRandom = vi.spyOn(Math, "random");
    // All zeros = 0, -2 modifier = -2
    mockRandom.mockReturnValue(0.5);

    const result = rollDiceExpression("4dF-2");
    expect(result).not.toBeNull();
    expect(result!.dice[0].die).toEqual({ count: 4, sides: "F" });
    expect(result!.modifier).toBe(-2);
    expect(result!.total).toBe(-2);
  });

  it("should handle all positive Fudge dice (+4 total)", () => {
    const mockRandom = vi.spyOn(Math, "random");
    // All values >= 0.67 = +1, so 4 dice = +4
    mockRandom.mockReturnValue(0.9);

    const result = rollDiceExpression("4dF");
    expect(result).not.toBeNull();
    expect(result!.dice[0].rolls).toEqual([1, 1, 1, 1]);
    expect(result!.total).toBe(4);
  });

  it("should handle all negative Fudge dice (-4 total)", () => {
    const mockRandom = vi.spyOn(Math, "random");
    // All values < 0.33 = -1, so 4 dice = -4
    mockRandom.mockReturnValue(0.1);

    const result = rollDiceExpression("4dF");
    expect(result).not.toBeNull();
    expect(result!.dice[0].rolls).toEqual([-1, -1, -1, -1]);
    expect(result!.total).toBe(-4);
  });

  it("should handle all zero Fudge dice (0 total)", () => {
    const mockRandom = vi.spyOn(Math, "random");
    // All values 0.33 <= x < 0.67 = 0, so 4 dice = 0
    mockRandom.mockReturnValue(0.5);

    const result = rollDiceExpression("4dF");
    expect(result).not.toBeNull();
    expect(result!.dice[0].rolls).toEqual([0, 0, 0, 0]);
    expect(result!.total).toBe(0);
  });

  it("should handle mixed Fudge dice results", () => {
    const mockRandom = vi.spyOn(Math, "random");
    // Returns: 0.1 (-1), 0.5 (0), 0.8 (+1), 0.5 (0) = total 0
    mockRandom
      .mockReturnValueOnce(0.1)
      .mockReturnValueOnce(0.5)
      .mockReturnValueOnce(0.8)
      .mockReturnValueOnce(0.5);

    const result = rollDiceExpression("4dF");
    expect(result).not.toBeNull();
    expect(result!.dice[0].rolls).toEqual([-1, 0, 1, 0]);
    expect(result!.total).toBe(0);
  });

  it("should calculate correct result with modifier and mixed dice", () => {
    const mockRandom = vi.spyOn(Math, "random");
    // Returns: 0.1 (-1), 0.8 (+1), 0.8 (+1), 0.1 (-1) = total 0, +3 modifier = 3
    mockRandom
      .mockReturnValueOnce(0.1)
      .mockReturnValueOnce(0.8)
      .mockReturnValueOnce(0.8)
      .mockReturnValueOnce(0.1);

    const result = rollDiceExpression("4dF+3");
    expect(result).not.toBeNull();
    expect(result!.dice[0].rolls).toEqual([-1, 1, 1, -1]);
    expect(result!.total).toBe(3); // 0 + 3
  });
});

describe("rollDice - dice modifiers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("exploding dice", () => {
    it("should roll additional die when hitting max value", () => {
      const mockRandom = vi.spyOn(Math, "random");
      // First roll: 6 (max), second roll: 3 (stop)
      mockRandom
        .mockReturnValueOnce(0.99) // 6 on d6
        .mockReturnValueOnce(0.4); // 3 on d6

      const result = rollDice({
        count: 1,
        sides: 6,
        modifiers: { exploding: true },
      });

      expect(result.rolls).toHaveLength(2);
      expect(result.detailedRolls![0].exploded).toBe(true);
      expect(result.detailedRolls![0].value).toBe(6);
      expect(result.detailedRolls![1].value).toBe(3);
      expect(result.subtotal).toBe(9); // 6 + 3
    });

    it("should chain explosions when rolling multiple max values", () => {
      const mockRandom = vi.spyOn(Math, "random");
      // Roll: 6 (explodes), 6 (explodes), 4 (stops)
      mockRandom
        .mockReturnValueOnce(0.99) // 6
        .mockReturnValueOnce(0.99) // 6
        .mockReturnValueOnce(0.5); // 4

      const result = rollDice({
        count: 1,
        sides: 6,
        modifiers: { exploding: true },
      });

      expect(result.rolls).toHaveLength(3);
      expect(result.detailedRolls![0].exploded).toBe(true);
      expect(result.detailedRolls![1].exploded).toBe(true);
      expect(result.detailedRolls![2].exploded).toBe(false);
      expect(result.subtotal).toBe(16); // 6 + 6 + 4
    });

    it("should not explode when not hitting max value", () => {
      const mockRandom = vi.spyOn(Math, "random");
      mockRandom.mockReturnValueOnce(0.5); // 4 on d6

      const result = rollDice({
        count: 1,
        sides: 6,
        modifiers: { exploding: true },
      });

      expect(result.rolls).toHaveLength(1);
      expect(result.detailedRolls![0].exploded).toBe(false);
      expect(result.subtotal).toBe(4);
    });

    it("should use custom explodeOn threshold", () => {
      const mockRandom = vi.spyOn(Math, "random");
      // Roll: 5 (explodes on 5+), then 3 (stops)
      mockRandom
        .mockReturnValueOnce(0.7) // 5
        .mockReturnValueOnce(0.4); // 3

      const result = rollDice({
        count: 1,
        sides: 6,
        modifiers: { exploding: true, explodeOn: 5 },
      });

      expect(result.rolls).toHaveLength(2);
      expect(result.detailedRolls![0].exploded).toBe(true);
      expect(result.subtotal).toBe(8); // 5 + 3
    });
  });

  describe("compounding dice", () => {
    it("should add additional rolls to same die value", () => {
      const mockRandom = vi.spyOn(Math, "random");
      // Roll 6, then 6 again, then 3 (stop)
      mockRandom
        .mockReturnValueOnce(0.99) // 6
        .mockReturnValueOnce(0.99) // 6 (continues compounding)
        .mockReturnValueOnce(0.4); // 3 (stops)

      const result = rollDice({
        count: 1,
        sides: 6,
        modifiers: { compounding: true },
      });

      expect(result.rolls).toHaveLength(1); // Only 1 die, but compounded
      expect(result.detailedRolls![0].value).toBe(15); // 6 + 6 + 3
      expect(result.detailedRolls![0].exploded).toBe(true);
      expect(result.subtotal).toBe(15);
    });

    it("should not compound when not hitting max value", () => {
      const mockRandom = vi.spyOn(Math, "random");
      mockRandom.mockReturnValueOnce(0.5); // 4 on d6

      const result = rollDice({
        count: 1,
        sides: 6,
        modifiers: { compounding: true },
      });

      expect(result.rolls).toHaveLength(1);
      expect(result.detailedRolls![0].value).toBe(4);
      expect(result.detailedRolls![0].exploded).toBe(false);
      expect(result.subtotal).toBe(4);
    });

    it("should compound multiple dice independently", () => {
      const mockRandom = vi.spyOn(Math, "random");
      // First die: 6 -> 3, Second die: 4 (no compound)
      mockRandom
        .mockReturnValueOnce(0.99) // 6 (first die)
        .mockReturnValueOnce(0.5) // 4 (second die)
        .mockReturnValueOnce(0.4); // 3 (compound for first die)

      const result = rollDice({
        count: 2,
        sides: 6,
        modifiers: { compounding: true },
      });

      expect(result.rolls).toHaveLength(2);
      expect(result.detailedRolls![0].value).toBe(9); // 6 + 3
      expect(result.detailedRolls![1].value).toBe(4);
      expect(result.subtotal).toBe(13);
    });
  });

  describe("penetrating dice", () => {
    it("should roll additional die with -1 penalty when hitting max", () => {
      const mockRandom = vi.spyOn(Math, "random");
      mockRandom
        .mockReturnValueOnce(0.99) // 6 (max)
        .mockReturnValueOnce(0.5); // would be 4, but -1 = 3

      const result = rollDice({
        count: 1,
        sides: 6,
        modifiers: { penetrating: true },
      });

      expect(result.rolls).toHaveLength(2);
      expect(result.detailedRolls![0].value).toBe(6);
      expect(result.detailedRolls![0].exploded).toBe(true);
      expect(result.detailedRolls![1].value).toBe(3); // 4 - 1 = 3
      expect(result.subtotal).toBe(9); // 6 + 3
    });

    it("should not reduce below 1", () => {
      const mockRandom = vi.spyOn(Math, "random");
      mockRandom
        .mockReturnValueOnce(0.99) // 6 (max)
        .mockReturnValueOnce(0.0); // would be 1, -1 = 0, but min is 1

      const result = rollDice({
        count: 1,
        sides: 6,
        modifiers: { penetrating: true },
      });

      expect(result.rolls).toHaveLength(2);
      expect(result.detailedRolls![1].value).toBe(1); // Min 1
      expect(result.subtotal).toBe(7); // 6 + 1
    });

    it("should chain penetrating explosions", () => {
      const mockRandom = vi.spyOn(Math, "random");
      // Roll: 6 (penetrates), 6-1=5 (doesn't penetrate because 5 < 6)
      mockRandom
        .mockReturnValueOnce(0.99) // 6
        .mockReturnValueOnce(0.99); // 6 - 1 = 5

      const result = rollDice({
        count: 1,
        sides: 6,
        modifiers: { penetrating: true },
      });

      expect(result.rolls).toHaveLength(2);
      expect(result.detailedRolls![0].value).toBe(6);
      expect(result.detailedRolls![1].value).toBe(5); // 6 - 1 = 5
      expect(result.subtotal).toBe(11);
    });
  });

  describe("keep highest", () => {
    it("should keep only the N highest dice", () => {
      const mockRandom = vi.spyOn(Math, "random");
      // Roll 4 dice: 2, 5, 1, 6
      mockRandom
        .mockReturnValueOnce(0.2) // 2
        .mockReturnValueOnce(0.7) // 5
        .mockReturnValueOnce(0.0) // 1
        .mockReturnValueOnce(0.99); // 6

      const result = rollDice({
        count: 4,
        sides: 6,
        modifiers: { keepHighest: 2 },
      });

      expect(result.rolls).toEqual([2, 5, 1, 6]);
      const keptRolls = result.detailedRolls!.filter((r) => r.kept);
      expect(keptRolls).toHaveLength(2);
      expect(keptRolls.map((r) => r.value).sort((a, b) => b - a)).toEqual([
        6, 5,
      ]);
      expect(result.subtotal).toBe(11); // 5 + 6
    });

    it("should keep all dice if N >= dice count", () => {
      const mockRandom = vi.spyOn(Math, "random");
      mockRandom
        .mockReturnValueOnce(0.2) // 2
        .mockReturnValueOnce(0.5); // 4

      const result = rollDice({
        count: 2,
        sides: 6,
        modifiers: { keepHighest: 5 },
      });

      const keptRolls = result.detailedRolls!.filter((r) => r.kept);
      expect(keptRolls).toHaveLength(2);
      expect(result.subtotal).toBe(6); // 2 + 4
    });
  });

  describe("keep lowest", () => {
    it("should keep only the N lowest dice", () => {
      const mockRandom = vi.spyOn(Math, "random");
      // Roll 4 dice: 2, 5, 1, 6
      mockRandom
        .mockReturnValueOnce(0.2) // 2
        .mockReturnValueOnce(0.7) // 5
        .mockReturnValueOnce(0.0) // 1
        .mockReturnValueOnce(0.99); // 6

      const result = rollDice({
        count: 4,
        sides: 6,
        modifiers: { keepLowest: 2 },
      });

      expect(result.rolls).toEqual([2, 5, 1, 6]);
      const keptRolls = result.detailedRolls!.filter((r) => r.kept);
      expect(keptRolls).toHaveLength(2);
      expect(keptRolls.map((r) => r.value).sort((a, b) => a - b)).toEqual([
        1, 2,
      ]);
      expect(result.subtotal).toBe(3); // 1 + 2
    });

    it("should keep all dice if N >= dice count", () => {
      const mockRandom = vi.spyOn(Math, "random");
      mockRandom
        .mockReturnValueOnce(0.2) // 2
        .mockReturnValueOnce(0.5); // 4

      const result = rollDice({
        count: 2,
        sides: 6,
        modifiers: { keepLowest: 5 },
      });

      const keptRolls = result.detailedRolls!.filter((r) => r.kept);
      expect(keptRolls).toHaveLength(2);
      expect(result.subtotal).toBe(6); // 2 + 4
    });
  });

  describe("drop highest", () => {
    it("should drop the N highest dice", () => {
      const mockRandom = vi.spyOn(Math, "random");
      // Roll 4 dice: 2, 5, 1, 6
      mockRandom
        .mockReturnValueOnce(0.2) // 2
        .mockReturnValueOnce(0.7) // 5
        .mockReturnValueOnce(0.0) // 1
        .mockReturnValueOnce(0.99); // 6

      const result = rollDice({
        count: 4,
        sides: 6,
        modifiers: { dropHighest: 2 },
      });

      expect(result.rolls).toEqual([2, 5, 1, 6]);
      const keptRolls = result.detailedRolls!.filter((r) => r.kept);
      expect(keptRolls).toHaveLength(2);
      expect(keptRolls.map((r) => r.value).sort((a, b) => a - b)).toEqual([
        1, 2,
      ]);
      expect(result.subtotal).toBe(3); // 1 + 2
    });

    it("should drop all dice if N >= dice count", () => {
      const mockRandom = vi.spyOn(Math, "random");
      mockRandom
        .mockReturnValueOnce(0.2) // 2
        .mockReturnValueOnce(0.5); // 4

      const result = rollDice({
        count: 2,
        sides: 6,
        modifiers: { dropHighest: 5 },
      });

      const keptRolls = result.detailedRolls!.filter((r) => r.kept);
      expect(keptRolls).toHaveLength(0);
      expect(result.subtotal).toBe(0);
    });
  });

  describe("drop lowest", () => {
    it("should drop the N lowest dice", () => {
      const mockRandom = vi.spyOn(Math, "random");
      // Roll 4 dice: 2, 5, 1, 6
      mockRandom
        .mockReturnValueOnce(0.2) // 2
        .mockReturnValueOnce(0.7) // 5
        .mockReturnValueOnce(0.0) // 1
        .mockReturnValueOnce(0.99); // 6

      const result = rollDice({
        count: 4,
        sides: 6,
        modifiers: { dropLowest: 1 },
      });

      expect(result.rolls).toEqual([2, 5, 1, 6]);
      const keptRolls = result.detailedRolls!.filter((r) => r.kept);
      expect(keptRolls).toHaveLength(3);
      expect(keptRolls.map((r) => r.value).sort((a, b) => b - a)).toEqual([
        6, 5, 2,
      ]);
      expect(result.subtotal).toBe(13); // 2 + 5 + 6
    });

    it("should drop all dice if N >= dice count", () => {
      const mockRandom = vi.spyOn(Math, "random");
      mockRandom
        .mockReturnValueOnce(0.2) // 2
        .mockReturnValueOnce(0.5); // 4

      const result = rollDice({
        count: 2,
        sides: 6,
        modifiers: { dropLowest: 5 },
      });

      const keptRolls = result.detailedRolls!.filter((r) => r.kept);
      expect(keptRolls).toHaveLength(0);
      expect(result.subtotal).toBe(0);
    });
  });

  describe("combined modifiers", () => {
    it("should not explode Fudge dice", () => {
      const mockRandom = vi.spyOn(Math, "random");
      mockRandom.mockReturnValue(0.9); // Would be +1 (max for Fudge)

      const result = rollDice({
        count: 1,
        sides: "F",
        modifiers: { exploding: true },
      });

      expect(result.rolls).toHaveLength(1); // No explosion
      expect(result.subtotal).toBe(1);
    });

    it("should apply exploding and keep highest together", () => {
      const mockRandom = vi.spyOn(Math, "random");
      // Roll 2 dice: 6 (explodes -> 3), 4
      mockRandom
        .mockReturnValueOnce(0.99) // 6 (explodes)
        .mockReturnValueOnce(0.5) // 4
        .mockReturnValueOnce(0.4); // 3 (from explosion)

      const result = rollDice({
        count: 2,
        sides: 6,
        modifiers: { exploding: true, keepHighest: 2 },
      });

      // Should have 3 rolls: 6, 4, 3
      expect(result.rolls).toHaveLength(3);
      const keptRolls = result.detailedRolls!.filter((r) => r.kept);
      expect(keptRolls).toHaveLength(2);
      // Keep highest 2: 6 and 4
      expect(result.subtotal).toBe(10); // 6 + 4
    });
  });
});

describe("random source", () => {
  /** A source that returns the given numbers in order. */
  const sequence = (...values: number[]) => () => {
    const next = values.shift();
    if (next === undefined) throw new Error("no number left");
    return next;
  };

  it("rolls every die from the given source instead of Math.random", () => {
    const spy = vi.spyOn(Math, "random");
    // 0.0 -> 1, 0.5 -> 4, 0.99 -> 6 on a d6.
    const result = rollDiceExpression("3d6", sequence(0, 0.5, 0.99));
    expect(result?.dice[0].rolls).toEqual([1, 4, 6]);
    expect(result?.total).toBe(11);
    expect(rollD100(sequence(0.42))).toBe(43);
    // Tens 0.35 -> 30, units 0.2 -> 2 (units are rolled first).
    expect(rollCoC7eSkillCheck({ skillName: "x", targetValue: 50 }, sequence(0.2, 0.35)).roll).toBe(32);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
