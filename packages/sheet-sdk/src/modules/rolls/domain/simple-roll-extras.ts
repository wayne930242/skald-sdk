// modules/rolls/domain/simple-roll-extras.ts
//
// What a plain (target-less) roll writes into its chat row besides the dice, so the
// card can name it and grade it: the title, the level a system's roll rules give its
// total (PbtA's strong / weak / miss), and the comparison it was held against. The
// Discord bot writes the same keys (apps/bot/src/commands/roll.ts).
import { resolveRollRuleId } from "@skald/dice";
import type { RollExpressionResult, RollRule, RollRulesDefinition, SuccessLevel } from "@skald/dice";
import { evaluateWithDSLRules } from "./roll-result-format";

export interface SimpleRollExtras {
  label?: string;
  successLevel?: SuccessLevel;
  comparator?: string;
  targetValue?: number;
}

const DICE_PART = /^\s*(\d*d(?:\d+|F))/i;
const SINGLE_DICE_GROUP = /^(\d+d(?:\d+|f)(?:k[hl]\d+)?)(?:[+-]\d+)*$/;

function isTargetlessRollOver(rule: RollRule | undefined): rule is Extract<RollRule, { type: "roll-over" }> {
  return rule?.type === "roll-over" && !rule.successLevels.some((level) => level.condition.includes("@target"));
}

/** An opt-in total-only ladder must not override an explicit comparison. */
export function usesOptedInTotalGrades(rules: RollRulesDefinition | undefined, expression: string): boolean {
  const ruleId = resolveRollRuleId(expression, rules);
  const rule = ruleId ? rules?.rules[ruleId] : undefined;
  return isTargetlessRollOver(rule) && rule.totalRollDice !== undefined;
}

/**
 * Whether the system's rules grade this roll from its total alone: the rule it falls
 * under rolls over (`2d6 + stat`), none of its levels needs a target, and the roll's
 * dice are the rule's dice. A Fate roll without a difficulty is not graded (its levels
 * compare with the target), and neither is a `1d20` in a system whose rule is `2d6`.
 */
export function gradesFromTotal(
  rules: RollRulesDefinition | undefined,
  expression: string,
  notation: string,
): { ruleId: string; allSurfaces?: true } | null {
  if (!rules) return null;
  const ruleId = resolveRollRuleId(expression, rules);
  const rule = ruleId ? rules.rules[ruleId] : undefined;
  if (!ruleId || !isTargetlessRollOver(rule)) return null;
  if (rule.totalRollDice) {
    const dice = SINGLE_DICE_GROUP.exec(
      expression.replace(/\s/g, "").toLowerCase().replace(/^[a-z0-9]+:/, ""),
    )?.[1];
    return dice && rule.totalRollDice.some((allowed) => allowed.toLowerCase() === dice)
      ? { ruleId, allSurfaces: true }
      : null;
  }
  const ruleDice = DICE_PART.exec(rule.dice)?.[1]?.toLowerCase();
  const rollDice = DICE_PART.exec(notation)?.[1]?.toLowerCase();
  return ruleDice && ruleDice === rollDice ? { ruleId } : null;
}

/** Grade the final total of plain chat notation only when the system opts in. */
export function gradeInlineTotal(
  total: number, notation: string, rules: RollRulesDefinition | undefined,
): string | undefined {
  if (gradesFromTotal(rules, notation, notation)?.allSurfaces) {
    return evaluateWithDSLRules(total, 0, notation, rules)?.id;
  }
  return undefined;
}

/** Refresh a generic comparison after its virtual total has been replaced by 3D dice. */
export function refreshRollComparison(result: RollExpressionResult): void {
  const { rolled, targetValue, comparator } = result;
  if (targetValue === undefined || result.passed === undefined) return;
  switch (comparator) {
    case "<=": result.passed = rolled <= targetValue; break;
    case ">=": result.passed = rolled >= targetValue; break;
    case "<": result.passed = rolled < targetValue; break;
    case ">": result.passed = rolled > targetValue; break;
    case "=": result.passed = rolled === targetValue; break;
  }
}

/**
 * The comparison of a plain roll against a number (`1d20>=15`): the operator, the number
 * and pass or fail as `success` / `failure`. Nothing for a roll that was not compared.
 */
export function comparisonExtras(result: RollExpressionResult): SimpleRollExtras {
  if (result.passed === undefined || !result.comparator || result.targetValue === undefined) return {};
  return {
    comparator: result.comparator,
    targetValue: result.targetValue,
    successLevel: result.passed ? "success" : "failure",
  };
}
