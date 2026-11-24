import { describe, expect, it } from "bun:test";
import {
  compileFormula,
  compileFormulaSet,
  evaluateFormula,
  evaluateFormulaLifecycle,
  type FormulaReferenceCatalog,
  type FormulaSourceDefinition,
} from "../index";

const catalog: FormulaReferenceCatalog = {
  character: { x: "number" },
  rows: { items: { qty: "number" } },
  lookups: { t: "number" },
};

function def(source: string, extra: Partial<FormulaSourceDefinition> = {}): FormulaSourceDefinition {
  return {
    id: "f",
    kind: "derived",
    targetFieldId: "x",
    source,
    location: { scope: "character" },
    ...extra,
  };
}

function issueCodes(result: ReturnType<typeof compileFormula>): string[] {
  return result.success ? [] : result.issues.map((i) => i.category);
}

describe("prototype-chain names are unknown", () => {
  for (const name of ["constructor", "__proto__", "toString", "hasOwnProperty"]) {
    it(`rejects [${name}] at compile time`, () => {
      const r = compileFormula(def(`=[${name}] = [${name}]`, { targetFieldId: "x" }), catalog);
      expect(r.success).toBe(false);
      expect(issueCodes(r)).toContain("reference_not_found");
    });
  }

  it("rejects Character.constructor", () => {
    const r = compileFormula(def("=[Character.constructor]"), catalog);
    expect(r.success).toBe(false);
  });

  it("rejects a row field named constructor", () => {
    const r = compileFormula(
      def("=[@constructor]", { location: { scope: "list-row", listFieldId: "items" } }),
      catalog
    );
    expect(r.success).toBe(false);
    expect(issueCodes(r)).toContain("reference_not_found");
  });

  it("rejects a list named constructor", () => {
    const r = compileFormula(
      def("=[@qty]", { location: { scope: "list-row", listFieldId: "constructor" } }),
      catalog
    );
    expect(r.success).toBe(false);
  });

  it('rejects LOOKUP(x, "constructor") at compile time', () => {
    const r = compileFormula(def('=LOOKUP([x], "constructor")'), catalog);
    expect(r.success).toBe(false);
    expect(issueCodes(r)).toContain("lookup_not_found");
  });

  it("evaluator returns an error result, never throws, for inherited names", () => {
    const ok = compileFormula(def('=LOOKUP([x], "t")'), catalog);
    expect(ok.success).toBe(true);
    if (!ok.success) return;
    const lookupResult = evaluateFormula(
      { ...ok.formula, expression: JSON.parse(JSON.stringify(ok.formula.expression).replace('"t"', '"constructor"')) } as typeof ok.formula,
      { character: { x: 1 }, lookups: {} }
    );
    expect(lookupResult.status).not.toBe("value");

    const ref = compileFormula(def("=[x]"), catalog);
    expect(ref.success).toBe(true);
    if (!ref.success) return;
    const refResult = evaluateFormula(
      JSON.parse(JSON.stringify(ref.formula).replace(/"fieldId":"x"/g, '"fieldId":"constructor"')),
      { character: {} }
    );
    expect(refResult.status).not.toBe("value");
  });
});

describe("lifecycle defaults on a prototype-named field", () => {
  it("applies the default to a field named constructor at initialize", () => {
    const set = compileFormulaSet(
      [def("=7", { id: "d", kind: "default", targetFieldId: "constructor" })],
      { character: { constructor: "number" } } as FormulaReferenceCatalog
    );
    if (!set.success) throw new Error(JSON.stringify(set.issues));
    const result = evaluateFormulaLifecycle(set.formulas, set.graph, { character: {} }, {}, "initialize");
    expect(result.defaultValues).toEqual({ constructor: 7 });
  });
});
