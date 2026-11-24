import { describe, it, expect } from "vitest";
import { parseDiceExpression, validateDiceExpression } from "../parser";

describe("parseDiceExpression", () => {
  it("parses simple die notation: 1D6", () => {
    const result = parseDiceExpression("1D6");
    expect(result).toEqual({
      dice: [{ count: 1, sides: 6 }],
      modifier: 0,
      multiplier: 1,
    });
  });

  it("parses multiple dice: 3D6", () => {
    const result = parseDiceExpression("3D6");
    expect(result).toEqual({
      dice: [{ count: 3, sides: 6 }],
      modifier: 0,
      multiplier: 1,
    });
  });

  it("parses dice with modifier: 2D6+6", () => {
    const result = parseDiceExpression("2D6+6");
    expect(result).toEqual({
      dice: [{ count: 2, sides: 6 }],
      modifier: 6,
      multiplier: 1,
    });
  });

  it("parses dice with multiplier: 3D6×5", () => {
    const result = parseDiceExpression("3D6×5");
    expect(result).toEqual({
      dice: [{ count: 3, sides: 6 }],
      modifier: 0,
      multiplier: 5,
    });
  });

  it("parses complex expression: (2D6+6)×5", () => {
    const result = parseDiceExpression("(2D6+6)×5");
    expect(result).toEqual({
      dice: [{ count: 2, sides: 6 }],
      modifier: 6,
      multiplier: 5,
    });
  });

  it("parses D100", () => {
    const result = parseDiceExpression("D100");
    expect(result).toEqual({
      dice: [{ count: 1, sides: 100 }],
      modifier: 0,
      multiplier: 1,
    });
  });

  it("parses 1D6+13 with multiplier: (1D6+13)×5", () => {
    const result = parseDiceExpression("(1D6+13)×5");
    expect(result).toEqual({
      dice: [{ count: 1, sides: 6 }],
      modifier: 13,
      multiplier: 5,
    });
  });

  it("handles lowercase: 3d6", () => {
    const result = parseDiceExpression("3d6");
    expect(result).toEqual({
      dice: [{ count: 3, sides: 6 }],
      modifier: 0,
      multiplier: 1,
    });
  });

  it("handles x as multiplier: 3D6x5", () => {
    const result = parseDiceExpression("3D6x5");
    expect(result).toEqual({
      dice: [{ count: 3, sides: 6 }],
      modifier: 0,
      multiplier: 5,
    });
  });

  it("handles * as multiplier: 3D6*5", () => {
    const result = parseDiceExpression("3D6*5");
    expect(result).toEqual({
      dice: [{ count: 3, sides: 6 }],
      modifier: 0,
      multiplier: 5,
    });
  });

  it("returns null for invalid expression", () => {
    const result = parseDiceExpression("invalid");
    expect(result).toBeNull();
  });

  it("parses multiple dice groups: 2d4+1d6", () => {
    const result = parseDiceExpression("2d4+1d6");
    expect(result).toEqual({
      dice: [
        { count: 2, sides: 4 },
        { count: 1, sides: 6 },
      ],
      modifier: 0,
      multiplier: 1,
    });
  });

  it("parses multiple dice groups with modifier: 1d20+2d6+5", () => {
    const result = parseDiceExpression("1d20+2d6+5");
    expect(result).toEqual({
      dice: [
        { count: 1, sides: 20 },
        { count: 2, sides: 6 },
      ],
      modifier: 5,
      multiplier: 1,
    });
  });

  it("parses multiple dice groups with negative modifier: 2d8+1d4-2", () => {
    const result = parseDiceExpression("2d8+1d4-2");
    expect(result).toEqual({
      dice: [
        { count: 2, sides: 8 },
        { count: 1, sides: 4 },
      ],
      modifier: -2,
      multiplier: 1,
    });
  });

  it("handles spaces in expression: 2d4 + 1d6", () => {
    const result = parseDiceExpression("2d4 + 1d6");
    expect(result).toEqual({
      dice: [
        { count: 2, sides: 4 },
        { count: 1, sides: 6 },
      ],
      modifier: 0,
      multiplier: 1,
    });
  });

  it("marks a subtracted dice group with sign: 2d6-1d4", () => {
    const result = parseDiceExpression("2d6-1d4");
    expect(result).toEqual({
      dice: [
        { count: 2, sides: 6 },
        { count: 1, sides: 4, sign: -1 },
      ],
      modifier: 0,
      multiplier: 1,
    });
  });
});

describe("parseDiceExpression - Fudge dice", () => {
  it("should parse 4dF", () => {
    const result = parseDiceExpression("4dF");
    expect(result).toEqual({
      dice: [{ count: 4, sides: "F" }],
      modifier: 0,
      multiplier: 1,
    });
  });

  it("should parse dF (implied 1dF)", () => {
    const result = parseDiceExpression("dF");
    expect(result).toEqual({
      dice: [{ count: 1, sides: "F" }],
      modifier: 0,
      multiplier: 1,
    });
  });

  it("should parse 4dF+2", () => {
    const result = parseDiceExpression("4dF+2");
    expect(result).toEqual({
      dice: [{ count: 4, sides: "F" }],
      modifier: 2,
      multiplier: 1,
    });
  });

  it("should parse 4dF-2 (negative modifier)", () => {
    const result = parseDiceExpression("4dF-2");
    expect(result).toEqual({
      dice: [{ count: 4, sides: "F" }],
      modifier: -2,
      multiplier: 1,
    });
  });

  it("should parse lowercase 4df", () => {
    const result = parseDiceExpression("4df");
    expect(result).toEqual({
      dice: [{ count: 4, sides: "F" }],
      modifier: 0,
      multiplier: 1,
    });
  });

  it("should parse mixed Fudge and regular dice: 4dF+1d6", () => {
    const result = parseDiceExpression("4dF+1d6");
    expect(result).toEqual({
      dice: [
        { count: 4, sides: "F" },
        { count: 1, sides: 6 },
      ],
      modifier: 0,
      multiplier: 1,
    });
  });

  it("should parse 2dF with larger count", () => {
    const result = parseDiceExpression("2dF");
    expect(result).toEqual({
      dice: [{ count: 2, sides: "F" }],
      modifier: 0,
      multiplier: 1,
    });
  });
});

describe("validateDiceExpression - attribute/macro references", () => {
  it("accepts an attribute reference: 1d100+{{@dex}}", () => {
    const result = validateDiceExpression("1d100+{{@dex}}");
    expect(result.valid).toBe(true);
  });

  it("accepts real CoC7e attribute names containing letters outside kh/kl/dh/dl/x", () => {
    for (const attr of ["str", "con", "siz", "dex", "app", "edu", "pow"]) {
      const result = validateDiceExpression(`1d100+{{@${attr}}}`);
      expect(result.valid).toBe(true);
    }
  });

  it("accepts a macro shorthand: #DEX", () => {
    const result = validateDiceExpression("#DEX");
    expect(result.valid).toBe(true);
  });

  it("accepts a macro reference: {{#dex}}", () => {
    const result = validateDiceExpression("{{#dex}}");
    expect(result.valid).toBe(true);
  });

  it("still rejects genuinely invalid characters outside {{...}}", () => {
    const result = validateDiceExpression("1d100+xyz");
    expect(result.valid).toBe(false);
  });
});
