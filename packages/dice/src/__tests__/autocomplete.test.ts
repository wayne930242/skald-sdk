import { describe, it, expect } from "vitest";
import { detectAutocompleteTrigger } from "../autocomplete";

const FIELDS = [
  { id: "str", label: "力量" },
  { id: "str_half", label: "力量(半)" },
  { id: "san_current", label: "SAN 值" },
];

const MACROS = [{ id: "coc", label: "技能檢定" }];

describe("detectAutocompleteTrigger", () => {
  it("returns null when there is no trigger before the cursor", () => {
    expect(detectAutocompleteTrigger("1d100", 5, FIELDS, MACROS)).toBeNull();
  });

  it("returns null once the reference is already closed", () => {
    expect(
      detectAutocompleteTrigger("1d100<={{@str}}", 15, FIELDS, MACROS),
    ).toBeNull();
  });

  it("detects an empty {{@ trigger and lists all fields", () => {
    const result = detectAutocompleteTrigger("1d100<={{@", 11, FIELDS, MACROS);
    expect(result).not.toBeNull();
    expect(result!.kind).toBe("field");
    expect(result!.start).toBe(11);
    expect(result!.results.map((r) => r.id)).toEqual([
      "str",
      "str_half",
      "san_current",
    ]);
  });

  it("filters field suggestions by the partial query", () => {
    const text = "1d100<={{@str_";
    const result = detectAutocompleteTrigger(text, text.length, FIELDS, MACROS);
    expect(result).not.toBeNull();
    expect(result!.kind).toBe("field");
    expect(result!.results.map((r) => r.id)).toEqual(["str_half"]);
    expect(result!.start).toBe(text.length - "str_".length);
  });

  it("detects a {{# trigger against the macro list", () => {
    const text = "{{#co";
    const result = detectAutocompleteTrigger(text, text.length, FIELDS, MACROS);
    expect(result).not.toBeNull();
    expect(result!.kind).toBe("macro");
    expect(result!.results.map((r) => r.id)).toEqual(["coc"]);
  });

  it("returns null when the query matches nothing", () => {
    const text = "{{@nonexistent";
    expect(
      detectAutocompleteTrigger(text, text.length, FIELDS, MACROS),
    ).toBeNull();
  });

  it("returns null when no source list is provided", () => {
    const text = "{{@st";
    expect(detectAutocompleteTrigger(text, text.length, undefined, undefined)).toBeNull();
  });

  it("only looks at text before the cursor, not the full string (web's DOM-cursor case)", () => {
    const text = "{{@strtrailing garbage}}";
    const cursor = "{{@str".length;
    const result = detectAutocompleteTrigger(text, cursor, FIELDS, MACROS);
    expect(result).not.toBeNull();
    expect(result!.results.map((r) => r.id)).toEqual(["str", "str_half"]);
  });

  it("treats the whole string as the cursor for Discord's autocomplete case", () => {
    const text = "coc7:1d100<={{@san_cur";
    const result = detectAutocompleteTrigger(text, text.length, FIELDS, MACROS);
    expect(result).not.toBeNull();
    expect(result!.results.map((r) => r.id)).toEqual(["san_current"]);
  });

  it("respects a custom result limit", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ id: `field_${i}` }));
    const text = "{{@field_";
    const result = detectAutocompleteTrigger(text, text.length, many, undefined, 3);
    expect(result!.results).toHaveLength(3);
  });
});
