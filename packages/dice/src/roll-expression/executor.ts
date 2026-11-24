// @skald/dice roll-expression/executor.ts
import type {
  RollExpressionResult,
  Comparator,
  TableDefinition,
} from "./types";
import { parseRollExpression } from "./parser";
import { parseFormula, evaluateFormula } from "../formula/parser";
import { rollCoC7eSkillCheck, rollDiceExpression, type RandomSource } from "../roller";
import type { SuccessLevel } from "../types";
import {
  createRollEvaluator,
  type RollRulesDefinition,
} from "../dsl-roll-evaluator";
import { judgePercentileCheck, type DeclaredDifficulty } from "../difficulty";

/** Executor options */
export interface ExecuteRollExpressionOptions {
  /** Available tables for lookup */
  tables?: Record<string, TableDefinition>;
  /** Table ID to look up result in */
  tableId?: string;
  /** DSL roll rules for system-specific success evaluation */
  dslRollRules?: RollRulesDefinition;
  /** Target value for opposed/difficulty checks (used by DSL evaluator) */
  target?: number;
  /**
   * CoC7e: the difficulty the player declared. A `coc7:` check is then judged against
   * `floor(target / 1 | 2 | 5)` (see `judgePercentileCheck`); other rolls ignore it.
   */
  difficulty?: DeclaredDifficulty;
  /**
   * Where the dice get their numbers; `Math.random` when absent. A caller
   * that must reproduce a roll (a seeded test run) passes a seeded source.
   */
  random?: RandomSource;
}

/**
 * 執行 roll expression
 *
 * @param expression - 完整表達式，如 "coc7:1d100<={{@dex /floor 5}}"
 * @param context - 角色資料 context，用於計算公式
 * @param options - 可選設定，包含查表功能
 * @returns 擲骰結果，或 null 如果表達式無效
 */
