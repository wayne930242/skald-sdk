/**
 * DSL Roll Evaluator
 *
 * Evaluates roll results against user-defined success level rules.
 * Supports three rule types:
 * - roll-under: d100 style (CoC, BRP) with success levels
 * - roll-over: 2d6+mod style (PbtA) with success levels
 * - comparison: simple DC comparison (D&D style)
 */

import { parseFormula, evaluateFormula } from "./formula/parser";
import type { PostRollAction } from "./post-roll-actions";

/** System-agnostic visual category for a success level, used to pick a default display style when a system's id has no bespoke lookup entry. */
export type SuccessLevelStyle = "critical" | "success" | "partial" | "failure" | "fumble";

export interface SuccessLevel {
  id: string;
  label: string;
  condition: string;
  style?: SuccessLevelStyle;
}

export interface RollUnderRule {
  type: "roll-under";
  dice: string;
  description?: string;
  successLevels: SuccessLevel[];
  /** What a roll can do once it is on the table (push, spend Luck, tick improvement) */
  postRollActions?: PostRollAction[];
}

export interface RollOverRule {
  type: "roll-over";
  dice: string;
  /** Opt into grading targetless results on all surfaces with exactly these dice groups (plus numeric modifiers). */
  totalRollDice?: string[];
  modifier?: string;
  description?: string;
  successLevels: SuccessLevel[];
  postRollActions?: PostRollAction[];
}

export interface ComparisonRule {
  type: "comparison";
  dice: string;
  modifier?: string;
  description?: string;
  comparison: "<" | ">" | "<=" | ">=" | "=";
  target: string;
  postRollActions?: PostRollAction[];
}

export type RollRule = RollUnderRule | RollOverRule | ComparisonRule;

export interface RollRulesDefinition {
  default?: string;
  rules: Record<string, RollRule>;
}

export interface RollEvaluator {
  /**
   * Evaluate the success level for a roll result
   * @param ruleId - The ID of the rule to use
   * @param rolled - The raw dice roll result
   * @param target - The target value (for roll-under systems)
   * @param context - Additional context values (for modifiers)
   */
  evaluateSuccessLevel(
    ruleId: string,
    rolled: number,
    target: number,
    context?: Record<string, number>
  ): SuccessLevel | null;

  /**
   * Get a rule definition by ID
   */
  getRule(ruleId: string): RollRule | undefined;

  /**
   * Get the default rule name
   */
  getDefaultRule(): string | undefined;
}

/**
 * Evaluates a `{{ }}` threshold formula over the given variables (e.g. `{{@target /floor 2}}`
 * with `{ target: 55 }`). Returns null when the formula does not parse or is not a finite number.
 * Lives here, with the other DSL formula use, so rule data never needs its own formula runtime.
 */
export function evaluateRollThreshold(
  formula: string,
  variables: Record<string, number>,
): number | null {
  const ast = parseFormula(formula);
  if (!ast) return null;
  const value = evaluateFormula(ast, variables);
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Creates a roll evaluator from a rules definition
 */
export function createRollEvaluator(
  definition: RollRulesDefinition
): RollEvaluator {
  return {
    evaluateSuccessLevel(
      ruleId: string,
      rolled: number,
      target: number,
      context: Record<string, number> = {}
    ): SuccessLevel | null {
      const rule = definition.rules[ruleId];
      if (!rule) return null;

      // Build evaluation context
      const evalContext: Record<string, number> = {
        ...context,
        rolled,
        target,
      };

      // For roll-over, calculate total with modifier
      if (rule.type === "roll-over" && rule.modifier) {
        const modAst = parseFormula(rule.modifier);
        if (modAst) {
          const mod = evaluateFormula(modAst, context);
          if (typeof mod === "number") {
            evalContext.total = rolled + mod;
          } else {
            evalContext.total = rolled;
          }
        } else {
          evalContext.total = rolled;
        }
      } else {
        evalContext.total = rolled;
      }

      // Evaluate success levels in order (first match wins)
      if ("successLevels" in rule) {
        for (const level of rule.successLevels) {
          const conditionAst = parseFormula(level.condition);
          if (conditionAst) {
            const result = evaluateFormula(conditionAst, evalContext);
            if (result === true) {
              return level;
            }
          }
        }
      }

      return null;
    },

    getRule(ruleId: string): RollRule | undefined {
      return definition.rules[ruleId];
    },

    getDefaultRule(): string | undefined {
      return definition.default;
    },
  };
}
