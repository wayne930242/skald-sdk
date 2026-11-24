export const FORMULA_LANGUAGE = "skald-excel-v1" as const;
export const FORMULA_COMPILER_VERSION = "skald-formula-compiler/v1" as const;

export const FORMULA_FUNCTIONS = [
  "ABS",
  "AND",
  "AVERAGE",
  "CEILING",
  "COUNT",
  "FLOOR",
  "IF",
  "LOOKUP",
  "MAX",
  "MIN",
  "NOT",
  "OR",
  "ROUND",
  "ROUNDDOWN",
  "ROUNDUP",
  "SUM",
] as const;

export const FORMULA_OPERATORS = [
  "+",
  "-",
  "*",
  "/",
  "=",
  "<>",
  "<",
  "<=",
  ">",
  ">=",
] as const;

export const FORBIDDEN_FORMULA_FUNCTIONS = [
  "DICE",
  "HYPERLINK",
  "NOW",
  "RAND",
  "RANDBETWEEN",
  "TODAY",
  "WEBSERVICE",
] as const;

export const FORMULA_LIMITS = {
  maxSourceLength: 2048,
  maxAstDepth: 32,
  maxFunctionArguments: 64,
} as const;

export type FormulaFunction = (typeof FORMULA_FUNCTIONS)[number];
export type FormulaOperator = (typeof FORMULA_OPERATORS)[number];