export function executeRollExpression(
  expression: string,
  context: Record<string, number>,
  options?: ExecuteRollExpressionOptions,
): RollExpressionResult | null {
  // Defensive reject: a `{{#...}}` macro reference reaching the executor means
  // a caller failed to expand it first — without this, the {{formula}}
  // substitution below would silently degrade it to garbage (see
  // dice-macro-functions design.md's advisor findings).
  if (/\{\{#[a-zA-Z_]/.test(expression)) {
    return null;
  }

  const parsed = parseRollExpression(expression);
  if (!parsed) {
    return null;
  }

  // 1. 處理 dice expression 中的 {{formula}}
  let diceExpr = parsed.diceExpr;
  const formulaMatches = diceExpr.match(/\{\{[^}]+\}\}/g);

  if (formulaMatches) {
    for (const match of formulaMatches) {
      const ast = parseFormula(match);
      if (ast) {
        const value = evaluateFormula(ast, context);
        if (typeof value === "number") {
          const index = diceExpr.indexOf(match);
          const operator = diceExpr[index - 1];
          // A die's size (`1d{{@size}}`) takes the bare number; it is never signed.
          if (operator === "d" || operator === "D") {
            if (!Number.isInteger(value) || value < 1) return null;
            diceExpr = diceExpr.replace(match, String(value));
            continue;
          }
          const hasOperator = operator === "+" || operator === "-";
          const signedValue = operator === "-" ? -value : value;
          const isAtStart = index === 0 || (hasOperator && index === 1);
          diceExpr = diceExpr.replace(
            hasOperator ? operator + match : match,
            isAtStart
              ? String(signedValue)
              : signedValue >= 0
                ? `+${signedValue}`
                : String(signedValue),
          );
        }
      }
    }
  }

  // 2. 擲骰
  let result: RollExpressionResult | null = null;
  const resolvedDiceExpr = parsed.system ? `${parsed.system}:${diceExpr}` : diceExpr;

  // 3. 如果有比較運算符，計算目標值並比較
  if (parsed.comparator && parsed.targetFormula) {
    const targetAst = parseFormula(parsed.targetFormula);
    if (targetAst) {
      const targetValue = evaluateFormula(targetAst, context);
      if (typeof targetValue === "number") {
        // Accepts either the "b"/"p" letter suffix (buildRollExpression's
        // convention) or a plain signed integer (produced when a macro
        // substitutes `{{bonusPenalty}}` into `1d100{{bonusPenalty}}` — see
        // dice-macro-functions design.md D12).
        const cocMatch = diceExpr.match(/^1d100(?:([bp])(\d+)|([+-])(\d+))?$/i);
        if (parsed.system === "coc7" && cocMatch) {
          const letterSign = cocMatch[1];
          const signedSign = cocMatch[3];
          let bonusDice = 0;
          if (letterSign) {
            const amount = parseInt(cocMatch[2], 10);
            bonusDice = letterSign.toLowerCase() === "b" ? amount : -amount;
          } else if (signedSign) {
            const amount = parseInt(cocMatch[4], 10);
            bonusDice = signedSign === "+" ? amount : -amount;
          }
          const cocResult = rollCoC7eSkillCheck(
            {
              skillName: "CoC7 Check",
              targetValue,
              bonusDice,
            },
            options?.random,
          );
          result = {
            expression,
            resolvedDiceExpr,
            rolled: cocResult.roll,
            rolls: [
              ...(cocResult.tensDice ?? []),
              ...(cocResult.unitsDice ?? []),
            ],
            targetValue,
            comparator: parsed.comparator,
            bonusDice: cocResult.bonusDice,
            tensDice: cocResult.tensDice,
            unitsDice: cocResult.unitsDice,
            selectedTens: cocResult.selectedTens,
            selectedUnits: cocResult.selectedUnits,
          };
        } else {
          const diceResult = rollDiceExpression(diceExpr, options?.random);
          if (!diceResult) {
            return null;
          }

          result = {
            expression,
            resolvedDiceExpr,
            rolled: diceResult.total,
            rolls: diceResult.dice.flatMap((d) => d.rolls),
            targetValue,
            comparator: parsed.comparator,
          };
        }

        // 4. 判定結果 — 每種系統只計算一次，不重複覆寫
        if (parsed.system === "coc7" && result) {
          const judged = judgePercentileCheck({
            rolled: result.rolled,
            value: targetValue,
            difficulty: options?.difficulty,
            rollRules: options?.dslRollRules,
          });
          if (!judged) {
            throw new Error(
              `CoC7e roll (rolled=${result.rolled}, target=${targetValue}) matched no success-level band in dsl-roll-rules — this is a data bug, not a valid "no result" case.`,
            );
          }
          result.successLevel = judged.level as SuccessLevel;
          if (judged.difficulty) result.difficulty = judged.difficulty;
        } else if (parsed.system === "fate" && options?.dslRollRules && result) {
          // Fate 系統：使用 DSL 規則評估
          const evaluator = createRollEvaluator(options.dslRollRules);
          // For Fate, use options.target as the difficulty/opposition value
          const dslTarget = options.target ?? targetValue;
          // The executor's result.rolled already includes modifiers from the
          // dice expression (e.g., 4dF+{{@skill}}). To avoid double-counting
          // with DSL's modifier calculation, explicitly neutralize Fate's
          // skill modifier so the evaluator treats result.rolled as final.
          const dslResult = evaluator.evaluateSuccessLevel(
            "fate",
            result.rolled,
            dslTarget,
            { skill: 0 },
          );
          if (dslResult) {
            result.successLevel = dslResult;
          }
        } else if (result) {
          // 通用比較：只回傳 pass/fail
          result.passed = compare(
            result.rolled,
            parsed.comparator,
            targetValue,
          );
        }
      }
    }
  } else {
    const diceResult = rollDiceExpression(diceExpr, options?.random);
    if (!diceResult) {
      return null;
    }

    result = {
      expression,
      resolvedDiceExpr,
      rolled: diceResult.total,
      rolls: diceResult.dice.flatMap((d) => d.rolls),
    };
  }

  if (!result) {
    return null;
  }

  // 4. 如果有指定查表，查找結果
  if (options?.tableId && options?.tables) {
    const table = options.tables[options.tableId];
    if (table) {
      const match = table.ranges.find(
        (r) => result.rolled >= r.min && result.rolled <= r.max,
      );
      if (match) {
        result.tableResult = {
          tableId: options.tableId,
          value: match.value,
          label: match.label,
        };
      }
    }
  }

  return result;
}

/**
 * 比較兩個數值
 */
function compare(
  rolled: number,
  comparator: Comparator,
  target: number,
): boolean {
  switch (comparator) {
    case "<=":
      return rolled <= target;
    case ">=":
      return rolled >= target;
    case "<":
      return rolled < target;
    case ">":
      return rolled > target;
    case "=":
      return rolled === target;
    default:
      return false;
  }
}
