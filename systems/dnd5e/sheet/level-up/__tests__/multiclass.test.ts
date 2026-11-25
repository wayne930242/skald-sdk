import { beforeAll, describe, expect, it } from "vitest";
import type { LoadedSystem } from "@skald/types/system";
import { loadDnd5e2024Data } from "../../../data-access/builtin-local-data";
import { buildCompendiumRow } from "../../compendium-rows";
import { applyLevelUp, runIds, undoLevelUp, type LevelUpChoices, type LevelUpRowBuilder } from "../apply";
import { gainsOffer } from "../multiclass";
import { levelUpPlan, type ClassInfo, type LevelUpInput, type LevelUpPlan } from "../plan";
import { builtinClassInfo, sheet } from "./class-info";

let buildRow: LevelUpRowBuilder;
const info: Record<string, ClassInfo> = {};

beforeAll(async () => {
  const data = await loadDnd5e2024Data();
  const system = { schema: data.schema, gameData: data.gameData } as unknown as LoadedSystem;
  buildRow = (tab, ref, name) => buildCompendiumRow(tab, ref, name, system, { gameSpells: new Map(), token: String }, true);
  for (const id of ["barbarian", "cleric", "fighter", "monk", "paladin", "rogue", "wizard"]) info[id] = await builtinClassInfo(id);
});

const ok = (result: ReturnType<typeof applyLevelUp>) => {
  if (!result.ok) throw new Error(`level up refused: ${result.reason}`);
  return result;
};
const num = (value: unknown) => (typeof value === "number" ? value : 0);
const rowsOf = (data: Record<string, unknown>, list: string) => (data[list] ?? []) as Array<Record<string, unknown>>;
const refs = (features: ReadonlyArray<{ ref: string }>) => features.map((feature) => feature.ref).sort();
const classesOf = (data: Record<string, unknown>) =>
  new Map([data.classId as string, ...rowsOf(data, "multiclass").map((row) => row.classId as string)].map((id) => [id, info[id] ?? null]));
const plan = (data: Record<string, unknown>, target?: LevelUpInput["target"]): LevelUpPlan =>
  levelUpPlan({ data, classInfo: null, classes: classesOf(data), ...(target ? { target } : {}), nameOf: (ref) => (ref === "item:thieves-tools" ? "Thieves' Tools" : ref) })!;
const average: LevelUpChoices = { hp: { mode: "average" } };
const wizardRow = (level: number, extra: Record<string, unknown> = {}) => ({
  id: "class_w", classId: "wizard", ref: "class:wizard", origin: "srd", name: "Wizard", subclass: "", level, hitDie: 6, hitDiceSpent: 0, spellAbility: "int", ...extra,
});
const fighter = (extra: Record<string, unknown> = {}) => sheet("fighter", 5, { hitDieFaces: 10, str: 15, hpClassAdjust: 0, ...extra });

