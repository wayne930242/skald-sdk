// @skald/dice roll-expression/__tests__/executor.test.ts
import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { executeRollExpression } from "../executor";
import { dieFaces } from "../../roller";
import type { RollRulesDefinition } from "../../dsl-roll-evaluator";

// Mock random to make tests deterministic
const mockRandom = vi.spyOn(Math, "random");

describe("executeRollExpression", () => {
  beforeEach(() => {
    mockRandom.mockReset();
  });

  afterAll(() => {
    mockRandom.mockRestore();
  });

  it("executes simple dice roll: 1d6", () => {
    mockRandom.mockReturnValue(0.5); // Will produce 4 on d6

    const result = executeRollExpression("1d6", {});

    expect(result).toMatchObject({
      expression: "1d6",
      rolled: 4,
      rolls: [4],
    });
  });

  it("executes dice with formula modifier: 1d6+{{@str}}", () => {
    mockRandom.mockReturnValue(0.5); // Will produce 4 on d6

    const result = executeRollExpression("1d6+{{@str}}", { str: 10 });

    expect(result).toMatchObject({
      expression: "1d6+{{@str}}",
      rolled: 14, // 4 + 10
    });
  });

  it("executes comparison and returns passed: 1d100<={{@dex}}", () => {
    mockRandom.mockReturnValue(0.3); // Will produce 31 on d100 (Math.floor(0.3 * 100) + 1 = 31)

    const result = executeRollExpression("1d100<={{@dex}}", { dex: 50 });

    expect(result).toMatchObject({
      expression: "1d100<={{@dex}}",
      rolled: 31,
      targetValue: 50,
      comparator: "<=",
      passed: true,
    });
  });

  it("executes comparison and returns passed: false when rolled > targetValue", () => {
    mockRandom.mockReturnValue(0.7); // Will produce 71 on d100 (Math.floor(0.7 * 100) + 1 = 71)

    const result = executeRollExpression("1d100<={{@dex}}", { dex: 50 });

    expect(result).toMatchObject({
      expression: "1d100<={{@dex}}",
      rolled: 71,
      targetValue: 50,
      comparator: "<=",
      passed: false,
    });
  });

  it("executes >= comparator correctly", () => {
    mockRandom.mockReturnValue(0.5); // Will produce 51 on d100 (Math.floor(0.5 * 100) + 1 = 51)

    const result = executeRollExpression("1d100>={{@threshold}}", {
      threshold: 40,
    });

    expect(result).toMatchObject({
      expression: "1d100>={{@threshold}}",
      rolled: 51,
      targetValue: 40,
      comparator: ">=",
      passed: true,
    });
  });

  it("executes coc7 system and returns successLevel", () => {
    // CoC7 uses units+tens. units:5, tens:0 => roll 5
    mockRandom
      .mockReturnValueOnce(0.55)
      .mockReturnValueOnce(0.0);

    const result = executeRollExpression("coc7:1d100<={{@dex}}", { dex: 50 });

    expect(result).toMatchObject({
      expression: "coc7:1d100<={{@dex}}",
      rolled: 5,
      targetValue: 50,
      comparator: "<=",
      successLevel: "extreme",
    });
  });

  it("returns null for invalid expression", () => {
    const result = executeRollExpression("invalid", {});
    expect(result).toBeNull();
  });

  describe("table lookup", () => {
    it("executes with table lookup", () => {
      mockRandom.mockReturnValue(0.5); // Will produce 51 on d100

      const tables = {
        "test-table": {
          ranges: [
            { min: 1, max: 50, value: "low", label: "Low Result" },
            { min: 51, max: 100, value: "high", label: "High Result" },
          ],
        },
      };

      const result = executeRollExpression(
        "1d100",
        {},
        { tables, tableId: "test-table" },
      );

      expect(result?.tableResult).toEqual({
        tableId: "test-table",
        value: "high",
        label: "High Result",
      });
    });

    it("returns tableResult with numeric value", () => {
      mockRandom.mockReturnValue(0.2); // Will produce 21 on d100

      const tables = {
        damage: {
          title: "Damage Table",
          ranges: [
            { min: 1, max: 25, value: 1, label: "Minimal" },
            { min: 26, max: 75, value: 2, label: "Normal" },
            { min: 76, max: 100, value: 3, label: "Critical" },
          ],
        },
      };

      const result = executeRollExpression(
        "1d100",
        {},
        { tables, tableId: "damage" },
      );

      expect(result?.tableResult).toEqual({
        tableId: "damage",
        value: 1,
        label: "Minimal",
      });
    });

    it("does not include tableResult when tableId not specified", () => {
      mockRandom.mockReturnValue(0.5);

      const tables = {
        "test-table": {
          ranges: [{ min: 1, max: 100, value: "result" }],
        },
      };

      const result = executeRollExpression("1d100", {}, { tables });

      expect(result?.tableResult).toBeUndefined();
    });

    it("does not include tableResult when table not found", () => {
      mockRandom.mockReturnValue(0.5);

      const tables = {
        "existing-table": {
          ranges: [{ min: 1, max: 100, value: "result" }],
        },
      };

      const result = executeRollExpression(
        "1d100",
        {},
        { tables, tableId: "non-existent" },
      );

      expect(result?.tableResult).toBeUndefined();
    });

    it("does not include tableResult when roll is outside all ranges", () => {
      mockRandom.mockReturnValue(0.99); // Will produce 100 on d100

      const tables = {
        "partial-table": {
          ranges: [
            { min: 1, max: 50, value: "low" },
            // Gap: 51-100 not covered
          ],
        },
      };

      const result = executeRollExpression(
        "1d100",
        {},
        { tables, tableId: "partial-table" },
      );

      expect(result?.tableResult).toBeUndefined();
    });
  });

  describe("Fate system with DSL roll rules", () => {
    const fateRollRules: RollRulesDefinition = {
      default: "fate",
      rules: {
        fate: {
          type: "roll-over",
          dice: "4dF",
          modifier: "{{@skill}}",
          description: "Fate skill check - 4dF + skill vs target difficulty",
          successLevels: [
            {
              id: "success-with-style",
              label: "絕妙成功",
              condition: "{{@total - @target >= 3}}",
              style: "critical",
            },
            {
              id: "success",
              label: "成功",
              condition: "{{@total - @target >= 1 && @total - @target < 3}}",
              style: "success",
            },
            {
              id: "tie",
              label: "平手",
              condition: "{{@total == @target}}",
              style: "partial",
            },
            {
              id: "failure",
              label: "失敗",
              condition: "{{@total < @target}}",
              style: "failure",
            },
          ],
        },
      },
    };

    it("returns success-with-style when total - target >= 3", () => {
      // Fate dice: mock 4 dice rolls
      // For Fudge dice: 0-0.33 = -1, 0.33-0.67 = 0, 0.67-1 = +1
      // We want +1, +1, +1, +1 = +4 total
      mockRandom
        .mockReturnValueOnce(0.8) // +1
        .mockReturnValueOnce(0.8) // +1
        .mockReturnValueOnce(0.8) // +1
        .mockReturnValueOnce(0.8); // +1

      // Total rolled: 4, skill: 2, total: 6, target: 2
      // 6 - 2 = 4 >= 3, should be success-with-style
      const result = executeRollExpression(
        "fate:4dF+{{@skill}}>={{@target}}",
        { skill: 2, target: 2 },
        { dslRollRules: fateRollRules, target: 2 },
      );

      expect(result).not.toBeNull();
      expect(result?.rolled).toBe(6); // 4 (dice) + 2 (skill)
      expect(result?.successLevel).toMatchObject({
        id: "success-with-style",
        style: "critical",
      });
    });

    it("returns success when total - target >= 1 and < 3", () => {
      // We want +1, 0, 0, 0 = +1 total
      mockRandom
        .mockReturnValueOnce(0.8) // +1
        .mockReturnValueOnce(0.5) // 0
        .mockReturnValueOnce(0.5) // 0
        .mockReturnValueOnce(0.5); // 0

      // Total rolled: 1, skill: 2, total: 3, target: 2
      // 3 - 2 = 1 >= 1 && < 3, should be success
      const result = executeRollExpression(
        "fate:4dF+{{@skill}}>={{@target}}",
        { skill: 2, target: 2 },
        { dslRollRules: fateRollRules, target: 2 },
      );

      expect(result).not.toBeNull();
      expect(result?.rolled).toBe(3); // 1 (dice) + 2 (skill)
      expect(result?.successLevel).toMatchObject({
        id: "success",
        style: "success",
      });
    });

    it("returns tie when total == target", () => {
      // We want -1, -1, 0, 0 = -2 total
      mockRandom
        .mockReturnValueOnce(0.1) // -1
        .mockReturnValueOnce(0.1) // -1
        .mockReturnValueOnce(0.5) // 0
        .mockReturnValueOnce(0.5); // 0

      // Total rolled: -2, skill: 4, total: 2, target: 2
      // 2 == 2, should be tie
      const result = executeRollExpression(
        "fate:4dF+{{@skill}}>={{@target}}",
        { skill: 4, target: 2 },
        { dslRollRules: fateRollRules, target: 2 },
      );

      expect(result).not.toBeNull();
      expect(result?.rolled).toBe(2); // -2 (dice) + 4 (skill)
      expect(result?.successLevel).toMatchObject({
        id: "tie",
        style: "partial",
      });
    });

    it("returns failure when total < target", () => {
      // We want -1, -1, -1, 0 = -3 total
      mockRandom
        .mockReturnValueOnce(0.1) // -1
        .mockReturnValueOnce(0.1) // -1
        .mockReturnValueOnce(0.1) // -1
        .mockReturnValueOnce(0.5); // 0

      // Total rolled: -3, skill: 2, total: -1, target: 2
      // -1 < 2, should be failure
      const result = executeRollExpression(
        "fate:4dF+{{@skill}}>={{@target}}",
        { skill: 2, target: 2 },
        { dslRollRules: fateRollRules, target: 2 },
      );

      expect(result).not.toBeNull();
      expect(result?.rolled).toBe(-1); // -3 (dice) + 2 (skill)
      expect(result?.successLevel).toMatchObject({
        id: "failure",
        style: "failure",
      });
    });

    it("does not use DSL rules when dslRollRules not provided", () => {
      mockRandom
        .mockReturnValueOnce(0.8) // +1
        .mockReturnValueOnce(0.8) // +1
        .mockReturnValueOnce(0.8) // +1
        .mockReturnValueOnce(0.8); // +1

      // Without DSL rules, should fall back to generic comparison
      const result = executeRollExpression("fate:4dF+{{@skill}}>={{@target}}", {
        skill: 2,
        target: 2,
      });

      expect(result).not.toBeNull();
      expect(result?.rolled).toBe(6);
      // Should use passed instead of successLevel
      expect(result?.passed).toBe(true);
      expect(result?.successLevel).toBeUndefined();
    });

    it("uses targetValue from expression when options.target not provided", () => {
      // We want 0, 0, 0, +1 = +1 total
      mockRandom
        .mockReturnValueOnce(0.5) // 0
        .mockReturnValueOnce(0.5) // 0
        .mockReturnValueOnce(0.5) // 0
        .mockReturnValueOnce(0.8); // +1

      // Total rolled: 1, skill: 3, total: 4, target from expression: 2
      // 4 - 2 = 2 >= 1 && < 3, should be success
      const result = executeRollExpression(
        "fate:4dF+{{@skill}}>={{@target}}",
        { skill: 3, target: 2 },
        { dslRollRules: fateRollRules }, // No target in options
      );

      expect(result).not.toBeNull();
      expect(result?.rolled).toBe(4);
      expect(result?.successLevel).toMatchObject({
        id: "success",
        style: "success",
      });
    });
  });
});

