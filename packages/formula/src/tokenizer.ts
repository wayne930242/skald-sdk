import { FORMULA_LIMITS } from "./policy";
import type { FormulaIssue } from "./types";

export type FormulaToken =
  | { type: "number"; value: number; start: number; end: number }
  | { type: "string"; value: string; start: number; end: number }
  | { type: "boolean"; value: boolean; start: number; end: number }
  | { type: "reference"; value: string; start: number; end: number }
  | { type: "identifier"; value: string; start: number; end: number }
  | { type: "operator"; value: string; start: number; end: number }
  | { type: "leftParen" | "rightParen" | "comma"; start: number; end: number }
  | { type: "eof"; start: number; end: number };

export type TokenizeResult =
  | { success: true; tokens: FormulaToken[] }
  | { success: false; issues: FormulaIssue[] };

function syntaxIssue(
  formulaId: string,
  message: string,
  start: number,
  end: number
): FormulaIssue {
  return { category: "syntax_error", formulaId, message, start, end };
}

export function tokenizeFormula(
  formulaId: string,
  source: string
): TokenizeResult {
  if (source.length > FORMULA_LIMITS.maxSourceLength) {
    return {
      success: false,
      issues: [
        {
          category: "source_too_long",
          formulaId,
          message: `Formula exceeds ${FORMULA_LIMITS.maxSourceLength} characters.`,
          start: 0,
          end: source.length,
        },
      ],
    };
  }
  if (!source.startsWith("=")) {
    return {
      success: false,
      issues: [syntaxIssue(formulaId, "Formula must start with =.", 0, 1)],
    };
  }

  const tokens: FormulaToken[] = [];
  let position = 1;
  while (position < source.length) {
    const char = source[position];
    if (/\s/.test(char)) {
      position += 1;
      continue;
    }

    const numberMatch = source
      .slice(position)
      .match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/);
    if (numberMatch) {
      const start = position;
      position += numberMatch[0].length;
      const value = Number(numberMatch[0]);
      if (!Number.isFinite(value)) {
        return {
          success: false,
          issues: [syntaxIssue(formulaId, "Number is not finite.", start, position)],
        };
      }
      tokens.push({ type: "number", value, start, end: position });
      continue;
    }

    if (char === '"') {
      const start = position;
      position += 1;
      let value = "";
      let closed = false;
      while (position < source.length) {
        if (source[position] === '"') {
          position += 1;
          closed = true;
          break;
        }
        if (source[position] === "\\") {
          const escaped = source[position + 1];
          if (escaped !== '"' && escaped !== "\\") {
            return {
              success: false,
              issues: [
                syntaxIssue(
                  formulaId,
                  "Only quoted strings and backslashes may be escaped.",
                  position,
                  position + 2
                ),
              ],
            };
          }
          value += escaped;
          position += 2;
          continue;
        }
        value += source[position];
        position += 1;
      }
      if (!closed) {
        return {
          success: false,
          issues: [syntaxIssue(formulaId, "String is not closed.", start, position)],
        };
      }
      tokens.push({ type: "string", value, start, end: position });
      continue;
    }

    if (char === "[") {
      const start = position;
      const closing = source.indexOf("]", position + 1);
      if (closing < 0) {
        return {
          success: false,
          issues: [syntaxIssue(formulaId, "Reference is not closed.", start, source.length)],
        };
      }
      const value = source.slice(position + 1, closing).trim();
      if (!value) {
        return {
          success: false,
          issues: [syntaxIssue(formulaId, "Reference is empty.", start, closing + 1)],
        };
      }
      position = closing + 1;
      tokens.push({ type: "reference", value, start, end: position });
      continue;
    }

    const identifierMatch = source.slice(position).match(/^[A-Za-z_][A-Za-z0-9_]*/);
    if (identifierMatch) {
      const start = position;
      position += identifierMatch[0].length;
      const normalized = identifierMatch[0].toUpperCase();
      if (normalized === "TRUE" || normalized === "FALSE") {
        tokens.push({
          type: "boolean",
          value: normalized === "TRUE",
          start,
          end: position,
        });
      } else {
        tokens.push({
          type: "identifier",
          value: normalized,
          start,
          end: position,
        });
      }
      continue;
    }

    const twoCharacterOperator = source.slice(position, position + 2);
    if (["<=", ">=", "<>"].includes(twoCharacterOperator)) {
      tokens.push({
        type: "operator",
        value: twoCharacterOperator,
        start: position,
        end: position + 2,
      });
      position += 2;
      continue;
    }
    if (["+", "-", "*", "/", "=", "<", ">"].includes(char)) {
      tokens.push({
        type: "operator",
        value: char,
        start: position,
        end: position + 1,
      });
      position += 1;
      continue;
    }

    const punctuation = {
      "(": "leftParen",
      ")": "rightParen",
      ",": "comma",
    } as const;
    const punctuationType = punctuation[char as keyof typeof punctuation];
    if (punctuationType) {
      tokens.push({
        type: punctuationType,
        start: position,
        end: position + 1,
      });
      position += 1;
      continue;
    }

    return {
      success: false,
      issues: [
        syntaxIssue(
          formulaId,
          `Unexpected character ${JSON.stringify(char)}.`,
          position,
          position + 1
        ),
      ],
    };
  }

  tokens.push({ type: "eof", start: source.length, end: source.length });
  return { success: true, tokens };
}
