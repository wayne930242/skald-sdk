import type { RollExpressionResult } from "@skald/dice/roll-expression";
import type { DeclaredDifficulty, DiceVisibility, SuccessLevel } from "@skald/dice";
import {
  createRollEvaluator,
  judgePercentileCheck,
  keptRollFlags,
  ruleSupportsDifficulty,
} from "@skald/dice";
import type { RollRulesDefinition } from "@skald/dice";
import type { SkillCheckRoll, SimpleDiceRoll } from "@skald/dice";
import { nanoid } from "nanoid";

/**
 * The notation stored with a plain (no target) roll: its dice plus the modifier
 * that makes up the rest of the total. Fate's `dF` has no sides, so it is kept
 * as `<count>dF` (the Discord bot tells a Fate roll from d6s by that). A keep/drop
 * modifier (`2d20kl1`) stays on the dice, and only the faces it kept count toward
 * the modifier, so a card can tell the dropped faces from the notation.
 */
export function simpleRollNotation(
  diceExpression: string,
  rolls: number[],
  total: number
): string {
  const fate = /(\d+)?d[fF]/.exec(diceExpression);
  const diceMatch = fate
    ? null
    : diceExpression.match(/(\d+)?d(\d+)((?:k[hl]?|d[hl]?)\d+)?/i);
  const dicePart = fate
    ? `${fate[1] || rolls.length || 4}dF`
    : `${diceMatch?.[1] || "1"}d${diceMatch?.[2] || "6"}${diceMatch?.[3]?.toLowerCase() ?? ""}`;

  // Read the kept faces from what is stored, so the card agrees with this modifier
  // (a multi-group keep then counts every face, as it will on read back).
  const kept = keptRollFlags(rolls, dicePart);
  const modifier = total - rolls.reduce((sum, face, index) => (kept[index] ? sum + face : sum), 0);
  if (modifier > 0) return `${dicePart}+${modifier}`;
  if (modifier < 0) return `${dicePart}${modifier}`;
  return dicePart;
}

/** The tens die of a d100 roll: 0..90, and a roll of 100 is 00 + 0 (as the engine reads it) */
export function tensOfRoll(rolled: number): number {
  return rolled >= 100 ? 0 : Math.floor(rolled / 10) * 10;
}

/**
 * Extract dice notation from roll expression
 * e.g., "coc7:1d100<={{@dex}}" -> "1d100"
 */
export function extractDiceNotation(expression: string): string {
  // Remove system prefix (e.g., "coc7:")
  let notation = expression.replace(/^[a-z0-9]+:/i, "");

  // Remove comparison part (e.g., "<={{@dex}}"). Comparators are <=, >=, <, >, =
  // only - "!" is excluded so exploding-dice notation (1d6!, 1d6!p, 1d6!>5) survives.
  notation = notation.replace(/[<>=]+.*$/, "");
  // Normalize CoC7 extended dice string, e.g. "1d100b1" / "1d100p2" -> "1d100"
  notation = notation.replace(/(1d100)(?:[bp]\d+)$/i, "$1");

  return notation.trim();
}

/**
 * Extract success level ID from either a string or DSL SuccessLevel object
 */
export function extractSuccessLevelId(
  successLevel: string | { id: string; label: string; condition: string; style?: string } | undefined
): string | undefined {
  if (!successLevel) return undefined;
  if (typeof successLevel === "string") return successLevel;
  return successLevel.id;
}

/**
 * Evaluate success level using DSL roll rules
 * Returns the DSL success level if rules exist, null otherwise
 *
 * Deliberately does NOT forward the roll's real context (e.g. `{skill: 3}`)
 * to the evaluator: `rolled` already has any roll-over rule's `modifier`
 * (e.g. Fate's "{{@skill}}") baked in via the dice notation/expression
 * substitution that happened before this point. Passing the real context
 * would make the evaluator add the modifier a second time — see
 * packages/dice/src/roll-expression/executor.ts's own fate branch, which
 * neutralizes the same way for the same reason.
 *
 * The neutralized context still has to name the modifier's variable(s)
 * explicitly (zeroed out) rather than pass `{}` — the formula engine throws
 * `FormulaEvaluationError` on an unresolved reference instead of treating it
 * as 0/undefined, so an empty context crashes instead of degrading.
 */