describe("executeRollExpression random source", () => {
  it("passes options.random to every die, CoC percentile checks included", () => {
    const values = [0.2, 0.35, 0, 0.99];
    const random = () => values.shift() ?? 0;
    const check = executeRollExpression("coc7:1d100<=50", {}, { random });
    expect(check?.rolled).toBe(32);
    const plain = executeRollExpression("2d6", {}, { random });
    expect(plain?.rolled).toBe(7);
  });
});

describe("executeRollExpression face source", () => {
  /** A source that hands out scripted faces and records each die's size, in draw order. */
  function scripted(faces: number[]) {
    const sizes: Array<number | "F"> = [];
    return {
      sizes,
      source: {
        draw: (sides: number | "F") => {
          sizes.push(sides);
          const face = faces.shift();
          if (face === undefined) throw new Error("no face left");
          return face;
        },
      },
    };
  }

  it("draws every die from options.faces with its size, in draw order, ahead of options.random", () => {
    const random = () => {
      throw new Error("random must not be read");
    };
    const plain = scripted([6, 2, 5, 4]);
    expect(executeRollExpression("4d6kh3", {}, { faces: plain.source, random })).toMatchObject({ rolled: 15, rolls: [6, 2, 5, 4] });
    expect(plain.sizes).toEqual([6, 6, 6, 6]);

    // CoC: the units die first, then the tens dice, each a d10.
    const check = scripted([3, 8, 2]);
    expect(executeRollExpression("coc7:1d100b1<=50", {}, { faces: check.source })).toMatchObject({
      rolled: 12,
      unitsDice: [2],
      tensDice: [70, 10],
    });
    expect(check.sizes).toEqual([10, 10, 10]);

    const exploding = scripted([6, 6, 1]);
    expect(executeRollExpression("1d6!", {}, { faces: exploding.source })).toMatchObject({ rolled: 13 });
    expect(exploding.sizes).toEqual([6, 6, 6]);

    const fudge = scripted([-1, 0, 1, 1]);
    expect(executeRollExpression("4dF", {}, { faces: fudge.source })?.rolled).toBe(1);
    expect(fudge.sizes).toEqual(["F", "F", "F", "F"]);
  });

  it("dieFaces(random) draws the faces options.random would", () => {
    for (const expression of ["coc7:1d100p1<=50", "4d6kh3+1d8"]) {
      const values = [0.2, 0.35, 0, 0.99, 0.5];
      const fromRandom = executeRollExpression(expression, {}, { random: () => values.shift() ?? 0 });
      const again = [0.2, 0.35, 0, 0.99, 0.5];
      expect(executeRollExpression(expression, {}, { faces: dieFaces(() => again.shift() ?? 0) })).toEqual(fromRandom);
    }
    const fudge = dieFaces(() => 0.99);
    expect(fudge.draw("F")).toBe(1);
    expect(fudge.draw(20)).toBe(20);
  });
});

describe("a formula as a die's size (B-021)", () => {
  it("puts a positive integer after `d` without a sign: {{@n}}d{{@size}}", () => {
    const random = () => 0;
    expect(executeRollExpression("1d20+{{@mod}}+{{@n}}d{{@size}}", { mod: 3, n: -1, size: 6 }, { random })).toMatchObject({
      resolvedDiceExpr: "1d20+3-1d6",
    });
    expect(executeRollExpression("1d{{@size}}", { size: 8 }, { random })).toMatchObject({ resolvedDiceExpr: "1d8" });
  });

  it("refuses a size that is not a positive integer", () => {
    expect(executeRollExpression("1d{{@size}}", { size: 0 })).toBeNull();
    expect(executeRollExpression("1d{{@size}}", { size: -4 })).toBeNull();
    expect(executeRollExpression("1d{{@size}}", { size: 2.5 })).toBeNull();
  });
});
