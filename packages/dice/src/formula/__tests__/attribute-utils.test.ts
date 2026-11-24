import { describe, it, expect } from "vitest";
import {
  hasAttributeReference,
  findAttributeReferences,
  validateAttributeReferences,
} from "../attribute-utils";

describe("hasAttributeReference", () => {
  it("returns true for expression with attribute reference", () => {
    expect(hasAttributeReference("1d100<={{@dex}}")).toBe(true);
  });

  it("returns true for expression with multiple references", () => {
    expect(hasAttributeReference("{{@str}}+{{@siz}}")).toBe(true);
  });

  it("returns false for expression without attribute reference", () => {
    expect(hasAttributeReference("1d6+5")).toBe(false);
  });

  it("returns false for macro reference (not attribute)", () => {
    expect(hasAttributeReference("{{#str}}")).toBe(false);
  });

  it("handles complex formulas", () => {
    expect(hasAttributeReference("coc7:1d100<={{@dex /floor 2}}")).toBe(true);
  });
});

describe("findAttributeReferences", () => {
  it("finds single attribute", () => {
    expect(findAttributeReferences("1d100<={{@dex}}")).toEqual(["dex"]);
  });

  it("finds multiple attributes", () => {
    const refs = findAttributeReferences("{{@str}}+{{@siz}}");
    expect(refs).toContain("str");
    expect(refs).toContain("siz");
    expect(refs).toHaveLength(2);
  });

  it("returns empty array for no references", () => {
    expect(findAttributeReferences("1d6+5")).toEqual([]);
  });

  it("handles complex formulas with operators", () => {
    const refs = findAttributeReferences("{{@str + @siz}}");
    expect(refs).toContain("str");
    expect(refs).toContain("siz");
  });

  it("deduplicates repeated attributes", () => {
    const refs = findAttributeReferences("{{@str}}+{{@str}}");
    expect(refs).toEqual(["str"]);
  });
});

describe("validateAttributeReferences", () => {
  it("returns valid when all attributes present in context", () => {
    const result = validateAttributeReferences("1d100<={{@dex}}", { dex: 50 });
    expect(result.valid).toBe(true);
    expect(result.missingAttributes).toEqual([]);
  });

  it("returns invalid with missing attributes", () => {
    const result = validateAttributeReferences("{{@str}}+{{@dex}}", { str: 50 });
    expect(result.valid).toBe(false);
    expect(result.missingAttributes).toEqual(["dex"]);
  });

  it("returns invalid when context is empty and has references", () => {
    const result = validateAttributeReferences("1d100<={{@dex}}", {});
    expect(result.valid).toBe(false);
    expect(result.missingAttributes).toEqual(["dex"]);
  });

  it("returns valid for expression without references", () => {
    const result = validateAttributeReferences("1d6+5", {});
    expect(result.valid).toBe(true);
    expect(result.missingAttributes).toEqual([]);
  });

  it("returns valid when context is undefined and no references", () => {
    const result = validateAttributeReferences("1d6+5", undefined);
    expect(result.valid).toBe(true);
  });

  it("returns invalid when context is undefined and has references", () => {
    const result = validateAttributeReferences("1d100<={{@dex}}", undefined);
    expect(result.valid).toBe(false);
    expect(result.missingAttributes).toEqual(["dex"]);
  });
});