export function evaluateWithDSLRules(
  rolled: number,
  target: number,
  expression: string,
  rollRules: RollRulesDefinition | undefined,
  difficulty?: DeclaredDifficulty,
): { id: string; label: string; style?: string } | null {
  if (!rollRules) return null;

  // Extract system from expression (e.g., "coc7:1d100<={{@target}}" -> "coc7")
  const systemMatch = expression.match(/^([a-z0-9]+):/i);
  const ruleId = systemMatch?.[1] ?? rollRules.default;

  const rule = ruleId ? rollRules.rules[ruleId] : undefined;
  if (!ruleId || !rule) return null;

  const neutralizedContext: Record<string, number> = {};
  if (rule.type === "roll-over" && rule.modifier) {
    for (const match of rule.modifier.matchAll(/@([a-zA-Z_][a-zA-Z0-9_]*)/g)) {
      neutralizedContext[match[1]] = 0;
    }
  }

  const evaluator = createRollEvaluator(rollRules);
  // A declared Hard or Extreme check: judged against the declared target, named against the full value
  if (difficulty && difficulty !== "regular" && rule.type === "roll-under" && ruleSupportsDifficulty(rule)) {
    const judged = judgePercentileCheck({ rolled, value: target, difficulty, rollRules, ruleId });
    if (!judged) return null;
    return rule.successLevels.find((level) => level.id === judged.level) ?? null;
  }
  return evaluator.evaluateSuccessLevel(ruleId, rolled, target, neutralizedContext);
}

export interface SkillCheckWithFaces extends SkillCheckRoll {
  faces?: { kind: "fate"; values: number[] };
}

export function skillCheckFaces(result: RollExpressionResult): Pick<SkillCheckWithFaces, "faces"> {
  const expression = result.resolvedDiceExpr ?? result.expression;
  if (result.tensDice || result.unitsDice || /^coc7:/i.test(expression) || !result.rolls.length) {
    return {};
  }
  // Fate dice only: other flat checks (d20 with advantage, keep/drop pools) would need keep marks.
  const notation = extractDiceNotation(expression);
  if (!/^\d*dF(?:\s*[+-]\s*\d+)*$/i.test(notation)) return {};
  return { faces: { kind: "fate", values: result.rolls } };
}

export function toToastDiceRoll(
  result: RollExpressionResult,
  fieldLabel: string | undefined,
  currentUserId: string | null,
  currentUserName: string | null,
  characterId: string | undefined,
  characterName: string | undefined,
  defaultSkillName: string,
  visibility: DiceVisibility,
  totalOnlyGrade?: string,
): SkillCheckWithFaces | SimpleDiceRoll {
  const basePayload = {
    id: nanoid(),
    timestamp: new Date(),
    rollerId: currentUserId ?? "local",
    rollerName: currentUserName ?? "Local",
    characterId,
    characterName,
    visibility,
  };

  if (result.successLevel && result.targetValue !== undefined) {
    const successLevelId =
      typeof result.successLevel === "string"
        ? result.successLevel
        : result.successLevel.id;

    return {
      ...basePayload,
      type: "skill_check",
      skillName: fieldLabel ?? defaultSkillName,
      targetValue: result.targetValue,
      roll: result.rolled,
      successLevel: successLevelId as SuccessLevel,
      ...(result.difficulty && { difficulty: result.difficulty }),
      bonusDice: result.bonusDice,
      unitsDice: result.unitsDice,
      tensDice: result.tensDice,
      selectedUnits: result.selectedUnits ?? result.rolled % 10,
      selectedTens: result.selectedTens ?? tensOfRoll(result.rolled),
      ...skillCheckFaces(result),
    };
  }

  return {
    ...basePayload,
    type: "simple",
    notation: extractDiceNotation(result.resolvedDiceExpr ?? result.expression ?? "1d6"),
    rolls: result.rolls,
    total: result.rolled,
    ...(totalOnlyGrade && { successLevel: totalOnlyGrade }),
  };
}
