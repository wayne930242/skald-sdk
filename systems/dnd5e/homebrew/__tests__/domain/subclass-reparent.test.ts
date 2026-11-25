// @vitest-environment node
import { expect, it } from "vitest";
import { keepsAll, moveTo, planMove, restored, stashOf, type SubclassForm, type SubclassParent } from "../../domain/subclass";
import { sampleForm, subclassContext } from "./subclass-fixtures";

const fighter = subclassContext("fighter").parent;
const paladin = subclassContext("paladin").parent;
const draft = (): SubclassForm => ({
  ...sampleForm(),
  spellcasting: { ability: "int", list: "wizard", cantrips: [], prepared: [{ level: 3, value: 2 }], textEn: "Study.", textZh: "" },
  spells: [
    { level: 3, refs: ["spell:shield"] },
    { level: 19, refs: ["spell:fly"] },
  ],
  features: [
    { level: 3, nameEn: "Flare", nameZh: "", textEn: "Light.", textZh: "" },
    { level: 10, nameEn: "Glow", nameZh: "", textEn: "More light.", textZh: "" },
  ],
});

it("lists what a move to a class that does not fit would remove or move, without touching the draft", () => {
  const before = draft();
  const move = moveTo(before, paladin);
  expect(before).toEqual(draft());
  expect(keepsAll(move.changes)).toBe(false);
  expect(move.changes.casting).toBe(true);
  // A half caster lists spells at 3, 5, 9, 13 and 17: the level 19 row goes.
  expect(move.changes.spells).toEqual([{ level: 19, refs: ["spell:fly"] }]);
  expect(move.changes.features.map(({ from, to, feature }) => [feature.nameEn, from, to])).toEqual([["Glow", 10, 3]]);
  expect(move.form).toMatchObject({ parent: "paladin", spellcasting: null, spells: [{ level: 3, refs: ["spell:shield"] }] });
  expect(move.form.features.map((f) => f.level)).toEqual([3, 3]);
});

it("gives back what a confirmed move took when a later parent fits it again", () => {
  const source = draft();
  const away = moveTo(source, paladin);
  const stash = stashOf(source, away.changes);
  // The author edits a kept feature after the move; that edit stays.
  const edited = { ...away.form, features: [{ ...away.form.features[0], textEn: "Brighter." }, away.form.features[1]] };
  const back = moveTo(restored(edited, stash), fighter);
  expect(keepsAll(back.changes)).toBe(true);
  expect(back.form.spellcasting).toEqual(source.spellcasting);
  expect(back.form.spells).toEqual(source.spells);
  expect(back.form.features.map((f) => [f.nameEn, f.level, f.textEn])).toEqual([
    ["Flare", 3, "Brighter."],
    ["Glow", 10, "More light."],
  ]);
});

it("moves at once when everything fits, and keeps everything while no parent is chosen", () => {
  const rogue: SubclassParent = { ...fighter, id: "rogue" };
  expect(keepsAll(moveTo(draft(), rogue).changes)).toBe(true);
  const none = moveTo(draft(), undefined);
  expect(keepsAll(none.changes)).toBe(true);
  expect(none.form).toEqual({ ...draft(), parent: "" });
});

it("asks only about what the draft still has: a part an earlier move took is not listed again", () => {
  const away = planMove(draft(), undefined, paladin);
  expect(away.changes.casting).toBe(true);
  const barbarian: SubclassParent = { ...paladin, id: "barbarian", caster: "half", subclassLevels: [3, 6, 10, 14] };
  const next = planMove(away.form, away.stash, barbarian);
  expect(keepsAll(next.changes)).toBe(true);
  // The level 10 feature fits the barbarian again; the casting still waits in the stash.
  expect(next.form.features.map((f) => f.level)).toEqual([3, 10]);
  expect(next.form.spellcasting).toBeNull();
  expect(next.stash?.spellcasting).toEqual(draft().spellcasting);
  expect(planMove(next.form, next.stash, fighter).form.spellcasting).toEqual(draft().spellcasting);
});

it("gives a moved feature its level back after the author edits it (F008)", () => {
  const away = planMove(draft(), undefined, paladin);
  // Editing replaces the feature object, as the editor does.
  const edited = { ...away.form, features: away.form.features.map((f) => (f.nameEn === "Glow" ? { ...f, textEn: "Edited." } : f)) };
  const back = planMove(edited, away.stash, fighter);
  expect(back.form.features.map((f) => [f.nameEn, f.level, f.textEn])).toEqual([
    ["Flare", 3, "Light."],
    ["Glow", 10, "Edited."],
  ]);
});
