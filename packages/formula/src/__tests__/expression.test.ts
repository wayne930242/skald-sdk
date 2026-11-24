import { describe, expect, it } from "bun:test";
import {
  compileFormula,
  compileFormulaExpression,
  evaluateFormula,
  FORMULA_COMPILER_VERSION,
  FORMULA_LANGUAGE,
  type FormulaReferenceCatalog,
} from "../index";

const catalog: FormulaReferenceCatalog = {
  character: { edu: "number", int: "number", isPulp: "boolean", result: "number" },
  lookups: { "age-edu": "number" },
};

describe("compileFormulaExpression", () => {
  it("compiles a target-less formula to the same IR as a Template Formula", () => {
    const source = "=[edu] + [int] - IF([isPulp], 10, 0)";
    const expression = compileFormulaExpression("pool", source, catalog);
    const formula = compileFormula(
      {
        id: "pool",
        kind: "derived",
        targetFieldId: "result",
        source,
        location: { scope: "character" },
      },
      catalog,
    );
    if (!expression.success || !formula.success) throw new Error("compile failed");
    expect(expression.formula).toEqual({
      language: FORMULA_LANGUAGE,
      compilerVersion: FORMULA_COMPILER_VERSION,
      formulaId: "pool",
      resultType: "number",
      dependencies: formula.formula.dependencies,
      expression: formula.formula.expression,
    });
    expect(
      evaluateFormula(expression.formula, {
        character: { edu: 60, int: 70, isPulp: true },
      }),
    ).toEqual({ status: "value", value: 120 });
  });

  it("reports the result type instead of checking it against a target", () => {
    const compiled = compileFormulaExpression("when", "=[edu] >= 40", catalog);
    expect(compiled.success && compiled.formula.resultType).toBe("boolean");
  });

  it("keeps the language's reference, function and lookup rules", () => {
    const categories = (source: string) => {
      const compiled = compileFormulaExpression("f", source, catalog);
      return compiled.success ? [] : compiled.issues.map((issue) => issue.category);
    };
    expect(categories("=[nope] + 1")).toEqual(["reference_not_found"]);
    expect(categories("=RAND()")).toEqual(["function_not_allowed"]);
    expect(categories('=LOOKUP([edu], "missing")')).toEqual(["lookup_not_found"]);
    expect(categories("=[@edu]")).toEqual(["reference_scope"]);
    expect(categories("[edu]")).toEqual(["syntax_error"]);
  });
});
