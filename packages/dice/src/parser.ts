import type { Die, DiceModifiers } from "./types";
import { MAX_DICE_COUNT, MAX_EXPRESSION_LENGTH, isValidDie } from "./limits";
import { hasMacroReference, normalizeRollInput } from "./macro/parser";

export interface ParsedDiceExpression {
  dice: Die[];
  modifier: number;
  multiplier: number;
}

export interface ValidationError {
  type: "error" | "warning";
  message: string;
  position?: number;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  parsed?: ParsedDiceExpression;
}

/**
 * Parse dice modifiers from a string (Roll20-style)
 * Examples: "kh3", "kl1", "dh1", "dl2", "!", "!!", "!p", "!>5"
 */
function parseDiceModifiers(modStr: string): DiceModifiers | null {
  if (!modStr) return null;

  const mods: DiceModifiers = {};
  const tokens = modStr.toUpperCase().match(/K[HL]?\d+|D[HL]?\d+|!!?P?(?:[>=]\d+)?/g);
  if (!tokens || tokens.join("") !== modStr.toUpperCase()) return null;
  for (const token of tokens) {
    const keepDrop = token.match(/^([KD])([HL]?)(\d+)$/);
    if (keepDrop) {
      const key = keepDrop[1] === "K"
        ? (keepDrop[2] === "L" ? "keepLowest" : "keepHighest")
        : (keepDrop[2] === "H" ? "dropHighest" : "dropLowest");
      const value = Number(keepDrop[3]);
      if (mods[key] !== undefined || !Number.isSafeInteger(value) || value < 1) return null;
      mods[key] = value;
    } else {
      if (mods.exploding || mods.compounding || mods.penetrating) return null;
      if (token.startsWith("!!P")) return null;
      if (token.startsWith("!!")) mods.compounding = true;
      else if (token.startsWith("!P")) mods.penetrating = true;
      else mods.exploding = true;
      const threshold = token.match(/[>=](\d+)$/);
      if (threshold) {
        mods.explodeOn = Number(threshold[1]);
        if (!Number.isSafeInteger(mods.explodeOn) || mods.explodeOn < 1) return null;
      }
    }
  }
  return mods;
}

/**
 * Parse a dice expression like "3D6", "2D6+6", "2d4+1d6", "(1D6+13)×5"
 * Supports multiple dice groups: "2d4+1d6+5", "1d20+2d8-3"
 * Supports Roll20-style modifiers: "4d6kh3", "1d6!", "2d10!!", "4d6dl1"
 * Returns null if expression is invalid
 */
export function parseDiceExpression(expr: string): ParsedDiceExpression | null {
  if (!expr || typeof expr !== "string" || expr.length > MAX_EXPRESSION_LENGTH) return null;

  // Normalize: trim, replace × with *, remove spaces
  let normalized = expr.trim();
  normalized = normalized.replace(/×/g, "*").replace(/\s+/g, "");

  // Extract multiplier if present: (...)×N or expr×N or expr*N or exprxN
  let multiplier = 1;
  const multiplierMatch = normalized.match(/[X*](\d+)$/i);
  if (multiplierMatch) {
    multiplier = parseInt(multiplierMatch[1], 10);
    normalized = normalized.replace(/[X*]\d+$/i, "");
  }

  // 僅支援包住整體表達式的括號；不可忽略未配對或內部分組。
  while (normalized.startsWith("(") && normalized.endsWith(")")) {
    normalized = normalized.slice(1, -1);
  }
  if (/[()]/.test(normalized) || !Number.isSafeInteger(multiplier)) return null;

  // Parse all dice groups and modifiers
  // Supports: 2d4+1d6+5, 1d20-3, 3d6+2d8-2, 4dF (Fudge dice)
  // Roll20 modifiers: 4d6kh3 (keep highest 3), 1d6! (exploding), etc.
  const dice: Die[] = [];
  let modifier = 0;

  // Enhanced regex to match dice groups with optional modifiers
  // Groups: sign, count, 'd', sides, modifiers (kh3, !, !!, etc.) OR just +/-N
  const tokenRegex = /([+-])?(\d*)D(\d+|F)((?:K(?:H|L)?\d+|D(?:H|L)?\d+|!!?P?(?:[>=]\d+)?)*)|([+-])(\d+)/gi;
  let match;
  let hasMatch = false;
  let consumed = 0;
  let totalDice = 0;

  while ((match = tokenRegex.exec(normalized)) !== null) {
    if (match.index !== consumed || (consumed > 0 && !/^[+-]/.test(match[0]))) return null;
    consumed = tokenRegex.lastIndex;
    hasMatch = true;

    if (match[3]) {
      // Dice group: [sign]NdM[modifiers] or [sign]NdF[modifiers]
      const sign = match[1] === "-" ? -1 : 1;
      const count = match[2] ? parseInt(match[2], 10) : 1;
      const sidesStr = match[3].toUpperCase();
      const sides: number | "F" = sidesStr === "F" ? "F" : parseInt(sidesStr, 10);
      const modifiersStr = match[4] || "";

      if (isNaN(count) || count < 1) {
        return null;
      }
      if (typeof sides === "number" && (isNaN(sides) || sides < 1)) {
        return null;
      }

      // Parse Roll20-style modifiers
      const modifiers = parseDiceModifiers(modifiersStr);
      if (modifiersStr && !modifiers) return null;

      // Validate modifiers against dice count
      if (modifiers) {
        const keepDrop =
          (modifiers.keepHighest || 0) +
          (modifiers.keepLowest || 0) +
          (modifiers.dropHighest || 0) +
          (modifiers.dropLowest || 0);
        if (keepDrop > count) {
          return null; // Can't keep/drop more dice than rolled
        }
      }

      const die: Die = { count, sides };
      if (modifiers) {
        die.modifiers = modifiers;
      }
      if (sign === -1) {
        die.sign = -1;
      }
      totalDice += count;
      if (!isValidDie(die) || totalDice > MAX_DICE_COUNT) return null;
      dice.push(die);
    } else if (match[6]) {
      // Numeric modifier: +N or -N
      const sign = match[5] === "-" ? -1 : 1;
      const value = parseInt(match[6], 10);
      modifier += sign * value;
    }
  }

  // Must have at least one dice group
  if (!hasMatch || dice.length === 0 || consumed !== normalized.length || !Number.isSafeInteger(modifier)) {
    return null;
  }

  const maxTotal = dice.reduce((sum, die) => sum +
    (die.count + (die.modifiers ? 100 : 0)) * (die.sides === "F" ? 1 : die.sides), Math.abs(modifier));
  if (!Number.isSafeInteger(maxTotal * multiplier)) return null;

  return {
    dice,
    modifier,
    multiplier,
  };
}