describe("levelUpPlan / applyLevelUp with several classes (CLASS-IMPL §7.4)", () => {
  it("Fighter 5 adds Wizard: prerequisite INT 13 listed at INT 12; at INT 14 a d6 row, level 6, wizard level 1, slots [2]", () => {
    expect(plan(fighter({ int: 12 }), { kind: "add", classInfo: info.wizard }).prerequisites).toEqual([{ ability: "int", need: 13, have: 12 }]);
    const data = fighter({ int: 14 });
    const offer = plan(data, { kind: "add", classInfo: info.wizard });
    expect(offer).toMatchObject({ fromLevel: 0, toLevel: 1, character: { from: 5, to: 6 }, prerequisites: [], target: { kind: "add", classId: "wizard" }, hp: { faces: 6, average: 4 } });
    expect(refs(offer.features)).toEqual(["classFeature:wizard/arcane-recovery-l1", "classFeature:wizard/ritual-adept-l1", "classFeature:wizard/spellcasting-l1"]);
    expect(offer.gains).toEqual({ known: true, armor: [], weapons: [], skills: null, tools: { grant: [], choice: null } });
    expect(offer.slots).toMatchObject({ before: [0, 0, 0, 0, 0, 0, 0, 0, 0], after: [2, 0, 0, 0, 0, 0, 0, 0, 0], matches: true, changed: true });
    expect(offer.spells).toMatchObject({ cantrips: { before: 0, after: 3 }, prepared: { before: 0, after: 4 }, list: "wizard", castingClass: "wizard" });

    const { after, followUp } = ok(applyLevelUp(data, offer, average, buildRow));
    expect(after).toMatchObject({ level: 6, classId: "fighter", slot1Total: 2, hpClassAdjust: -2, hpMaxMisc: 0 });
    expect(after).not.toHaveProperty("hitDiceMax");
    expect(rowsOf(after, "multiclass")).toEqual([
      { id: expect.stringMatching(/^class_/), classId: "wizard", ref: "class:wizard", origin: "srd", name: "Wizard", subclass: "", level: 1, hitDie: 6, hitDiceSpent: 0, spellAbility: "int" },
    ]);
    expect(rowsOf(after, "features").map((row) => row.ref).sort()).toEqual(refs(offer.features));
    expect(followUp).toEqual({ spells: { list: "wizard", castingClass: "wizard" } });
  });

  it("advances Wizard 1→2 on Fighter 5 / Wizard 1: wizard level 2 features, slots [3], the row level", () => {
    const data = fighter({ level: 6, int: 14, slot1Total: 2, hpClassAdjust: -2, multiclass: [wizardRow(1)] });
    const offer = plan(data, { kind: "advance", classId: "wizard" });
    expect(offer).toMatchObject({ fromLevel: 1, toLevel: 2, character: { from: 6, to: 7 }, target: { kind: "advance", classId: "wizard", rowId: "class_w" } });
    expect(refs(offer.features)).toEqual(["classFeature:wizard/scholar-l2"]);
    expect(offer.slots).toMatchObject({ before: [2, 0, 0, 0, 0, 0, 0, 0, 0], after: [3, 0, 0, 0, 0, 0, 0, 0, 0], matches: true });
    const { after } = ok(applyLevelUp(data, offer, average, buildRow));
    expect(after).toMatchObject({ level: 7, slot1Total: 3, hpClassAdjust: -4 });
    expect(rowsOf(after, "multiclass")[0]).toMatchObject({ level: 2 });
    // The plan went stale once the row moved.
    expect(applyLevelUp({ ...data, multiclass: [wizardRow(2)] }, offer, average, buildRow)).toEqual({ ok: false, reason: "stale" });
  });

  it("advancing the starting class on a single-class sheet reads like L1", () => {
    const data = fighter({ subclass: "Champion" });
    const offer = plan(data);
    expect(offer).toMatchObject({ fromLevel: 5, toLevel: 6, character: { from: 5, to: 6 }, target: { kind: "advance", classId: "fighter" }, slots: null });
    expect(offer.asi?.feature).toBe("classFeature:fighter/ability-score-improvement-l6");
    expect(ok(applyLevelUp(data, offer, average, buildRow)).after).toMatchObject({ level: 6 });
  });

  it("Cleric 3 adds Wizard: caster level 4 → 4/3, the checkbox on when the sheet holds 4/2", () => {
    const data = sheet("cleric", 3, { wis: 13, int: 13, slot1Total: 4, slot2Total: 2 });
    const offer = plan(data, { kind: "add", classInfo: info.wizard });
    expect(offer.slots).toMatchObject({ before: [4, 2, 0, 0, 0, 0, 0, 0, 0], after: [4, 3, 0, 0, 0, 0, 0, 0, 0], matches: true, changed: true });
    expect(plan({ ...data, slot2Total: 3 }, { kind: "add", classInfo: info.wizard }).slots?.matches).toBe(false);
    expect(ok(applyLevelUp(data, offer, average, buildRow)).after).toMatchObject({ slot1Total: 4, slot2Total: 3 });
  });

  it("Paladin 5 + Fighter 4→5: the fighter's Extra Attack starts unchecked", () => {
    const data = sheet("paladin", 9, {
      hitDieFaces: 10,
      features: [{ id: "f_ea", ref: "classFeature:paladin/extra-attack-l5", name: "Extra Attack", level: 5 }],
      multiclass: [{ id: "class_f", classId: "fighter", ref: "class:fighter", origin: "srd", name: "Fighter", subclass: "", level: 4, hitDie: 10, hitDiceSpent: 0, spellAbility: "none" }],
    });
    const offer = plan(data, { kind: "advance", classId: "fighter" });
    expect(offer.extraAttackStacks).toEqual(["classFeature:fighter/extra-attack-l5"]);
    const skipped = ok(applyLevelUp(data, offer, average, buildRow)).after;
    expect(rowsOf(skipped, "features").map((row) => row.ref)).not.toContain("classFeature:fighter/extra-attack-l5");
    expect(rowsOf(skipped, "features").map((row) => row.ref)).toContain("classFeature:fighter/tactical-shift-l5");
    const kept = ok(applyLevelUp(data, offer, { ...average, checked: ["classFeature:fighter/extra-attack-l5"] }, buildRow)).after;
    expect(rowsOf(kept, "features").map((row) => row.ref)).toContain("classFeature:fighter/extra-attack-l5");
    expect(plan(sheet("fighter", 4, { hitDieFaces: 10 })).extraAttackStacks).toEqual([]);
  });

  it("adding Rogue offers 1 skill from the Rogue list, Thieves' Tools and light armor", () => {
    const data = fighter({ dex: 14, stealthProf: "none", athleticsProf: "proficient", armorLight: false });
    const offer = plan(data, { kind: "add", classInfo: info.rogue });
    expect(offer.gains?.armor).toEqual(["armorLight"]);
    expect(offer.gains?.skills?.count).toBe(1);
    expect(offer.gains?.skills?.from).toContain("sleightOfHand");
    expect(offer.gains?.skills?.from).not.toContain("athletics");
    expect(offer.gains?.skills?.from).not.toContain("arcana");
    expect(offer.gains?.tools).toEqual({ grant: [{ ref: "item:thieves-tools", name: "Thieves' Tools" }], choice: null });
    const { after } = ok(applyLevelUp(data, offer, { ...average, gains: { skills: ["stealth"] } }, buildRow));
    expect(after).toMatchObject({ armorLight: true, stealthProf: "proficient" });
    expect(rowsOf(after, "toolProficiencies")).toEqual([expect.objectContaining({ ref: "item:thieves-tools", name: "Thieves' Tools", origin: "srd" })]);
    expect(() => applyLevelUp(data, offer, { ...average, gains: { skills: ["stealth", "acrobatics"] } }, buildRow)).toThrow(RangeError);
    expect(() => applyLevelUp(data, offer, { ...average, gains: { skills: ["arcana"] } }, buildRow)).toThrow(RangeError);
    const off = ok(applyLevelUp(data, offer, { ...average, gains: { off: ["armorLight", "item:thieves-tools"] } }, buildRow)).after;
    expect(off.armorLight).toBe(false);
    expect(rowsOf(off, "toolProficiencies")).toEqual([]);
  });

  it("adding Fighter writes martial weapons and the missing armor only", () => {
    const data = sheet("wizard", 3, { str: 13, armorLight: true, weaponProficiencies: "Simple weapons" });
    const offer = plan(data, { kind: "add", classInfo: info.fighter });
    expect(offer.gains).toMatchObject({ armor: ["armorMedium", "armorShields"], weapons: ["Martial weapons"] });
    expect(ok(applyLevelUp(data, offer, average, buildRow)).after).toMatchObject({ weaponProficiencies: "Simple weapons, Martial weapons", armorMedium: true, armorShields: true });
  });

  it("adding Monk to a Barbarian leaves Unarmored Defense alone and says so", () => {
    const data = sheet("barbarian", 3, { hitDieFaces: 12, str: 13, dex: 13, wis: 13, unarmoredDefense: "barbarian" });
    const offer = plan(data, { kind: "add", classInfo: info.monk });
    expect(offer.unarmoredDefense).toEqual({ value: "monk", settable: false });
    expect(ok(applyLevelUp(data, offer, average, buildRow)).after.unarmoredDefense).toBe("barbarian");
    const fresh = sheet("fighter", 3, { str: 13, dex: 13, wis: 13, unarmoredDefense: "none" });
    const monk = plan(fresh, { kind: "add", classInfo: info.monk });
    expect(monk.unarmoredDefense).toEqual({ value: "monk", settable: true });
    expect(ok(applyLevelUp(fresh, monk, average, buildRow)).after.unarmoredDefense).toBe("monk");
    expect(ok(applyLevelUp(fresh, monk, { ...average, unarmoredDefense: false }, buildRow)).after.unarmoredDefense).toBe("none");
  });

  it("a roll on the d6 row writes its difference from 4 to hpMaxMisc", () => {
    const data = fighter({ level: 6, int: 14, hpMaxMisc: 1, hpClassAdjust: -2, multiclass: [wizardRow(1)] });
    const offer = plan(data, { kind: "advance", classId: "wizard" });
    expect(offer.hp).toEqual({ faces: 6, average: 4 });
    expect(ok(applyLevelUp(data, offer, { hp: { mode: "roll", result: 6 } }, buildRow)).after).toMatchObject({ hpMaxMisc: 3, hpClassAdjust: -4 });
    expect(() => applyLevelUp(data, offer, { hp: { mode: "roll", result: 7 } }, buildRow)).toThrow(RangeError);
  });

  it("a row reaching class level 3 picks its subclass into row.subclass", () => {
    const data = fighter({ level: 7, subclass: "Champion", multiclass: [wizardRow(2)] });
    const offer = plan(data, { kind: "advance", classId: "wizard" });
    expect(offer.subclass.choose).toBe(true);
    expect(offer.subclass.options.map((option) => option.ref)).toContain("subclass:wizard/evoker");
    const { after } = ok(applyLevelUp(data, offer, { ...average, subclass: "subclass:wizard/evoker" }, buildRow));
    expect(after.subclass).toBe("Champion");
    expect(rowsOf(after, "multiclass")[0]).toMatchObject({ level: 3, subclass: "Evoker" });
    // The row's subclass text is what the next level reads.
    const next = plan(after, { kind: "advance", classId: "wizard" });
    expect(next.subclass.known?.ref).toBe("subclass:wizard/evoker");
  });

  it("an unknown starting class can add Wizard; the slots offer is hidden", () => {
    const data = sheet("", 4, { className: "Witch Hunter", hitDieFaces: 10, int: 14 });
    const offer = levelUpPlan({ data, classInfo: null, classes: new Map([["", null]]), target: { kind: "add", classInfo: info.wizard } })!;
    expect(offer).toMatchObject({ slots: null, slotsUnknown: true, prerequisites: [], character: { from: 4, to: 5 } });
    const { after } = ok(applyLevelUp(data, offer, average, buildRow));
    expect(after).toMatchObject({ level: 5, hpClassAdjust: -2 });
    expect(rowsOf(after, "multiclass")[0]).toMatchObject({ classId: "wizard", level: 1 });
    expect(after).not.toHaveProperty("slot1Total");
  });

  it("refuses a sheet whose class levels overflow, and a class added twice", () => {
    const data = fighter({ level: 3, multiclass: [wizardRow(3)] });
    const offer = plan(data);
    expect(offer.issues).toEqual(["overflow"]);
    expect(offer.features).toEqual([]);
    expect(applyLevelUp(data, offer, average, buildRow)).toEqual({ ok: false, reason: "issues" });
    expect(() => plan(fighter({ level: 6, multiclass: [wizardRow(1)] }), { kind: "add", classInfo: info.wizard })).toThrow(RangeError);
  });

  it("undo restores level, gains and hpClassAdjust and removes the added row; an edited row stays with the total level and hpClassAdjust", () => {
    const data = fighter({ dex: 14, armorLight: false, stealthProf: "none", multiclass: [], toolProficiencies: [] });
    const offer = plan(data, { kind: "add", classInfo: info.rogue });
    const { after, undo } = ok(applyLevelUp(data, offer, { ...average, gains: { skills: ["stealth"] } }, buildRow));
    expect(after.hpClassAdjust).toBe(-1);
    expect(undoLevelUp(after, undo)).toEqual({ data, skipped: { fields: [], rows: [] } });

    const row = rowsOf(after, "multiclass")[0];
    const edited = { ...after, multiclass: [{ ...row, hitDiceSpent: 1 }] };
    const { data: restored, skipped } = undoLevelUp(edited, undo);
    expect(restored).toMatchObject({ level: 6, armorLight: false, stealthProf: "none", hpClassAdjust: -1 });
    expect(rowsOf(restored, "multiclass")).toHaveLength(1);
    // The sheet stays consistent: the starting class's level plus the kept row's equals the total.
    expect(num(restored.level) - rowsOf(restored, "multiclass").reduce((sum, r) => sum + num(r.level), 0)).toBe(5);
    expect(skipped).toEqual({ fields: [], rows: [{ list: "multiclass", id: row.id }] });
  });

  it("undo removes an untouched added class row that came back from a save with its keys reordered", () => {
    const data = fighter({ level: 5, int: 14, multiclass: [] });
    const offer = plan(data, { kind: "add", classInfo: info.wizard });
    const { after, undo } = ok(applyLevelUp(data, offer, average, buildRow));
    // A jsonb round trip sorts object keys; the row's values are unchanged.
    const sorted = (row: Record<string, unknown>) => Object.fromEntries(Object.entries(row).sort(([a], [b]) => (a < b ? -1 : 1)));
    const saved = { ...after, multiclass: rowsOf(after, "multiclass").map(sorted) };
    expect(Object.keys(rowsOf(saved, "multiclass")[0])).not.toEqual(Object.keys(rowsOf(after, "multiclass")[0]));
    const { data: restored, skipped } = undoLevelUp(saved, undo);
    expect(skipped).toEqual({ fields: [], rows: [] });
    expect(restored).toMatchObject({ level: 5, multiclass: [] });
  });

  it("one RunIds gives a re-run the same class and tool row ids, so its undo still removes them", () => {
    const data = fighter({ dex: 14, multiclass: [], toolProficiencies: [] });
    const offer = plan(data, { kind: "add", classInfo: info.rogue });
    const ids = runIds();
    const first = ok(applyLevelUp(data, offer, average, buildRow, ids));
    const again = ok(applyLevelUp({ ...data, notes: "remote edit" }, offer, average, buildRow, ids));
    const idsOf = (after: Record<string, unknown>) => [...rowsOf(after, "multiclass"), ...rowsOf(after, "toolProficiencies")].map((row) => row.id);
    expect(idsOf(again.after)).toEqual(idsOf(first.after));
    expect(idsOf(first.after)).toHaveLength(2);
    const { data: restored, skipped } = undoLevelUp(again.after, first.undo);
    expect(rowsOf(restored, "multiclass")).toEqual([]);
    expect(rowsOf(restored, "toolProficiencies")).toEqual([]);
    expect(skipped.fields).toEqual([]);
    expect(skipped.rows.filter((row) => row.list === "multiclass" || row.list === "toolProficiencies")).toEqual([]);
  });

  it("undo of an advance restores the row level, and skips it when edited since", () => {
    const data = fighter({ level: 6, int: 14, slot1Total: 2, hpClassAdjust: -2, multiclass: [wizardRow(1)] });
    const offer = plan(data, { kind: "advance", classId: "wizard" });
    const { after, undo } = ok(applyLevelUp(data, offer, average, buildRow));
    expect(undoLevelUp(after, undo)).toEqual({ data, skipped: { fields: [], rows: [] } });
    const edited = { ...after, multiclass: [{ ...rowsOf(after, "multiclass")[0], level: 4 }] };
    const { data: restored, skipped } = undoLevelUp(edited, undo);
    expect(restored).toMatchObject({ level: 6, slot1Total: 2 });
    expect(rowsOf(restored, "multiclass")[0].level).toBe(4);
    expect(skipped.fields).toEqual(["multiclass.class_w.level"]);
  });

  it("gainsOffer finds martial weapons already on the sheet in either catalog's label", () => {
    const rules = { requires: { abilities: [], mode: "all" as const, score: 13 }, gains: { armor: [], weapons: ["martial" as const], skills: null, tools: null }, known: true };
    // A literal, not the catalog: the public export swaps withheld zh-TW catalogs for their en text.
    const zh = "軍用武器";
    const offer = (weaponProficiencies: string, labels?: string[]) =>
      gainsOffer({ weaponProficiencies }, rules, { martialWeaponsLabel: "Martial weapons", ...(labels ? { martialWeaponsLabels: labels } : {}) }).weapons;
    expect(offer(`簡易武器, ${zh}`, ["Martial weapons", zh])).toEqual([]);
    expect(offer(`簡易武器, ${zh}`)).toEqual(["Martial weapons"]);
    expect(offer("Simple weapons, martial weapons")).toEqual([]);
  });
});
