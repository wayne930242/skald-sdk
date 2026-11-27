// @skald/dice roll-expression/parser.ts
import type { ParsedRollExpression, Comparator, RollSystem } from "./types";

const SYSTEM_PREFIXES: RollSystem[] = ["coc7", "fate"];
const COMPARATORS: Comparator[] = ["<=", ">=", "<", ">", "="];

/**
 * 解析 roll expression
 * 格式: [system:]diceExpr[comparator{{formula}}]
 *
 * 範例:
 * - "2d6" -> { diceExpr: "2d6" }
 * - "1d100<={{@dex}}" -> { diceExpr: "1d100", comparator: "<=", targetFormula: "{{@dex}}" }
 * - "coc7:1d100<={{@dex}}" -> { system: "coc7", diceExpr: "1d100", comparator: "<=", targetFormula: "{{@dex}}" }
 */
export function parseRollExpression(expr: string): ParsedRollExpression | null {
  if (!expr || typeof expr !== "string") {
    return null;
  }

  let remaining = expr.trim();
  let system: RollSystem | undefined;

  // 1. 解析系統前綴
  for (const prefix of SYSTEM_PREFIXES) {
    const prefixWithColon = `${prefix}:`;
    if (remaining.toLowerCase().startsWith(prefixWithColon)) {
      system = prefix;
      remaining = remaining.slice(prefixWithColon.length);
      break;
    }
  }

  // 2. 尋找比較運算符（從最長的開始匹配）
  const sortedComparators = [...COMPARATORS].sort(
    (a, b) => b.length - a.length,
  );
  let comparator: Comparator | undefined;
  let targetFormula: string | undefined;
  let diceExpr = remaining;

  for (const comp of sortedComparators) {
    const compIndex = remaining.indexOf(comp);
    if (compIndex > 0) {
      // 確保比較運算符後面有 {{ 或純數字
      const afterComp = remaining.slice(compIndex + comp.length);
      if (afterComp.startsWith("{{") || /^[+-]?\d+/.test(afterComp)) {
        comparator = comp;
        diceExpr = remaining.slice(0, compIndex);
        targetFormula = afterComp;
        break;
      }
    }
  }

  // 3. 驗證 diceExpr 不為空
  if (!diceExpr.trim()) {
    return null;
  }

  const result: ParsedRollExpression = {
    diceExpr: diceExpr.trim(),
  };

  if (system) {
    result.system = system;
  }

  if (comparator && targetFormula) {
    result.comparator = comparator;
    result.targetFormula = targetFormula;
  }

  return result;
}
