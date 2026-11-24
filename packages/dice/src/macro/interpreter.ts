// packages/dice/src/macro/interpreter.ts

import { evaluateFormula, parseFormula } from "../formula/parser";
import type { FormulaAST } from "../formula/parser";
import {
  executeRollExpression,
  type ExecuteRollExpressionOptions,
} from "../roll-expression/executor";
import type { RollExpressionResult } from "../roll-expression/types";
import type { SuccessLevel } from "../types";
import type {
  MacroStatement,
  MacroWrite,
  MacroWriteTarget,
  ParsedMacroCall,
  ResolvedMacroDefinition,
} from "./types";

export class MacroEvaluationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MacroEvaluationError";
  }
}

export interface MacroEvalResult {
  /** The RollExpressionResult of whichever roll(...) the macro's `return` resolved to, if any */
  result: RollExpressionResult | null;
  /** Pending field writes — not yet flushed against live character data (commit-once, see D4) */
  writes: MacroWrite[];
  /** Every roll triggered during evaluation, in order (includes `result`'s roll when non-null) */
  rolls: RollExpressionResult[];
}

interface EvalState {
  scope: Record<string, number>;
  writes: MacroWrite[];
  rolls: RollExpressionResult[];
  options?: ExecuteRollExpressionOptions;
}

interface ReturnSignal {
  result: RollExpressionResult | null;
}

function bindRollOutcome(scope: Record<string, number>, result: RollExpressionResult): void {
  scope.rolled = result.rolled;
  scope.total = result.rolled;
  if (result.targetValue !== undefined) {
    scope.target = result.targetValue;
    scope.margin = result.targetValue - result.rolled;
  }
}

function runRoll(template: string, state: EvalState): RollExpressionResult {
  const result = executeRollExpression(template, state.scope, state.options);
  if (!result) {
    throw new MacroEvaluationError(`Invalid roll expression produced by macro: "${template}"`);
  }
  state.rolls.push(result);
  bindRollOutcome(state.scope, result);
  return result;
}

function resolveWriteTarget(target: MacroWriteTarget, scope: Record<string, number>): string {
  if (target.kind === "static") return target.field;
  const value = evaluateFormula(target.expr, scope);
  if (typeof value !== "string") {
    throw new MacroEvaluationError(
      `Dynamic write target must evaluate to a field name (string), got ${typeof value}`,
    );
  }
  return value;
}

function runStatements(statements: MacroStatement[], state: EvalState): ReturnSignal | null {
  for (const statement of statements) {
    const signal = runStatement(statement, state);
    if (signal) return signal;
  }
  return null;
}

function runStatement(statement: MacroStatement, state: EvalState): ReturnSignal | null {
  switch (statement.kind) {
    case "roll": {
      runRoll(statement.template, state);
      return null;
    }

    case "assign": {
      const field = resolveWriteTarget(statement.target, state.scope);
      const value = evaluateFormula(statement.expr, state.scope);
      if (typeof value !== "number" && typeof value !== "string") {
        throw new MacroEvaluationError(
          `Field write value must be a number or string (field: ${field})`,
        );
      }
      state.writes.push({ field, value });
      return null;
    }

    case "return": {
      if (statement.value.kind === "roll") {
        const result = runRoll(statement.value.template, state);
        return { result };
      }
      const value = evaluateFormula(statement.value.expr, state.scope);
      const lastRoll = state.rolls.length > 0 ? state.rolls[state.rolls.length - 1] : null;
      if (lastRoll && typeof value === "string") {
        return { result: { ...lastRoll, successLevel: value as SuccessLevel } };
      }
      if (lastRoll && typeof value === "number") {
        // Overrides only the headline value, not the underlying dice
        // breakdown (`rolls`) — mirrors how a string return only overrides
        // `successLevel`, leaving everything else about the preceding roll
        // intact. `return @rolled;` (the identity case) is a no-op here,
        // same as before this branch existed.
        return { result: { ...lastRoll, rolled: value } };
      }
      return { result: lastRoll };
    }

    case "if": {
      for (const branch of statement.branches) {
        if (Boolean(evaluateFormula(branch.condition, state.scope))) {
          return runStatements(branch.body, state);
        }
      }
      if (statement.elseBody) {
        return runStatements(statement.elseBody, state);
      }
      throw new MacroEvaluationError(
        "No matching if/elif branch and no else — macro evaluation requires an explicit branch, not a silent fallback.",
      );
    }
  }
}

function resolveArgValue(
  paramName: string,
  ast: FormulaAST | undefined,
  defaultSource: string | undefined,
  callerContext: Record<string, number>,
  macroId: string,
): number {
  if (ast) {
    const value = evaluateFormula(ast, callerContext);
    if (typeof value !== "number") {
      throw new MacroEvaluationError(
        `Macro "${macroId}" argument for "${paramName}" must evaluate to a number.`,
      );
    }
    return value;
  }
  if (defaultSource !== undefined) {
    const defaultAst = parseFormula(defaultSource);
    const value = defaultAst ? evaluateFormula(defaultAst, callerContext) : undefined;
    if (typeof value !== "number") {
      throw new MacroEvaluationError(
        `Macro "${macroId}" parameter "${paramName}" has no argument and an invalid default.`,
      );
    }
    return value;
  }
  throw new MacroEvaluationError(
    `Macro "${macroId}" call is missing required argument "${paramName}".`,
  );
}

/**
 * Evaluate a resolved macro definition against a parsed call.
 *
 * `argOverrides` lets a caller override a bound parameter's value at
 * roll-execution time (e.g. CoC7e's bonus/penalty dice picker), without the
 * template's stored call needing to supply that argument (D12).
 */
export function evaluateMacro(
  definition: ResolvedMacroDefinition,
  call: ParsedMacroCall,
  callerContext: Record<string, number>,
  options?: ExecuteRollExpressionOptions,
  argOverrides?: Record<string, number>,
): MacroEvalResult {
  if (call.args.length > definition.params.length) {
    throw new MacroEvaluationError(
      `Macro "${definition.macroId}" was called with ${call.args.length} argument(s) but declares only ${definition.params.length}.`,
    );
  }

  const scope: Record<string, number> = { ...callerContext };
  definition.params.forEach((param, index) => {
    scope[param.name] = resolveArgValue(
      param.name,
      call.args[index],
      param.default,
      callerContext,
      definition.macroId,
    );
  });

  if (argOverrides) {
    for (const [name, value] of Object.entries(argOverrides)) {
      scope[name] = value;
    }
  }

  const state: EvalState = { scope, writes: [], rolls: [], options };
  const signal = runStatements(definition.body, state);

  return {
    result: signal?.result ?? null,
    writes: state.writes,
    rolls: state.rolls,
  };
}
