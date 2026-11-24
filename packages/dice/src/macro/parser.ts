// @skald/dice macro/parser.ts

import { parseFormula } from "../formula/parser";
import type { ParsedMacroCall } from "./types";

/** Regex to match macro references: {{#macroId}} or {{#macroId[arg1, arg2]}} */
const MACRO_REFERENCE_REGEX =
  /\{\{#([a-zA-Z_][a-zA-Z0-9_]*)(?:\[([^\]]*)\])?\}\}/;
const MACRO_REFERENCE_GLOBAL_REGEX =
  /\{\{#([a-zA-Z_][a-zA-Z0-9_]*)(?:\[([^\]]*)\])?\}\}/g;
const SHORTHAND_MACRO_REGEX =
  /^#([a-zA-Z_][a-zA-Z0-9_]*)(?:\[([^\]]*)\])?$/;

/** Splits a `[...]` arg-list body on top-level commas (ignores commas nested in parens/quotes) */
function splitTopLevelArgs(argsSource: string): string[] {
  const trimmed = argsSource.trim();
  if (!trimmed) return [];

  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (ch === "'" || ch === '"') {
      const quote = ch;
      i++;
      while (i < trimmed.length && trimmed[i] !== quote) i++;
    } else if (ch === "," && depth === 0) {
      parts.push(trimmed.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(trimmed.slice(start).trim());
  return parts;
}

function buildParsedMacroCall(
  macroId: string,
  argsSource: string | undefined,
  raw: string,
): ParsedMacroCall {
  const argSources = argsSource !== undefined ? splitTopLevelArgs(argsSource) : [];
  const args = argSources.map((src) => {
    const ast = parseFormula(src);
    if (!ast) {
      throw new Error(`Invalid macro argument expression: ${src} (in ${raw})`);
    }
    return ast;
  });
  return { macroId, args, raw };
}

/**
 * Normalize user input into canonical roll syntax.
 * Supports shorthand macro input like "#DEX" or "#coc[@str, 1]".
 */
export function normalizeRollInput(input: string): string {
  const trimmed = input.trim();
  const shorthand = trimmed.match(SHORTHAND_MACRO_REGEX);
  if (shorthand) {
    const [, macroId, argsSource] = shorthand;
    return argsSource !== undefined ? `{{#${macroId}[${argsSource}]}}` : `{{#${macroId}}}`;
  }
  return trimmed;
}

/**
 * Check if a string contains any macro references
 */
export function hasMacroReference(input: string): boolean {
  return MACRO_REFERENCE_REGEX.test(normalizeRollInput(input));
}

/**
 * Parse a macro reference from a string.
 * Returns the first macro reference found, or null if none.
 */
export function parseMacroReference(input: string): ParsedMacroCall | null {
  const normalized = normalizeRollInput(input);
  const match = normalized.match(MACRO_REFERENCE_REGEX);
  if (!match) return null;

  const [raw, macroId, argsSource] = match;
  return buildParsedMacroCall(macroId, argsSource, raw);
}

/**
 * Find all macro references in a string
 */
export function findAllMacroReferences(input: string): ParsedMacroCall[] {
  const normalized = normalizeRollInput(input);
  const results: ParsedMacroCall[] = [];
  let match: RegExpExecArray | null;

  MACRO_REFERENCE_GLOBAL_REGEX.lastIndex = 0;

  while ((match = MACRO_REFERENCE_GLOBAL_REGEX.exec(normalized)) !== null) {
    const [raw, macroId, argsSource] = match;
    results.push(buildParsedMacroCall(macroId, argsSource, raw));
  }

  return results;
}