/**
 * Validate a dice expression and return detailed errors/warnings
 * Use this for UI feedback before rolling
 */
export function validateDiceExpression(expr: string): ValidationResult {
  const errors: ValidationError[] = [];

  if (!expr || typeof expr !== "string" || !expr.trim()) {
    return {
      valid: false,
      errors: [{ type: "error", message: "請輸入擲骰表達式" }],
    };
  }

  const trimmed = expr.trim();
  const normalized = normalizeRollInput(trimmed);

  // Check for common mistakes
  if (/^[+-]/.test(trimmed)) {
    errors.push({
      type: "warning",
      message: "表達式以符號開頭，將視為修正值",
    });
  }

  // Check for invalid characters (excluding allowed: digits, d, f, +, -, *, ×, x, k, h, l, !, p, >, =, parens, spaces, @, {, })
  // Content inside {{...}} (attribute/macro formulas) has its own grammar and is
  // validated separately below, so it's excluded from this dice-notation whitelist.
  const invalidChars = normalized
    .replace(/\{\{[^}]*\}\}/g, "")
    .replace(/[\d\s+\-*×xdDfFkKhHlL!pP>=()@{}#]/g, "");
  if (invalidChars.length > 0) {
    errors.push({
      type: "error",
      message: `無效字符: ${invalidChars.slice(0, 10)}`,
    });
    return { valid: false, errors };
  }

  if (hasMacroReference(normalized)) {
    errors.push({
      type: "warning",
      message: "包含擲骰巨集參照，需要角色資料與系統巨集才能完整計算",
    });
    return { valid: true, errors };
  }

  // Check for {{@...}} formula references (these are valid but can't be fully validated without context)
  if (/\{\{@[^}]+\}\}/.test(normalized)) {
    errors.push({
      type: "warning",
      message: "包含角色屬性參照，需要角色數據才能完整計算",
    });
  }

  // Try to parse
  const parsed = parseDiceExpression(normalized.replace(/\{\{@[^}]+\}\}/g, "0"));
  if (!parsed) {
    errors.push({
      type: "error",
      message: "無效的擲骰語法",
    });
    return { valid: false, errors };
  }

  // Validate dice specifications
  for (const die of parsed.dice) {
    if (typeof die.sides === "number" && die.sides > 1000) {
      errors.push({
        type: "warning",
        message: `d${die.sides} 骰子面數過大`,
      });
    }
    if (die.count > 100) {
      errors.push({
        type: "warning",
        message: `${die.count}d${die.sides} 骰子數量過多`,
      });
    }

    // Validate modifiers
    if (die.modifiers) {
      const { keepHighest, keepLowest, dropHighest, dropLowest } = die.modifiers;
      const totalKeepDrop =
        (keepHighest || 0) + (keepLowest || 0) + (dropHighest || 0) + (dropLowest || 0);
      if (totalKeepDrop > die.count) {
        errors.push({
          type: "error",
          message: `保留/丟棄數量 (${totalKeepDrop}) 不能大於骰子數 (${die.count})`,
        });
        return { valid: false, errors };
      }
    }
  }

  return {
    valid: true,
    errors,
    parsed,
  };
}
