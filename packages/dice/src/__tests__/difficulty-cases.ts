import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import type { RollRulesDefinition } from "../dsl-roll-evaluator";
import { DECLARED_DIFFICULTIES, difficultyTarget, judgePercentileCheck, type DeclaredDifficulty } from "../difficulty";
import { executeExpressionWithMacros } from "../macro/execute-with-macros";
import type { RollMacroRegistry } from "../macro/types";
import { executeRollExpression } from "../roll-expression/executor";

// The declared-difficulty cases every percentile rule set must pass, in the judge and through the
// executor, shared by `difficulty.test.ts` (the built-in check) and `difficulty-coc7e.test.ts` (the
// CoC rule data, which stays out of the open-source export).

export const SKILLS = [30, 49, 50, 60, 99];
const ROLLS = [95, 96, 97, 98, 99, 100];

/** The rulebook outcome at a declared difficulty: success/failure/fumble against floor(value/d) */
function expectedOutcome(rolled: number, value: number, difficulty: DeclaredDifficulty) {
  const target = difficultyTarget(value, difficulty);
  if (rolled === 100 || (target < 50 && rolled >= 96)) return "fumble";
  return rolled <= target ? "success" : "failure";
}

function outcomeOf(level: string) {
  if (level === "fumble") return "fumble";
  if (level === "failure") return "failure";
  return "success";
}

/** Judging at a declared difficulty under `rules` (`undefined`: the built-in check). */
export function describeDeclaredDifficulty(name: string, rules: RollRulesDefinition | undefined) {
  describe(name, () => {
    it("judges success, failure and fumble against the declared target for skills 30/49/50/60/99, rolls 95–100", () => {
      const diffs: string[] = [];
      for (const difficulty of DECLARED_DIFFICULTIES) {
        for (const value of SKILLS) {
          for (const rolled of ROLLS) {
            const judged = judgePercentileCheck({ rolled, value, difficulty, rollRules: rules });
            const expected = expectedOutcome(rolled, value, difficulty);
            if (!judged || outcomeOf(judged.level) !== expected) {
              diffs.push(`${difficulty} value=${value} rolled=${rolled}: ${judged?.level} (want ${expected})`);
            }
          }
        }
      }
      expect(diffs).toEqual([]);
    });

    it("keeps every level for a regular roll exactly as before", () => {
      expect(judgePercentileCheck({ rolled: 97, value: 60, difficulty: "regular", rollRules: rules })).toEqual({
        level: "failure",
      });
      expect(judgePercentileCheck({ rolled: 96, value: 99, rollRules: rules })).toEqual({ level: "regular" });
    });

    it("fumbles a hard roll of 97 on skill 60 (target 30 is below 50)", () => {
      expect(judgePercentileCheck({ rolled: 97, value: 60, difficulty: "hard", rollRules: rules })).toEqual({
        level: "fumble",
        difficulty: "hard",
      });
    });

    it("names the level reached against the full value once the declared target is met", () => {
      // skill 60: hard ≤30, extreme ≤12
      expect(judgePercentileCheck({ rolled: 25, value: 60, difficulty: "hard", rollRules: rules })?.level).toBe("hard");
      expect(judgePercentileCheck({ rolled: 10, value: 60, difficulty: "hard", rollRules: rules })?.level).toBe("extreme");
      expect(judgePercentileCheck({ rolled: 31, value: 60, difficulty: "hard", rollRules: rules })?.level).toBe("failure");
      expect(judgePercentileCheck({ rolled: 12, value: 60, difficulty: "extreme", rollRules: rules })?.level).toBe("extreme");
      expect(judgePercentileCheck({ rolled: 13, value: 60, difficulty: "extreme", rollRules: rules })?.level).toBe("failure");
      expect(judgePercentileCheck({ rolled: 1, value: 60, difficulty: "extreme", rollRules: rules })?.level).toBe("critical");
    });
  });
}

/** A `coc7:` check and the `coc` macro carry a declared difficulty under `rules` (`undefined`: the built-in check). */
export function describeExecutorDifficulty(name: string, rules: RollRulesDefinition | undefined) {
  describe(name, () => {
    const spyOnRandom = () => vi.spyOn(Math, "random");
    let mockRandom: ReturnType<typeof spyOnRandom>;
    beforeEach(() => {
      mockRandom = spyOnRandom();
    });
    afterEach(() => mockRandom.mockRestore());

    /** units die first, then the tens die: 97 = units 7 (0.75), tens 90 (0.95) */
    function nextRoll97() {
      mockRandom.mockReturnValueOnce(0.75).mockReturnValueOnce(0.95);
    }

    it("fumbles a hard coc7 check of 97 on 60 and records the difficulty, keeping the full value as target", () => {
      nextRoll97();
      const result = executeRollExpression("coc7:1d100<={{@target}}", { target: 60 }, {
        dslRollRules: rules,
        difficulty: "hard",
      });
      expect(result).toMatchObject({ rolled: 97, targetValue: 60, successLevel: "fumble", difficulty: "hard" });
    });

    it("leaves a regular check unchanged and unmarked", () => {
      nextRoll97();
      const result = executeRollExpression("coc7:1d100<={{@target}}", { target: 60 }, {
        dslRollRules: rules,
        difficulty: "regular",
      });
      expect(result?.successLevel).toBe("failure");
      expect(result).not.toHaveProperty("difficulty");
    });

    it("keeps bonus dice working at a declared difficulty", () => {
      // units 5 (0.55); tens 90 (0.95) and 20 (0.25): a bonus die keeps 20 → 25
      mockRandom.mockReturnValueOnce(0.55).mockReturnValueOnce(0.95).mockReturnValueOnce(0.25);
      const result = executeRollExpression("coc7:1d100+1<={{@target}}", { target: 60 }, {
        dslRollRules: rules,
        difficulty: "hard",
      });
      expect(result).toMatchObject({ rolled: 25, bonusDice: 1, successLevel: "hard", difficulty: "hard" });
    });

    it("threads the difficulty through a coc macro", () => {
      const registry: RollMacroRegistry = {
        defaultSystem: "coc7",
        macros: {
          coc: {
            params: [{ name: "attr" }, { name: "bonusPenalty", default: "0" }],
            body: 'return roll("coc7:1d100{{@bonusPenalty}}<={{@attr}}");',
            bonusDice: { enabled: true, min: -2, max: 2, param: "bonusPenalty" },
          },
        },
      };
      nextRoll97();
      const outcome = executeExpressionWithMacros("{{#coc[@str]}}", registry, { str: 60 }, {
        dslRollRules: rules,
        difficulty: "hard",
      });
      expect(outcome?.result).toMatchObject({ rolled: 97, targetValue: 60, successLevel: "fumble", difficulty: "hard" });
    });
  });
}
