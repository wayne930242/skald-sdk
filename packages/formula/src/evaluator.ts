import { FORMULA_COMPILER_VERSION, FORMULA_LANGUAGE } from "./policy";
import type {
  CompiledFormulaExpression,
  FormulaEvaluationContext,
  FormulaEvaluationResult,
  FormulaExpression,
  FormulaValue,
} from "./types";

type ValueResult =
  | { success: true; value: FormulaValue }
  | {
      success: false;
      category: "divide_by_zero" | "reference_not_found" | "lookup_not_found" | "evaluation_error";
      message: string;
    };

function value(value: FormulaValue): ValueResult {
  return { success: true, value };
}

function failure(
  category: Exclude<ValueResult, { success: true }>["category"],
  message: string
): ValueResult {
  return { success: false, category, message };
}

function numericArguments(values: FormulaValue[]): number[] | null {
  return values.every((item) => typeof item === "number")
    ? (values as number[])
    : null;
}

function decimalScale(digits: number): number {
  return 10 ** Math.trunc(digits);
}

function excelRound(number: number, digits = 0): number {
  const scale = decimalScale(digits);
  return (Math.sign(number) * Math.round(Math.abs(number) * scale)) / scale;
}

function roundDown(number: number, digits = 0): number {
  const scale = decimalScale(digits);
  return Math.trunc(number * scale) / scale;
}

function roundUp(number: number, digits = 0): number {
  const scale = decimalScale(digits);
  return (Math.sign(number) * Math.ceil(Math.abs(number) * scale)) / scale;
}

function evaluateReference(
  expression: Extract<FormulaExpression, { op: "reference" }>,
  context: FormulaEvaluationContext
): ValueResult {
  const { reference } = expression;
  if (reference.scope === "list") {
    return failure(
      "evaluation_error",
      "List aggregate runtime is not available for this compiled formula."
    );
  }
  const source = reference.scope === "row" ? context.row : context.character;
  const resolved =
    source && Object.hasOwn(source, reference.fieldId)
      ? source[reference.fieldId]
      : undefined;
  if (resolved === undefined) {
    return failure(
      "reference_not_found",
      `Reference ${reference.fieldId} has no value.`
    );
  }
  if (typeof resolved !== expression.valueType) {
    return failure(
      "evaluation_error",
      `Reference ${reference.fieldId} is ${typeof resolved}, expected ${expression.valueType}.`
    );
  }
  return value(resolved);
}

function evaluateCall(
  expression: Extract<FormulaExpression, { op: "call" }>,
  context: FormulaEvaluationContext
): ValueResult {
  if (expression.function === "IF") {
    const condition = evaluateExpression(expression.arguments[0], context);
    if (!condition.success) return condition;
    return evaluateExpression(
      condition.value ? expression.arguments[1] : expression.arguments[2],
      context
    );
  }
  if (expression.function === "AND" || expression.function === "OR") {
    const expected = expression.function === "AND";
    for (const argument of expression.arguments) {
      const result = evaluateExpression(argument, context);
      if (!result.success) return result;
      if (Boolean(result.value) !== expected) return value(!expected);
    }
    return value(expected);
  }

  const evaluated: FormulaValue[] = [];
  for (const argument of expression.arguments) {
    const result = evaluateExpression(argument, context);
    if (!result.success) return result;
    evaluated.push(result.value);
  }

  if (expression.function === "NOT") return value(!Boolean(evaluated[0]));
  if (expression.function === "LOOKUP") {
    const lookupValue = evaluated[0];
    const tableName = evaluated[1];
    if (typeof lookupValue !== "number" || typeof tableName !== "string") {
      return failure("evaluation_error", "LOOKUP received invalid arguments.");
    }
    const lookups = context.lookups;
    const table =
      lookups && Object.hasOwn(lookups, tableName) ? lookups[tableName] : undefined;
    if (!table) {
      return failure("lookup_not_found", `Lookup table ${tableName} is unavailable.`);
    }
    const match = [...table]
      .sort((left, right) => left.threshold - right.threshold)
      .filter((entry) => entry.threshold <= lookupValue)
      .at(-1);
    return match
      ? value(match.value)
      : failure("lookup_not_found", `Lookup table ${tableName} has no matching row.`);
  }

  const numbers = numericArguments(evaluated);
  if (!numbers) {
    return failure(
      "evaluation_error",
      `${expression.function} received a non-number argument.`
    );
  }
  switch (expression.function) {
    case "ABS":
      return value(Math.abs(numbers[0]));
    case "AVERAGE":
      return value(numbers.reduce((sum, item) => sum + item, 0) / numbers.length);
    case "COUNT":
      return value(numbers.length);
    case "MAX":
      return value(Math.max(...numbers));
    case "MIN":
      return value(Math.min(...numbers));
    case "SUM":
      return value(numbers.reduce((sum, item) => sum + item, 0));
    case "ROUND":
      return value(excelRound(numbers[0], numbers[1]));
    case "ROUNDDOWN":
      return value(roundDown(numbers[0], numbers[1]));
    case "ROUNDUP":
      return value(roundUp(numbers[0], numbers[1]));
    case "FLOOR": {
      const significance = numbers[1] ?? 1;
      return significance === 0
        ? failure("divide_by_zero", "FLOOR significance cannot be zero.")
        : value(Math.floor(numbers[0] / Math.abs(significance)) * Math.abs(significance));
    }
    case "CEILING": {
      const significance = numbers[1] ?? 1;
      return significance === 0
        ? failure("divide_by_zero", "CEILING significance cannot be zero.")
        : value(Math.ceil(numbers[0] / Math.abs(significance)) * Math.abs(significance));
    }
    default:
      return failure("evaluation_error", `Function ${expression.function} is unavailable.`);
  }
}

