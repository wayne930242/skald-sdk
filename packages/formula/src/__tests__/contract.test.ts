import { describe, expect, it } from "bun:test";
import {
  FORBIDDEN_FORMULA_FUNCTIONS,
  FORMULA_COMPILER_VERSION,
  FORMULA_FUNCTIONS,
  FORMULA_LANGUAGE,
  FORMULA_LIMITS,
  FORMULA_OPERATORS,
} from "../index";

describe("skald-excel-v1 contract", () => {
  it("matches the frozen deterministic function policy", () => {
    expect(FORMULA_LANGUAGE).toBe("skald-excel-v1");
    expect(FORMULA_COMPILER_VERSION).toBe("skald-formula-compiler/v1");
    expect(FORMULA_FUNCTIONS).toEqual([
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
    ]);
    expect(FORBIDDEN_FORMULA_FUNCTIONS).toEqual([
      "DICE",
      "HYPERLINK",
      "NOW",
      "RAND",
      "RANDBETWEEN",
      "TODAY",
      "WEBSERVICE",
    ]);
  });

  it("keeps operators and complexity limits explicit", () => {
    expect(FORMULA_OPERATORS).toEqual([
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
    ]);
    expect(FORMULA_LIMITS).toEqual({
      maxSourceLength: 2048,
      maxAstDepth: 32,
      maxFunctionArguments: 64,
    });
  });
});
