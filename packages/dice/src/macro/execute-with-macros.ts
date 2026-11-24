// packages/dice/src/macro/execute-with-macros.ts
//
// Shared entry point for "resolve a roll expression that might be a macro
// reference, evaluate it either way" — used identically by apps/web
// (character sheet clicks, inline chat roller) and apps/bot (/sr), so macro
// evaluation semantics don't get re-implemented per consumer (D1).

import {
  executeRollExpression,
  type ExecuteRollExpressionOptions,
} from "../roll-expression/executor";
import type { RollExpressionResult } from "../roll-expression/types";
import { evaluateMacro } from "./interpreter";
import { hasMacroReference, parseMacroReference } from "./parser";
import { MacroResolver } from "./resolver";
import type { MacroWrite, RollMacroRegistry } from "./types";

export interface ExecuteWithMacrosResult {
  /** Null when the macro body has no `return` (write-only macro) — writes/rolls may still be non-empty */
  result: RollExpressionResult | null;
  /** Pending field writes — flush exactly once, after the final rolled value is known (D4) */
  writes: MacroWrite[];
  rolls: RollExpressionResult[];
}

/**
 * Execute a roll expression that may be a `{{#name[args]}}` macro reference
 * or a plain roll expression. Returns null if the expression is invalid, the
 * macro is unknown, or no registry was supplied for a macro reference.
 */
export function executeExpressionWithMacros(
  expression: string,
  registry: RollMacroRegistry | undefined,
  context: Record<string, number>,
  options?: ExecuteRollExpressionOptions,
  argOverrides?: Record<string, number>,
): ExecuteWithMacrosResult | null {
  if (hasMacroReference(expression)) {
    if (!registry) return null;
    const parsed = parseMacroReference(expression);
    if (!parsed) return null;

    const resolver = new MacroResolver(registry);
    const definition = resolver.resolve(parsed.macroId);
    if (!definition) return null;

    const evalResult = evaluateMacro(definition, parsed, context, options, argOverrides);
    if (!evalResult.result && evalResult.writes.length === 0 && evalResult.rolls.length === 0) {
      return null;
    }
    return { result: evalResult.result, writes: evalResult.writes, rolls: evalResult.rolls };
  }

  const result = executeRollExpression(expression, context, options);
  if (!result) return null;
  return { result, writes: [], rolls: [result] };
}