function evaluateExpression(
  expression: FormulaExpression,
  context: FormulaEvaluationContext
): ValueResult {
  if (expression.op === "literal") return value(expression.value);
  if (expression.op === "reference") return evaluateReference(expression, context);
  if (expression.op === "negate") {
    const operand = evaluateExpression(expression.operand, context);
    return operand.success && typeof operand.value === "number"
      ? value(-operand.value)
      : operand.success
        ? failure("evaluation_error", "Unary - received a non-number.")
        : operand;
  }
  if (expression.op === "call") return evaluateCall(expression, context);

  const left = evaluateExpression(expression.left, context);
  if (!left.success) return left;
  const right = evaluateExpression(expression.right, context);
  if (!right.success) return right;
  switch (expression.operator) {
    case "+":
      return value((left.value as number) + (right.value as number));
    case "-":
      return value((left.value as number) - (right.value as number));
    case "*":
      return value((left.value as number) * (right.value as number));
    case "/":
      return right.value === 0
        ? failure("divide_by_zero", "Formula divides by zero.")
        : value((left.value as number) / (right.value as number));
    case "=":
      return value(left.value === right.value);
    case "<>":
      return value(left.value !== right.value);
    case "<":
      return value(left.value < right.value);
    case "<=":
      return value(left.value <= right.value);
    case ">":
      return value(left.value > right.value);
    case ">=":
      return value(left.value >= right.value);
  }
}

export function evaluateFormula(
  formula: CompiledFormulaExpression,
  context: FormulaEvaluationContext
): FormulaEvaluationResult {
  if (
    formula.language !== FORMULA_LANGUAGE ||
    formula.compilerVersion !== FORMULA_COMPILER_VERSION
  ) {
    return {
      status: "error",
      error: {
        category: "runtime_version",
        formulaId: formula.formulaId,
        message: `Unsupported formula runtime ${formula.language}/${formula.compilerVersion}.`,
      },
    };
  }
  const result = evaluateExpression(formula.expression, context);
  if (!result.success) {
    return {
      status: "error",
      error: {
        category: result.category,
        formulaId: formula.formulaId,
        message: result.message,
      },
    };
  }
  if (typeof result.value === "number" && !Number.isFinite(result.value)) {
    return {
      status: "error",
      error: {
        category: "evaluation_error",
        formulaId: formula.formulaId,
        message: "Formula returned a non-finite number.",
      },
    };
  }
  if (typeof result.value !== formula.resultType) {
    return {
      status: "error",
      error: {
        category: "output_type",
        formulaId: formula.formulaId,
        message: `Formula returned ${typeof result.value}, expected ${formula.resultType}.`,
      },
    };
  }
  return { status: "value", value: result.value };
}
