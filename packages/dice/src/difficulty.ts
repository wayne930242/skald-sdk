/**
 * Declared difficulty for percentile checks (CoC 7e "Regular / Hard / Extreme").
 *
 * The player declares, before rolling, the success level the roll must reach. The roll is
 * judged against `floor(value / 1)`, `floor(value / 2)` or `floor(value / 5)`: at or under
 * that number succeeds, over it fails, and the fumble rule reads that number too (100 always
 * fumbles; 96–100 fumbles when it is below 50). A success still names the level it reached
 * against the full value, so an Extreme success on a Hard roll stays Extreme.
 *
 * Judged with the system's own roll rule (`dsl-roll-rules.json`), evaluated twice: at the full
 * value and at the declared target. A rule supports it when it is a roll-under rule naming a
 * success level for each difficulty, so a system opts in by its rule data, not by its slug.
 */

import { getSuccessLevel } from "./check";
import {
  createRollEvaluator,
  type RollRule,
  type RollRulesDefinition,
  type SuccessLevel as DslSuccessLevel,
} from "./dsl-roll-evaluator";

export type DeclaredDifficulty = "regular" | "hard" | "extreme";

/** Easiest first; `regular` is the default and the only one that leaves a roll as it was */
export const DECLARED_DIFFICULTIES: readonly DeclaredDifficulty[] = ["regular", "hard", "extreme"];

const DIVISORS: Record<DeclaredDifficulty, number> = { regular: 1, hard: 2, extreme: 5 };

export function isDeclaredDifficulty(value: unknown): value is DeclaredDifficulty {
  return typeof value === "string" && (DECLARED_DIFFICULTIES as readonly string[]).includes(value);
}

/** The number the roll must be at or under: `floor(value / 1 | 2 | 5)` */
export function difficultyTarget(value: number, difficulty: DeclaredDifficulty): number {
  return Math.floor(value / DIVISORS[difficulty]);
}

/** A roll-under rule that names a success level for every difficulty can judge one */
export function ruleSupportsDifficulty(rule: RollRule | undefined): boolean {
  if (!rule || rule.type !== "roll-under") return false;
  return DECLARED_DIFFICULTIES.every((id) => rule.successLevels.some((level) => level.id === id));
}

/** Whether a system's roll rules let a player declare a difficulty (its default rule supports it) */
export function rollRulesSupportDifficulty(rollRules: RollRulesDefinition | undefined): boolean {
  if (!rollRules) return false;
  const ruleId = rollRules.default ?? Object.keys(rollRules.rules)[0];
  return ruleSupportsDifficulty(ruleId ? rollRules.rules[ruleId] : undefined);
}

type Outcome = "fumble" | "critical" | "failure" | "success";

/** What a level means for the declared target: its rule style, else the CoC level ids */
function outcomeOf(level: { id: string; style?: string }): Outcome {
  const kind = level.style ?? level.id;
  if (kind === "fumble") return "fumble";
  if (kind === "critical") return "critical";
  if (kind === "failure") return "failure";
  return "success";
}

export interface JudgePercentileCheckInput {
  rolled: number;
  /** The full skill or characteristic value */
  value: number;
  difficulty?: DeclaredDifficulty;
  /** The system's roll rules; without them the built-in CoC check judges the roll */
  rollRules?: RollRulesDefinition;
  /** The rule to judge with; defaults to the rules' default */
  ruleId?: string;
}

export interface PercentileJudgement {
  level: string;
  /** Present only when a non-regular difficulty was declared and the rule judged it */
  difficulty?: Exclude<DeclaredDifficulty, "regular">;
}

/**
 * The level a percentile check reached at a declared difficulty. Null when the rules have no
 * such rule or no level matched (a data bug the caller reports).
 */
export function judgePercentileCheck({
  rolled,
  value,
  difficulty = "regular",
  rollRules,
  ruleId,
}: JudgePercentileCheckInput): PercentileJudgement | null {
  let atValue: { id: string; style?: string } | null;
  let judgeAt: (target: number) => { id: string; style?: string } | null;
  let supports: boolean;

  if (rollRules) {
    const id = ruleId ?? rollRules.default ?? "coc7";
    const evaluator = createRollEvaluator(rollRules);
    judgeAt = (target) => evaluator.evaluateSuccessLevel(id, rolled, target) as DslSuccessLevel | null;
    atValue = judgeAt(value);
    supports = ruleSupportsDifficulty(rollRules.rules[id]);
  } else {
    judgeAt = (target) => ({ id: getSuccessLevel(rolled, target) });
    atValue = judgeAt(value);
    supports = true;
  }

  if (!atValue) return null;
  if (difficulty === "regular" || !supports) return { level: atValue.id };

  const atTarget = judgeAt(difficultyTarget(value, difficulty));
  if (!atTarget) return null;
  const targetOutcome = outcomeOf(atTarget);
  let level: string;
  if (targetOutcome === "fumble") level = atTarget.id;
  // 01 is a critical whatever was declared
  else if (outcomeOf(atValue) === "critical") level = atValue.id;
  else if (targetOutcome === "failure") level = atTarget.id;
  else level = atValue.id;
  return { level, difficulty };
}
