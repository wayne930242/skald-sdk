// packages/dice/src/macro/body-parser.test.ts
import { describe, it, expect } from "vitest";
import { parseMacroBody, MacroParseError } from "./body-parser";

describe("parseMacroBody", () => {
  it("parses a simple return roll(...) body", () => {
    const body = parseMacroBody('return roll("coc7:1d100{{bonusPenalty}}<={{attr}}");');
    expect(body).toHaveLength(1);
    expect(body[0]).toEqual({
      kind: "return",
      value: { kind: "roll", template: "coc7:1d100{{bonusPenalty}}<={{attr}}" },
    });
  });

  it("parses a bare roll(...) statement followed by return", () => {
    const body = parseMacroBody('roll("1d100<={{attr}}"); return @rolled;');
    expect(body).toHaveLength(2);
    expect(body[0].kind).toBe("roll");
    expect(body[1].kind).toBe("return");
  });

  it("parses if/elif/else with nested blocks", () => {
    const body = parseMacroBody(`
      roll("1d100<={{attr}}");
      if (@rolled == 1) {
        return 'critical';
      } elif (@rolled <= @target) {
        return 'regular';
      } else {
        return 'failure';
      }
    `);
    expect(body).toHaveLength(2);
    const ifStmt = body[1];
    if (ifStmt.kind !== "if") throw new Error("expected if statement");
    expect(ifStmt.branches).toHaveLength(2);
    expect(ifStmt.elseBody).toBeDefined();
  });

  it("parses static and dynamic field writes", () => {
    const body = parseMacroBody(`
      @hp := @hp - 1;
      @(if(@rolled <= 50, 'low_flag', 'high_flag')) := 1;
    `);
    expect(body).toHaveLength(2);
    expect(body[0]).toMatchObject({ kind: "assign", target: { kind: "static", field: "hp" } });
    expect(body[1]).toMatchObject({ kind: "assign", target: { kind: "dynamic" } });
  });

  it("rejects a for loop at parse time", () => {
    expect(() => parseMacroBody('for (@i := 0) { return @i; }')).toThrow(MacroParseError);
  });

  it("rejects a while loop at parse time", () => {
    expect(() => parseMacroBody('while (@rolled < 100) { return @rolled; }')).toThrow(
      MacroParseError,
    );
  });

  it("rejects switch/case at parse time", () => {
    expect(() => parseMacroBody('switch (@rolled) { return @rolled; }')).toThrow(
      MacroParseError,
    );
  });

  it("rejects a macro-to-macro reference at parse time", () => {
    expect(() => parseMacroBody('return roll("{{#other}}");')).toThrow(MacroParseError);
    expect(() => parseMacroBody('return roll("{{#other[@x]}}");')).toThrow(MacroParseError);
  });

  it("rejects malformed syntax", () => {
    expect(() => parseMacroBody("this is not valid;")).toThrow(MacroParseError);
    expect(() => parseMacroBody("if (@rolled == 1 { return 1; }")).toThrow();
  });
});
