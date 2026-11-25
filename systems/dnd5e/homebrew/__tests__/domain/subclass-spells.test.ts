// @vitest-environment node
import { expect, it } from "vitest";
import { maxSpellLevel, spellListOf, spellProblems, type SpellInfo, type SubclassForm } from "../../domain/subclass";
import { sampleForm, subclassContext } from "./subclass-fixtures";

const info: Record<string, SpellInfo> = {
  "spell:shield": { level: 1, classes: ["wizard"] },
  "spell:fireball": { level: 3, classes: ["wizard"] },
  "spell:fire-bolt": { level: 0, classes: ["wizard"] },
};
const third = (): NonNullable<SubclassForm["spellcasting"]> => ({ ability: "int", list: "wizard", cantrips: [], prepared: [], textEn: "", textZh: "" });

it("caps each row at the level the class can cast, the derived third-caster table for a third caster", () => {
  const fighter = subclassContext("fighter").parent;
  const paladin = subclassContext("paladin").parent;
  const cleric = subclassContext("cleric").parent;
  expect([3, 7, 13, 19].map((l) => maxSpellLevel({ spellcasting: third() }, fighter, l))).toEqual([1, 2, 3, 4]);
  expect([3, 5, 9, 13, 17].map((l) => maxSpellLevel({ spellcasting: null }, paladin, l))).toEqual([1, 2, 3, 4, 5]);
  expect([3, 5, 7, 9].map((l) => maxSpellLevel({ spellcasting: null }, cleric, l))).toEqual([2, 3, 4, 5]);
  expect(spellListOf({ spellcasting: third() }, fighter)).toBe("wizard");
});

it("refuses a spell above the castable level and a cantrip, with the reason", () => {
  const form: SubclassForm = {
    ...sampleForm(),
    spellcasting: third(),
    spells: [
      { level: 3, refs: ["spell:shield", "spell:fireball", "spell:fire-bolt", "spell:unknown"] },
      { level: 13, refs: ["spell:fireball"] },
    ],
  };
  expect(spellProblems(form, subclassContext("fighter").parent, (ref) => info[ref])).toEqual([
    { level: 3, ref: "spell:fireball", reason: "tooHigh", spellLevel: 3, max: 1 },
    { level: 3, ref: "spell:fire-bolt", reason: "cantrip", spellLevel: 0, max: 1 },
  ]);
});
