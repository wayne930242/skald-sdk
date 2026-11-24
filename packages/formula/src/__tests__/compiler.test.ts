import { describe, expect, it } from "bun:test";
import {
  compileFormula,
  compileFormulaSet,
  evaluateFormulaLifecycle,
  evaluateFormula,
  type CompiledFormula,
  type FormulaReferenceCatalog,
  type FormulaSourceDefinition,
} from "../index";

const catalog: FormulaReferenceCatalog = {
  character: {
    age: "number",
    dex: "number",
    siz: "number",
    str: "number",
    name: "string",
    mov: "number",
    a: "number",
    b: "number",
    valid: "boolean",
    cthulhuMythos: "number",
  },
  rows: {
    inventory: {
      quantity: "number",
      price: "number",
      total: "number",
    },
  },
  lookups: {
    "age-mov-modifier": "number",
  },
};

function formula(
  overrides: Partial<FormulaSourceDefinition> = {}
): FormulaSourceDefinition {
  return {
    id: "formula.mov",
    kind: "derived",
    targetFieldId: "mov",
    source:
      '=MAX(1, IF(AND([dex] < [siz], [str] < [siz]), 7, 8) + LOOKUP([age], "age-mov-modifier"))',
    location: { scope: "character" },
    ...overrides,
  };
}

describe("skald-excel-v1 compiler", () => {
  it("compiles and deterministically evaluates the migrated MOV formula", () => {
    const compiled = compileFormula(formula(), catalog);
    expect(compiled.success).toBe(true);
    if (!compiled.success) return;

    expect(compiled.formula.dependencies).toEqual([
      { scope: "character", fieldId: "dex" },
      { scope: "character", fieldId: "siz" },
      { scope: "character", fieldId: "str" },
      { scope: "character", fieldId: "age" },
    ]);
    expect(
      evaluateFormula(compiled.formula, {
        character: { dex: 50, siz: 50, str: 50, age: 25 },
        lookups: {
          "age-mov-modifier": [
            { threshold: 0, value: 0 },
            { threshold: 40, value: -1 },
          ],
        },
      })
    ).toEqual({ status: "value", value: 8 });
  });

  it("preserves case-sensitive stable field IDs", () => {
    const compiled = compileFormula(
      formula({ source: "=99 - [cthulhuMythos]" }),
      catalog
    );
    expect(compiled.success).toBe(true);
    if (!compiled.success) return;
    expect(compiled.formula.dependencies).toEqual([
      { scope: "character", fieldId: "cthulhuMythos" },
    ]);
    expect(
      evaluateFormula(compiled.formula, {
        character: { cthulhuMythos: 5 },
      })
    ).toEqual({ status: "value", value: 94 });
  });

  it("compiles List Row references without confusing Character fields", () => {
    const compiled = compileFormula(
      formula({
        id: "inventory.total",
        targetFieldId: "total",
        source: "=[@quantity] * [@price]",
        location: { scope: "list-row", listFieldId: "inventory" },
      }),
      catalog
    );
    expect(compiled.success).toBe(true);
    if (!compiled.success) return;
    expect(
      evaluateFormula(compiled.formula, {
        character: {},
        row: { quantity: 3, price: 12 },
      })
    ).toEqual({ status: "value", value: 36 });
  });

  it("returns structured errors instead of skipping invalid syntax or JavaScript", () => {
    const legacyFloor = compileFormula(
      formula({ source: "=[str] /floor 2" }),
      catalog
    );
    const javascript = compileFormula(
      formula({ source: "=[skills].some(s => s.level >= 5)" }),
      catalog
    );
    expect(legacyFloor).toMatchObject({
      success: false,
      issues: [{ category: "syntax_error" }],
    });
    expect(javascript).toMatchObject({
      success: false,
      issues: [{ category: "syntax_error" }],
    });
  });

  it("reports all formulas with invalid functions and references", () => {
    const result = compileFormulaSet(
      [
        formula({ id: "bad.function", source: "=NOW()" }),
        formula({ id: "bad.reference", source: "=[missing] + 1" }),
      ],
      catalog
    );
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          formulaId: "bad.function",
          category: "function_not_allowed",
        }),
        expect.objectContaining({
          formulaId: "bad.reference",
          category: "reference_not_found",
        }),
      ])
    );
  });

  it("rejects type errors and row references outside a List Row", () => {
    expect(
      compileFormula(formula({ source: "=[name] + 1" }), catalog)
    ).toMatchObject({
      success: false,
      issues: [{ category: "type_mismatch" }],
    });
    expect(
      compileFormula(formula({ source: "=[@quantity]" }), catalog)
    ).toMatchObject({
      success: false,
      issues: [{ category: "reference_scope" }],
    });
  });

  it("requires validation formulas to return boolean", () => {
    expect(
      compileFormula(
        formula({
          id: "validation.age",
          kind: "validation",
          targetFieldId: "valid",
          source: "=[age] + 1",
        }),
        catalog
      )
    ).toMatchObject({
      success: false,
      issues: [{ category: "output_type" }],
    });
  });

  it("does not treat a validation target as a derived dependency producer", () => {
    const result = compileFormulaSet(
      [
        formula({
          id: "validation.age",
          kind: "validation",
          targetFieldId: "age",
          source: "=[age] >= 18",
        }),
      ],
      catalog,
    );
    expect(result).toMatchObject({
      success: true,
      graph: { order: ["validation.age"] },
    });
  });

  it("builds dependency order and rejects complete cycle paths", () => {
    const acyclic = compileFormulaSet(
      [
        formula({ id: "formula.a", targetFieldId: "a", source: "=[b] + 1" }),
        formula({ id: "formula.b", targetFieldId: "b", source: "=1" }),
      ],
      catalog
    );
    expect(acyclic).toMatchObject({
      success: true,
      graph: { order: ["formula.b", "formula.a"] },
    });

    const cyclic = compileFormulaSet(
      [
        formula({ id: "formula.a", targetFieldId: "a", source: "=[b] + 1" }),
        formula({ id: "formula.b", targetFieldId: "b", source: "=[a] + 1" }),
      ],
      catalog
    );
    expect(cyclic).toMatchObject({
      success: false,
      issues: [
        {
          category: "cycle",
          cycle: ["formula.a", "formula.b", "formula.a"],
        },
      ],
    });
  });

  it("reports multiple independent cycles in one compile", () => {
    const expandedCatalog: FormulaReferenceCatalog = {
      ...catalog,
      character: { ...catalog.character, c: "number", d: "number" },
    };
    const result = compileFormulaSet(
      [
        formula({ id: "formula.a", targetFieldId: "a", source: "=[b]" }),
        formula({ id: "formula.b", targetFieldId: "b", source: "=[a]" }),
        formula({ id: "formula.c", targetFieldId: "c", source: "=[d]" }),
        formula({ id: "formula.d", targetFieldId: "d", source: "=[c]" }),
      ],
      expandedCatalog
    );
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.issues.filter((issue) => issue.category === "cycle")).toHaveLength(2);
  });
});

