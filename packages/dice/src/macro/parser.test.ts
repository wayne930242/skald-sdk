// @skald/dice macro/parser.test.ts
import { describe, it, expect } from "vitest";
import {
  parseMacroReference,
  hasMacroReference,
  normalizeRollInput,
} from "./parser";

describe("parseMacroReference", () => {
  it("should detect macro reference {{#str}}", () => {
    expect(hasMacroReference("{{#str}}")).toBe(true);
  });

  it("should not detect attribute reference {{@str}}", () => {
    expect(hasMacroReference("{{@str}}")).toBe(false);
  });

  it("should extract macro id from {{#str}}", () => {
    const result = parseMacroReference("{{#str}}");
    expect(result).toEqual({ macroId: "str", args: [], raw: "{{#str}}" });
  });

  it("should extract macro id with underscores {{#skill_athletics}}", () => {
    const result = parseMacroReference("{{#skill_athletics}}");
    expect(result).toEqual({
      macroId: "skill_athletics",
      args: [],
      raw: "{{#skill_athletics}}",
    });
  });

  it("should extract macro id with arguments {{#coc[@str, 1]}}", () => {
    const result = parseMacroReference("{{#coc[@str, 1]}}");
    expect(result?.macroId).toBe("coc");
    expect(result?.args).toHaveLength(2);
    expect(result?.args[0]).toEqual({ type: "attr", name: "str" });
    expect(result?.args[1]).toEqual({ type: "number", value: 1 });
  });

  it("should return null for non-macro strings", () => {
    expect(parseMacroReference("1d100")).toBeNull();
    expect(parseMacroReference("{{@dex}}")).toBeNull();
  });

  it("should find macro in mixed expression", () => {
    expect(hasMacroReference("Roll: {{#str}} for strength")).toBe(true);
  });

  it("should normalize shorthand macro input", () => {
    expect(normalizeRollInput("#DEX")).toBe("{{#DEX}}");
    expect(hasMacroReference("#DEX")).toBe(true);
    expect(parseMacroReference("#DEX")).toEqual({
      macroId: "DEX",
      args: [],
      raw: "{{#DEX}}",
    });
  });
});
