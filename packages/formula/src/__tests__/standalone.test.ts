import { describe, expect, it } from "bun:test";
import { evaluateFormulaSource } from "../standalone";

describe("evaluateFormulaSource", () => {
  it("uses the shared compiler and evaluator for transitional built-in formulas", () => {
    expect(
      evaluateFormulaSource({
        formulaId: "occupation.detective",
        source: "=[edu] * 2 + MAX([dex], [str]) * 2",
        resultType: "number",
        character: { edu: 60, dex: 50, str: 40 },
      }),
    ).toEqual({ status: "value", value: 220 });
  });

  it("returns a structured error instead of silently substituting zero", () => {
    expect(
      evaluateFormulaSource({
        formulaId: "occupation.invalid",
        source: "{{@edu * 4}}",
        resultType: "number",
        character: { edu: 60 },
      }),
    ).toMatchObject({
      status: "error",
      error: { category: "syntax_error", formulaId: "occupation.invalid" },
    });
  });
});
