import { describe, expect, it } from "vitest";
import {
  castingOf,
  classDerivedPatch,
  classIssues,
  classLine,
  hitDicePools,
  hpClassAdjust,
  sheetClasses,
  spendHitDie,
} from "../class-model";
import { hitDice, longRestPatch, spendHitDie as spendSingle } from "../play-model";

const wizardRow = {
  id: "class-1", classId: "wizard", ref: "class:wizard", name: "Wizard", subclass: "",
  level: 2, hitDie: 6, hitDiceSpent: 0, spellAbility: "int",
};

/** Fighter 7 total: Fighter 5 (d10) + Wizard 2 (d6), CON 14, INT 14. */
const fighterWizard = {
  className: "Fighter", classId: "fighter", subclass: "Champion", level: 7, hitDieFaces: 10, hitDiceSpent: 0,
  hitDiceMax: 7, con: 14, int: 14, hp: { current: 10 }, hpMax: 56, multiclass: [wizardRow],
};

const labels = { separator: " / ", level: (n: number) => String(n) };

describe("sheetClasses", () => {
  it("derives the starting class's level from the total", () => {
    const [start, wizard] = sheetClasses(fighterWizard);
    expect(start).toMatchObject({ classId: "fighter", ref: "class:fighter", level: 5, hitDie: 10, start: true });
    expect(start.rowId).toBeUndefined();
    expect(wizard).toMatchObject({ classId: "wizard", level: 2, hitDie: 6, spellAbility: "int", start: false, rowId: "class-1" });
  });

  it("reads a sheet without multiclass as one class", () => {
    expect(sheetClasses({ className: "Bard", classId: "bard", level: 3, hitDieFaces: 8 })).toEqual([
      expect.objectContaining({ level: 3, start: true }),
    ]);
  });
});

describe("hit points", () => {
  it("hpClassAdjust counts the other dice's average difference", () => {
    expect(hpClassAdjust(fighterWizard)).toBe(-4);
    expect(classDerivedPatch(fighterWizard)).toEqual({ hpClassAdjust: -4 });
    expect(classDerivedPatch({ ...fighterWizard, hpClassAdjust: -4 })).toEqual({});
    expect(classDerivedPatch({ level: 3 })).toEqual({});
  });
});

describe("hit dice pools", () => {
  it("groups by die, starting die first", () => {
    expect(hitDicePools(fighterWizard).map(({ faces, left, max }) => ({ faces, left, max }))).toEqual([
      { faces: 10, left: 5, max: 5 },
      { faces: 6, left: 2, max: 2 },
    ]);
  });

  it("spends a d6 from the row until none are left; a long rest returns them", () => {
    let values: Record<string, unknown> = fighterWizard;
    for (let spend = 0; spend < 2; spend += 1) {
      const patch = spendHitDie(values, 6, 3);
      expect(patch).not.toBeNull();
      values = { ...values, ...patch };
    }
    expect((values.multiclass as Array<{ hitDiceSpent: number }>)[0].hitDiceSpent).toBe(2);
    expect(values.hitDiceSpent).toBe(0);
    expect(spendHitDie(values, 6, 3)).toBeNull();
    const rest = longRestPatch(values);
    expect(rest.hitDiceSpent).toBe(0);
    expect((rest.multiclass as Array<{ hitDiceSpent: number }>)[0].hitDiceSpent).toBe(0);
  });

  it("spends the starting class's die through the single-class API", () => {
    const patch = spendSingle(fighterWizard, 4);
    expect(patch).toMatchObject({ hitDiceSpent: 1, hp: { current: 14 } });
    expect(hitDice(fighterWizard)).toEqual({ faces: 10, max: 5, left: 5 });
  });

  it("an overridden hitDiceMax keeps one pool", () => {
    const pools = hitDicePools({ ...fighterWizard, hitDiceMax: 9 });
    expect(pools).toHaveLength(1);
    expect(pools[0]).toMatchObject({ faces: 10, max: 9, left: 9 });
  });

  it("a single-class sheet reads as before", () => {
    expect(hitDicePools({ level: 4, hitDiceMax: 4, hitDieFaces: 8, hitDiceSpent: 1 })).toEqual([
      { faces: 8, max: 4, left: 3, sources: [{ max: 4, spent: 1 }] },
    ]);
    expect(longRestPatch({ level: 4 })).not.toHaveProperty("multiclass");
  });
});

describe("classIssues", () => {
  it("flags each broken invariant", () => {
    expect(classIssues(fighterWizard)).toEqual([]);
    expect(classIssues({ ...fighterWizard, level: 2 })).toEqual(["overflow"]);
    expect(classIssues({ ...fighterWizard, multiclass: [wizardRow, { ...wizardRow, id: "class-2", level: 1 }] })).toEqual(["duplicate"]);
    expect(classIssues({ ...fighterWizard, multiclass: [{ ...wizardRow, classId: "fighter" }] })).toEqual(["startClass"]);
    expect(classIssues({ ...fighterWizard, multiclass: [{ ...wizardRow, level: 0 }] })).toEqual(["rowLevel"]);
    expect(classIssues({ level: 1 })).toEqual([]);
  });
});

describe("classLine", () => {
  it("joins classes with their levels", () => {
    expect(classLine({ ...fighterWizard, subclass: "" }, labels)).toBe("Fighter 5 / Wizard 2");
    expect(classLine(fighterWizard, labels)).toBe("Fighter 5 · Champion / Wizard 2");
    expect(classLine({ className: "Bard", subclass: "Lore", level: 3 }, labels)).toBe("Bard · Lore");
  });
});

describe("castingOf", () => {
  it("a row casts with its own ability and the total proficiency", () => {
    expect(castingOf(fighterWizard, "wizard")).toEqual({ ability: "int", mod: 2, dc: 13, attack: 5 });
    expect(castingOf(fighterWizard, "cleric")).toBeNull();
  });

  it('"" reads the sheet\'s spellcasting fields, overrides kept', () => {
    expect(castingOf({ spellAbility: "wis", spellMod: 3, spellSaveDc: 15, spellAttack: 7 }, "")).toEqual({ ability: "wis", mod: 3, dc: 15, attack: 7 });
    expect(castingOf({ spellAbility: "none" }, "")).toBeNull();
  });
});