describe("skald-excel-v1 evaluator failures", () => {
  function compiled(source: string): CompiledFormula {
    const result = compileFormula(formula({ source }), catalog);
    if (!result.success) throw new Error(JSON.stringify(result.issues));
    return result.formula;
  }

  it("does not turn a missing reference or divide by zero into 0", () => {
    expect(evaluateFormula(compiled("=[str] + 1"), { character: {} })).toEqual({
      status: "error",
      error: expect.objectContaining({ category: "reference_not_found" }),
    });
    expect(
      evaluateFormula(compiled("=[str] / [age]"), {
        character: { str: 50, age: 0 },
      })
    ).toEqual({
      status: "error",
      error: expect.objectContaining({ category: "divide_by_zero" }),
    });
  });

  it("rejects a compiled artifact for another runtime version", () => {
    const incompatible = {
      ...compiled("=1"),
      compilerVersion: "skald-formula-compiler/v2",
    } as unknown as CompiledFormula;
    expect(evaluateFormula(incompatible, { character: {} })).toEqual({
      status: "error",
      error: expect.objectContaining({ category: "runtime_version" }),
    });
  });

  it("uses explicit deterministic rounding for negative halves", () => {
    expect(evaluateFormula(compiled("=ROUND(-1.5)"), { character: {} })).toEqual({
      status: "value",
      value: -2,
    });
  });

  it("returns an error for non-finite numeric output", () => {
    expect(
      evaluateFormula(compiled("=1e308 * 1e308"), { character: {} })
    ).toEqual({
      status: "error",
      error: expect.objectContaining({ category: "evaluation_error" }),
    });
  });
});

describe("formula lifecycle", () => {
  const lifecycleDefinitions: FormulaSourceDefinition[] = [
    formula({
      id: "formula.default-b",
      kind: "default",
      targetFieldId: "b",
      source: "=10",
    }),
    formula({
      id: "formula.derived-a",
      kind: "derived",
      targetFieldId: "a",
      source: "=[b] * 2",
    }),
    formula({
      id: "formula.valid",
      kind: "validation",
      targetFieldId: "valid",
      source: "=[a] >= 20",
    }),
  ];

  function lifecyclePrograms() {
    const result = compileFormulaSet(lifecycleDefinitions, catalog);
    if (!result.success) throw new Error(JSON.stringify(result.issues));
    return result;
  }

  it("applies defaults once, then evaluates derived and validation formulas", () => {
    const compiled = lifecyclePrograms();
    const result = evaluateFormulaLifecycle(
      compiled.formulas,
      compiled.graph,
      { character: {} },
      {},
      "initialize"
    );

    expect(result).toMatchObject({
      status: "value",
      context: { character: { b: 10, a: 20 } },
      defaultValues: { b: 10 },
      derivedValues: { a: 20 },
      issues: [],
    });
  });

  it("does not rerun defaults during normal runtime evaluation", () => {
    const compiled = lifecyclePrograms();
    const result = evaluateFormulaLifecycle(
      compiled.formulas,
      compiled.graph,
      { character: { b: 5 } },
      {},
      "runtime"
    );

    expect(result.defaultValues).toEqual({});
    expect(result.derivedValues).toEqual({ a: 10 });
    expect(result.issues).toEqual([
      expect.objectContaining({ category: "validation_failed" }),
    ]);
  });

  it("uses compatible overrides and reports incompatible or orphan overrides", () => {
    const compiled = lifecyclePrograms();
    const compatible = evaluateFormulaLifecycle(
      compiled.formulas,
      compiled.graph,
      { character: {} },
      { a: 30 },
      "validate"
    );
    expect(compatible).toMatchObject({
      status: "value",
      derivedValues: { a: 30 },
      issues: [],
    });

    const incompatible = evaluateFormulaLifecycle(
      compiled.formulas,
      compiled.graph,
      { character: { b: 10 } },
      { a: "manual", removed: 1 },
      "validate"
    );
    expect(incompatible.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "override_incompatible",
          targetFieldId: "a",
        }),
        expect.objectContaining({
          category: "override_incompatible",
          targetFieldId: "removed",
        }),
      ])
    );
  });
});
