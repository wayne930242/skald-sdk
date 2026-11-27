import { beforeAll, describe, expect, it } from "vitest";
import type { LoadedSystem } from "@skald/types/system";
import { loadDnd5e2024Data } from "../../../data-access/builtin-local-data";
import { zhWithheld } from "../../../__tests__/zh-withheld";
import { createBuiltinSource } from "../../../reference/sources";
import { buildCompendiumRow } from "../../compendium-rows";
import { loadClass } from "../load-class";
import { applyLevelUp, type LevelUpChoices, type LevelUpRowBuilder } from "../apply";
import { choiceOf, taglineOf } from "../options";
import { levelUpPlan, offeredFeatures, type ClassInfo, type LevelUpPlan } from "../plan";
import { builtinClassInfo, sheet } from "./class-info";

/** Features that are a choice among options (UAT M4): a radio group, only the picked option added. */

let buildRow: LevelUpRowBuilder;
const info: Record<string, ClassInfo> = {};

beforeAll(async () => {
  const data = await loadDnd5e2024Data();
  const system = { schema: data.schema, gameData: data.gameData } as unknown as LoadedSystem;
  buildRow = (tab, ref, name) => buildCompendiumRow(tab, ref, name, system, { gameSpells: new Map(), token: String }, true);
  for (const id of ["cleric", "fighter", "paladin", "ranger", "wizard"]) info[id] = await builtinClassInfo(id);
});

const ok = (result: ReturnType<typeof applyLevelUp>) => {
  if (!result.ok) throw new Error(`level up refused: ${result.reason}`);
  return result;
};
const rows = (data: Record<string, unknown>, list: string) => ((data[list] ?? []) as Array<Record<string, unknown>>);
const refsOf = (data: Record<string, unknown>, list: string) => rows(data, list).map((row) => row.ref).sort();
const average: LevelUpChoices = { hp: { mode: "average" } };
const add = (data: Record<string, unknown>, classInfo: ClassInfo): LevelUpPlan =>
  levelUpPlan({ data, classInfo: null, classes: new Map([[data.classId as string, info[data.classId as string] ?? null]]), target: { kind: "add", classInfo } })!;

describe("choiceOf", () => {
  it("reads an options block of class features, a Fighting Style feat and options named in the text", () => {
    expect(choiceOf(["Pick one.", { type: "entries", entries: [{ type: "options", count: 1, entries: [
      { type: "refClassFeature", classFeature: "Protector|Cleric|XPHB|1|XPHB" },
      { type: "refClassFeature", classFeature: "Thaumaturge|Cleric|XPHB|1|XPHB" },
    ] }] }])).toEqual({ kind: "feature", options: [{ name: "Protector", level: 1 }, { name: "Thaumaturge", level: 1 }] });
    expect(choiceOf(["Take any {@filter style|feats|category=FS} you like."])).toEqual({ kind: "feat", category: "fightingStyle" });
    expect(choiceOf(["Pick one of the following options of your choice now.", { type: "entries", entries: [
      { type: "entries", name: "Colossus Slayer", entries: ["…"] }, { type: "entries", name: "Horde Breaker", entries: ["…"] },
    ] }])).toEqual({ kind: "named", options: ["Colossus Slayer", "Horde Breaker"], block: 1 });
    // A Fighting Style feat or the option the feature names instead (Ranger, Paladin: UAT F006).
    expect(choiceOf(["Take any {@filter style|feats|category=FS} you like, or take the option below.", { type: "entries", entries: [
      { type: "entries", name: "Made-up Warrior", entries: ["…"] },
    ] }])).toEqual({ kind: "feat", category: "fightingStyle", alternatives: { options: ["Made-up Warrior"], block: 1 } });
    // A feature that lists benefits it all gives is no choice; nor are many optional features (invocations).
    expect(choiceOf(["All of these apply.", { type: "entries", entries: [{ type: "entries", name: "A", entries: [] }, { type: "entries", name: "B", entries: [] }] }])).toBeNull();
    expect(choiceOf([{ type: "options", count: 2, entries: [{ type: "refOptionalfeature", optionalfeature: "Careful Spell|XPHB" }] }])).toBeNull();
  });

  it("reads a subclass's tagline as plain text", () => {
    expect(taglineOf(["{@i Protect Nature and People from Destruction}", "You stalk prey…"])).toBe("Protect Nature and People from Destruction");
    expect(taglineOf(["You stalk prey…"])).toBeUndefined();
  });
});

