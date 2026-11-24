import { describe, expect, it } from "bun:test";
import {
  compileFormulaSet,
  FORMULA_COMPILER_VERSION,
  FORMULA_LANGUAGE,
  readCompiledFormulaArtifact,
  readDerivedOverrides,
} from "../index";

describe("formula runtime artifact", () => {
  it("accepts only the versioned compiler artifact", () => {
    const compiled = compileFormulaSet(
      [
        {
          id: "derived.total",
          kind: "derived",
          targetFieldId: "total",
          source: "=[base] * 2",
          location: { scope: "character" },
        },
      ],
      { character: { base: "number", total: "number" } },
    );
    expect(compiled.success).toBe(true);
    if (!compiled.success) return;

    const artifact = {
      language: FORMULA_LANGUAGE,
      compilerVersion: FORMULA_COMPILER_VERSION,
      programs: compiled.formulas,
      graph: compiled.graph,
      lookups: {
        build: [
          { threshold: 0, value: -2 },
          { threshold: 85, value: 0 },
        ],
      },
    };
    expect(readCompiledFormulaArtifact(artifact)).toEqual(artifact);
    expect(
      readCompiledFormulaArtifact({ ...artifact, compilerVersion: "future" }),
    ).toBeNull();
    expect(
      readCompiledFormulaArtifact({
        ...artifact,
        lookups: { build: [{ threshold: "85", value: 0 }] },
      }),
    ).toBeNull();
  });

  it("keeps only Character-storable primitive overrides", () => {
    expect(
      readDerivedOverrides({
        total: 12,
        label: "custom",
        enabled: true,
        object: { value: 1 },
        missing: null,
      }),
    ).toEqual({ total: 12, label: "custom", enabled: true });
  });
});
