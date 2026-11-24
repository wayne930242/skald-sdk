import { describe, it, expect, vi, afterEach, afterAll } from "vitest";
import fateRules from "../../../../systems/fate/data/fate-condensed/dsl-roll-rules.json";
import type { RollRulesDefinition } from "../dsl-roll-evaluator";
import {
  DECLARED_DIFFICULTIES,
  difficultyTarget,
  isDeclaredDifficulty,
  judgePercentileCheck,
  rollRulesSupportDifficulty,
} from "../difficulty";
import { executeRollExpression } from "../roll-expression/executor";
import { describeDeclaredDifficulty, describeExecutorDifficulty, SKILLS } from "./difficulty-cases";

// The same cases under the CoC rule data (KC and classic rules) are in difficulty-coc7e.test.ts,
// which stays out of the open-source export.

describe("declared difficulty", () => {
  it("names regular, hard and extreme, and nothing else", () => {
    expect(DECLARED_DIFFICULTIES).toEqual(["regular", "hard", "extreme"]);
    expect(isDeclaredDifficulty("hard")).toBe(true);
    expect(isDeclaredDifficulty("critical")).toBe(false);
    expect(isDeclaredDifficulty(2)).toBe(false);
  });

  it("targets floor(value / 1), floor(value / 2) and floor(value / 5)", () => {
    const table = SKILLS.map((value) => [
      value,
      difficultyTarget(value, "regular"),
      difficultyTarget(value, "hard"),
      difficultyTarget(value, "extreme"),
    ]);
    expect(table).toEqual([
      [30, 30, 15, 6],
      [49, 49, 24, 9],
      [50, 50, 25, 10],
      [60, 60, 30, 12],
      [99, 99, 49, 19],
    ]);
  });

  it("is not supported by Fate or without rules", () => {
    expect(rollRulesSupportDifficulty(fateRules as RollRulesDefinition)).toBe(false);
    expect(rollRulesSupportDifficulty(undefined)).toBe(false);
  });

  describeDeclaredDifficulty("built-in check (no rules)", undefined);

  it("ignores the difficulty under a rule that cannot judge it", () => {
    const passFail: RollRulesDefinition = {
      default: "brp",
      rules: {
        brp: {
          type: "roll-under",
          dice: "1d100",
          successLevels: [
            { id: "success", label: "S", condition: "{{@rolled <= @target}}" },
            { id: "failure", label: "F", condition: "{{@rolled > @target}}" },
          ],
        },
      },
    };
    expect(rollRulesSupportDifficulty(passFail)).toBe(false);
    expect(judgePercentileCheck({ rolled: 40, value: 60, difficulty: "hard", rollRules: passFail })).toEqual({
      level: "success",
    });
  });
});

describe("executor with a declared difficulty", () => {
  const mockRandom = vi.spyOn(Math, "random");
  afterEach(() => mockRandom.mockReset());
  afterAll(() => mockRandom.mockRestore());

  describeExecutorDifficulty("built-in check (no rules)", undefined);

  it("ignores a difficulty on a roll that is not a coc7 check", () => {
    mockRandom.mockReturnValueOnce(0.5);
    const result = executeRollExpression("1d6", {}, { difficulty: "hard" });
    expect(result).not.toHaveProperty("difficulty");
  });
});