describe("choice features in the level-up offer", () => {
  it("adding Cleric offers Divine Order with Protector or Thaumaturge, never both; only the pick is added", () => {
    const data = sheet("wizard", 3, { hitDieFaces: 6, int: 13, wis: 13 });
    const offer = add(data, info.cleric);
    const features = offeredFeatures(offer);
    const refs = features.map((feature) => feature.ref);
    expect(refs).toContain("classFeature:cleric/divine-order-l1");
    expect(refs).not.toContain("classFeature:cleric/protector-l1");
    expect(refs).not.toContain("classFeature:cleric/thaumaturge-l1");
    const order = features.find((feature) => feature.ref === "classFeature:cleric/divine-order-l1")!;
    expect(order.choice).toMatchObject({ kind: "feature", options: [{ ref: "classFeature:cleric/protector-l1" }, { ref: "classFeature:cleric/thaumaturge-l1" }] });

    const later = ok(applyLevelUp(data, offer, average, buildRow)).after;
    expect(refsOf(later, "features")).toEqual(["classFeature:cleric/divine-order-l1", "classFeature:cleric/spellcasting-l1"]);
    const picked = ok(applyLevelUp(data, offer, { ...average, options: { "classFeature:cleric/divine-order-l1": { ref: "classFeature:cleric/protector-l1", name: "Protector" } } }, buildRow)).after;
    expect(refsOf(picked, "features")).toEqual(["classFeature:cleric/divine-order-l1", "classFeature:cleric/protector-l1", "classFeature:cleric/spellcasting-l1"]);
    expect(() => applyLevelUp(data, offer, { ...average, options: { "classFeature:cleric/divine-order-l1": { ref: "classFeature:cleric/spellcasting-l1", name: "x" } } }, buildRow)).toThrow(RangeError);
  });

  it("adding Fighter offers a Fighting Style feat or 稍後在資料庫選 (the feats tab after apply)", () => {
    const data = sheet("wizard", 3, { hitDieFaces: 6, str: 13 });
    const offer = add(data, info.fighter);
    expect(offeredFeatures(offer).find((feature) => feature.ref === "classFeature:fighter/fighting-style-l1")?.choice).toEqual({ kind: "feat", category: "fightingStyle" });
    const later = ok(applyLevelUp(data, offer, average, buildRow));
    expect(rows(later.after, "feats")).toEqual([]);
    expect(later.followUp.feats).toBe("fightingStyle");
    const picked = ok(applyLevelUp(data, offer, { ...average, options: { "classFeature:fighter/fighting-style-l1": { ref: "feat:defense", name: "Defense" } } }, buildRow));
    expect(rows(picked.after, "feats")).toEqual([expect.objectContaining({ ref: "feat:defense", name: "Defense" })]);
    expect(picked.followUp.feats).toBeUndefined();
  });

  it.each([
    ["ranger", "Druidic Warrior"],
    ["paladin", "Blessed Warrior"],
  ])("%s 1→2 offers a Fighting Style feat or %s; each pick writes its own row (UAT F006)", (classId, alternative) => {
    const data = sheet(classId, 1, { hitDieFaces: 10, slot1Total: 2 });
    const ref = `classFeature:${classId}/fighting-style-l2`;
    const offer = levelUpPlan({ data, classInfo: info[classId] })!;
    expect(offeredFeatures(offer).find((feature) => feature.ref === ref)?.choice).toEqual({
      kind: "feat", category: "fightingStyle", alternatives: { options: [alternative], ids: [alternative], block: 1 },
    });

    const instead = ok(applyLevelUp(data, offer, { ...average, options: { [ref]: { name: alternative } } }, buildRow));
    expect(rows(instead.after, "features").find((row) => row.ref === ref)).toMatchObject({ name: `Fighting Style: ${alternative}`, option: alternative, optionName: alternative });
    expect(rows(instead.after, "feats")).toEqual([]);
    expect(instead.followUp.feats).toBeUndefined();

    const feat = ok(applyLevelUp(data, offer, { ...average, options: { [ref]: { ref: "feat:defense", name: "Defense" } } }, buildRow));
    expect(rows(feat.after, "feats")).toEqual([expect.objectContaining({ ref: "feat:defense" })]);
    expect(rows(feat.after, "features").find((row) => row.ref === ref)).not.toHaveProperty("option");
    expect(ok(applyLevelUp(data, offer, average, buildRow)).followUp.feats).toBe("fightingStyle");
    expect(() => applyLevelUp(data, offer, { ...average, options: { [ref]: { name: "Not an option" } } }, buildRow)).toThrow(RangeError);
  });

  it.for([
    ["ranger", "Druidic Warrior", "德魯伊戰士"],
    ["paladin", "Blessed Warrior", "受祝戰士"],
  ] as const)("%s: a pack feat reference does not hide the built-in Fighting Style option's zh label", async ([classId, english, zh], { skip }) => {
    skip(zhWithheld(`corpus/zh-TW/classFeature-${classId}.json`), "zh-TW text withheld");
    const ref = `classFeature:${classId}/fighting-style-l2`;
    // The XPHB overlay refers to a feat instead of repeating the SRD's named option.
    const sources = createBuiltinSource(new Map(), { [ref]: {
      source: "XPHB", en: { entries: ["Choose a style.", { type: "entries", entries: [{ type: "refFeat", feat: `${english}|XPHB` }] }] },
    } });
    const loaded = await loadClass({ classId, sources, nameOf: String, locale: "zh-TW", packs: null });
    const style = loaded?.info.features.find((feature) => feature.ref === ref);
    expect(style?.choice).toMatchObject({ kind: "feat", alternatives: { ids: [english], options: [zh] } });
  });

  it("Hunter's Prey offers its two options; the pick joins the row name", () => {
    const data = sheet("ranger", 2, { hitDieFaces: 10 });
    const offer = levelUpPlan({ data, classInfo: info.ranger })!;
    const prey = offeredFeatures(offer, "subclass:ranger/hunter").find((feature) => feature.ref === "subclassFeature:ranger/hunter/hunters-prey-l3")!;
    expect(prey.choice).toEqual({ kind: "named", options: ["Colossus Slayer", "Horde Breaker"], ids: ["Colossus Slayer", "Horde Breaker"], block: 1 });
    const { after } = ok(applyLevelUp(data, offer, {
      ...average,
      subclass: "subclass:ranger/hunter",
      options: { [prey.ref]: { name: "Horde Breaker" } },
      optionRowName: (feature, option) => `${feature} (${option})`,
    }, buildRow));
    // The pick is also on the row as fields (UAT F005): the sheet names a built-in row from the catalog.
    expect(rows(after, "features").find((row) => row.ref === prey.ref)).toMatchObject({ name: "Hunter's Prey (Horde Breaker)", option: "Horde Breaker", optionName: "Horde Breaker" });
    expect(offer.subclass.options.find((option) => option.ref === "subclass:ranger/hunter")?.summary).toBe("Protect Nature and People from Destruction");
  });

  it("a localized pick keeps the English option as the row's stable id (UAT F005)", async () => {
    const data = sheet("ranger", 2, { hitDieFaces: 10 });
    // Its own copy: the loader localizes the options in place.
    const offer = levelUpPlan({ data, classInfo: await builtinClassInfo("ranger") })!;
    const prey = offeredFeatures(offer, "subclass:ranger/hunter").find((feature) => feature.ref === "subclassFeature:ranger/hunter/hunters-prey-l3")!;
    // As the loader localizes it: the option names change, the ids stay.
    if (prey.choice?.kind === "named") prey.choice = { ...prey.choice, options: ["Slayer (local)", "Breaker (local)"] };
    const { after } = ok(applyLevelUp(data, offer, { ...average, subclass: "subclass:ranger/hunter", options: { [prey.ref]: { name: "Slayer (local)" } } }, buildRow));
    expect(rows(after, "features").find((row) => row.ref === prey.ref)).toMatchObject({ option: "Colossus Slayer", optionName: "Slayer (local)" });
  });
});
