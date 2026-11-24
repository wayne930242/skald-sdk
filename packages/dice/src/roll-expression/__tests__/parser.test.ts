// @skald/dice roll-expression/__tests__/parser.test.ts
import { describe, it, expect } from "vitest";
import { parseRollExpression } from "../parser";

describe("parseRollExpression", () => {
  it("parses simple dice expression: 2d6", () => {
    const result = parseRollExpression("2d6");
    expect(result).toEqual({
      diceExpr: "2d6",
    });
  });

  it("parses dice with formula modifier: 2d6+{{@damage_bonus}}", () => {
    const result = parseRollExpression("2d6+{{@damage_bonus}}");
    expect(result).toEqual({
      diceExpr: "2d6+{{@damage_bonus}}",
    });
  });

  it("parses comparison expression: 1d100<={{@dex}}", () => {
    const result = parseRollExpression("1d100<={{@dex}}");
    expect(result).toEqual({
      diceExpr: "1d100",
      comparator: "<=",
      targetFormula: "{{@dex}}",
    });
  });

  it("parses coc7 system prefix: coc7:1d100<={{@dex}}", () => {
    const result = parseRollExpression("coc7:1d100<={{@dex}}");
    expect(result).toEqual({
      system: "coc7",
      diceExpr: "1d100",
      comparator: "<=",
      targetFormula: "{{@dex}}",
    });
  });

  it("parses complex formula: coc7:1d100<={{@dex /floor 5}}", () => {
    const result = parseRollExpression("coc7:1d100<={{@dex /floor 5}}");
    expect(result).toEqual({
      system: "coc7",
      diceExpr: "1d100",
      comparator: "<=",
      targetFormula: "{{@dex /floor 5}}",
    });
  });

  it("parses >= comparator: 1d20>={{@target}}", () => {
    const result = parseRollExpression("1d20>={{@target}}");
    expect(result).toEqual({
      diceExpr: "1d20",
      comparator: ">=",
      targetFormula: "{{@target}}",
    });
  });

  it("parses = comparator: 1d6={{@lucky_number}}", () => {
    const result = parseRollExpression("1d6={{@lucky_number}}");
    expect(result).toEqual({
      diceExpr: "1d6",
      comparator: "=",
      targetFormula: "{{@lucky_number}}",
    });
  });

  it("handles case insensitive system prefix: COC7:1d100<={{@str}}", () => {
    const result = parseRollExpression("COC7:1d100<={{@str}}");
    expect(result).toEqual({
      system: "coc7",
      diceExpr: "1d100",
      comparator: "<=",
      targetFormula: "{{@str}}",
    });
  });

  it("returns null for invalid expression", () => {
    const result = parseRollExpression("");
    expect(result).toBeNull();
  });
});

describe("parseRollExpression - fate system", () => {
  it("parses fate system prefix: fate:4dF+{{@skill}}", () => {
    const result = parseRollExpression("fate:4dF+{{@skill}}");
    expect(result).toEqual({
      system: "fate",
      diceExpr: "4dF+{{@skill}}",
    });
  });

  it("parses fate with numeric target: fate:4dF+{{@skill}}>=2", () => {
    const result = parseRollExpression("fate:4dF+{{@skill}}>=2");
    expect(result).toEqual({
      system: "fate",
      diceExpr: "4dF+{{@skill}}",
      comparator: ">=",
      targetFormula: "2",
    });
  });
});
