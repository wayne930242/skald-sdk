import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  COC7E_ATTRIBUTE_FORMULAS,
  PULP_CORE_CHAR_FORMULA,
  rollAttribute,
  rollAllAttributes,
  rollPulpCoreChar,
} from "../attributes";

describe("COC7E_ATTRIBUTE_FORMULAS", () => {
  it("has formulas for all 8 main attributes", () => {
    const ids = COC7E_ATTRIBUTE_FORMULAS.map((f) => f.id);
    expect(ids).toContain("str");
    expect(ids).toContain("con");
    expect(ids).toContain("siz");
    expect(ids).toContain("dex");
    expect(ids).toContain("app");
    expect(ids).toContain("int");
    expect(ids).toContain("pow");
    expect(ids).toContain("edu");
  });

  it("uses 3D6×5 for STR, CON, DEX, APP, POW", () => {
    const attrs = ["str", "con", "dex", "app", "pow"];
    for (const id of attrs) {
      const formula = COC7E_ATTRIBUTE_FORMULAS.find((f) => f.id === id);
      expect(formula?.formula).toBe("3D6×5");
    }
  });

  it("uses (2D6+6)×5 for SIZ, INT, EDU", () => {
    const attrs = ["siz", "int", "edu"];
    for (const id of attrs) {
      const formula = COC7E_ATTRIBUTE_FORMULAS.find((f) => f.id === id);
      expect(formula?.formula).toBe("(2D6+6)×5");
    }
  });
});

describe("PULP_CORE_CHAR_FORMULA", () => {
  it("uses (1D6+13)×5 formula", () => {
    expect(PULP_CORE_CHAR_FORMULA.formula).toBe("(1D6+13)×5");
  });

  it("has correct id and label", () => {
    expect(PULP_CORE_CHAR_FORMULA.id).toBe("pulp_core");
    expect(PULP_CORE_CHAR_FORMULA.label).toBe("Core");
  });
});

describe("rollAttribute", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("rolls STR with 3D6×5 formula", () => {
    const mockRandom = vi
      .spyOn(Math, "random")
      .mockReturnValueOnce(0.5) // 4
      .mockReturnValueOnce(0.5) // 4
      .mockReturnValueOnce(0.5); // 4

    const result = rollAttribute("str");
    expect(result).not.toBeNull();
    expect(result!.attribute.id).toBe("str");
    expect(result!.finalValue).toBe(60); // (4+4+4) × 5

    mockRandom.mockRestore();
  });

  it("rolls SIZ with (2D6+6)×5 formula", () => {
    const mockRandom = vi
      .spyOn(Math, "random")
      .mockReturnValueOnce(0.5) // 4
      .mockReturnValueOnce(0.5); // 4

    const result = rollAttribute("siz");
    expect(result).not.toBeNull();
    expect(result!.attribute.id).toBe("siz");
    expect(result!.finalValue).toBe(70); // (4+4+6) × 5

    mockRandom.mockRestore();
  });

  it("returns null for unknown attribute", () => {
    const result = rollAttribute("unknown");
    expect(result).toBeNull();
  });

  it("includes dice roll details in result", () => {
    vi.spyOn(Math, "random")
      .mockReturnValueOnce(0.0) // 1
      .mockReturnValueOnce(0.5) // 4
      .mockReturnValueOnce(0.99); // 6

    const result = rollAttribute("con");
    expect(result).not.toBeNull();
    expect(result!.diceResult.dice[0].rolls).toEqual([1, 4, 6]);
    expect(result!.diceResult.dice[0].subtotal).toBe(11);
    expect(result!.finalValue).toBe(55); // 11 × 5
  });
});

describe("rollAllAttributes", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns results for all 8 attributes", () => {
    const results = rollAllAttributes();
    expect(results).toHaveLength(8);

    const ids = results.map((r) => r.attribute.id);
    expect(ids).toContain("str");
    expect(ids).toContain("con");
    expect(ids).toContain("siz");
    expect(ids).toContain("dex");
    expect(ids).toContain("app");
    expect(ids).toContain("int");
    expect(ids).toContain("pow");
    expect(ids).toContain("edu");
  });

  it("each result has valid final value", () => {
    const results = rollAllAttributes();
    for (const result of results) {
      // 3D6×5: min=15 (3×5), max=90 (18×5)
      // (2D6+6)×5: min=40 (8×5), max=90 (18×5)
      expect(result.finalValue).toBeGreaterThanOrEqual(15);
      expect(result.finalValue).toBeLessThanOrEqual(90);
    }
  });
});

describe("rollPulpCoreChar", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("rolls with (1D6+13)×5 formula", () => {
    vi.spyOn(Math, "random").mockReturnValueOnce(0.5); // 4

    const result = rollPulpCoreChar();
    expect(result).not.toBeNull();
    expect(result!.attribute.id).toBe("pulp_core");
    expect(result!.finalValue).toBe(85); // (4+13) × 5
  });

  it("produces values in expected range", () => {
    // (1D6+13)×5: min=70 (14×5), max=95 (19×5)
    for (let i = 0; i < 20; i++) {
      const result = rollPulpCoreChar();
      expect(result).not.toBeNull();
      expect(result!.finalValue).toBeGreaterThanOrEqual(70);
      expect(result!.finalValue).toBeLessThanOrEqual(95);
    }
  });
});
