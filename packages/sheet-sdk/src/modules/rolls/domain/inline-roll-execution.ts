import { executeExpressionWithMacros, rollDiceExpression, type RollMacroRegistry, type RollRulesDefinition } from "@skald/dice";
import type { RollExpressionResult } from "@skald/dice/roll-expression";

export function rollBasicNotation(notation: string): { rolls: number[]; total: number } | null {
  const result = rollDiceExpression(notation);
  if (!result) return null;
  return { rolls: result.dice.flatMap((group) => group.rolls), total: result.total };
}

export function evaluateInlineRollExpression(
  expression: string,
  context: Record<string, number>,
  rollMacros: RollMacroRegistry | undefined,
  rollRules: RollRulesDefinition | undefined,
): RollExpressionResult | null {
  const evalResult = executeExpressionWithMacros(
    expression,
    rollMacros,
    context,
    {
      dslRollRules: rollRules,
    },
  );
  return evalResult?.result ?? null;
}
