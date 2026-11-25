import { beforeAll, describe, expect, it } from "vitest";
import type { LoadedSystem } from "@skald/types/system";
import { PackTextIndex } from "../../../content-pack/domain/overlay";
import { loadDnd5e2024Data } from "../../../data-access/builtin-local-data";
import { buildCompendiumRow } from "../../compendium-rows";
import { applyLevelUp, asiScores, undoLevelUp, type LevelUpRowBuilder } from "../apply";
import { classInfoOf, levelUpPlan, type LevelUpPlan } from "../plan";
import { builtinClassInfo, sheet } from "./class-info";

let system: LoadedSystem;
let buildRow: LevelUpRowBuilder;
const context = { gameSpells: new Map(), token: String };

beforeAll(async () => {
  const data = await loadDnd5e2024Data();
  system = { schema: data.schema, gameData: data.gameData } as unknown as LoadedSystem;
  buildRow = (tab, ref, name) => buildCompendiumRow(tab, ref, name, system, context, true);
});

const ok = (result: ReturnType<typeof applyLevelUp>) => {
  if (!result.ok) throw new Error(`level up refused: ${result.reason}`);
  return result;
};
const rowsOf = (data: Record<string, unknown>, list: string) => data[list] as Array<Record<string, unknown>>;
const DEVOTION = "subclass:paladin/oath-of-devotion";

async function paladin(): Promise<{ data: Record<string, unknown>; plan: LevelUpPlan }> {
  const data = sheet("paladin", 2, { hitDieFaces: 10, slot1Total: 2, slot1Used: 1, features: [{ id: "feature_old", level: 2, name: "Fighting Style", ref: "classFeature:paladin/fighting-style-l2" }] });
  return { data, plan: levelUpPlan({ data, classInfo: await builtinClassInfo("paladin") })! };
}

describe("applyLevelUp (phase 2b §4.3)", () => {
  it("writes the whole level up as one new data object", async () => {
    const { data, plan } = await paladin();
    const before = structuredClone(data);
    const { after, followUp } = ok(applyLevelUp(data, plan, { hp: { mode: "average" }, subclass: DEVOTION }, buildRow));
    expect(data).toEqual(before);
    expect(after).toMatchObject({ level: 3, subclass: "Oath of Devotion", slot1Total: 3, slot1Used: 1, hpMaxMisc: 0 });
    const added = rowsOf(after, "features").slice(1);
    expect(added.map((row) => row.ref)).toEqual([
      "classFeature:paladin/channel-divinity-l3",
      "classFeature:paladin/divine-sense-l3",
      "subclassFeature:paladin/oath-of-devotion/oath-of-devotion-l3",
      "subclassFeature:paladin/oath-of-devotion/oath-of-devotion-spells-l3",
      "subclassFeature:paladin/oath-of-devotion/sacred-weapon-l3",
    ]);
    expect(added.every((row) => row.level === 3 && row.origin === "srd")).toBe(true);
    expect(followUp).toEqual({ spells: { list: "paladin" } });
  });

  it("「稍後再選」 keeps the placeholder row and the subclass text; unchecked features and off slots are not written", async () => {
    const { data, plan } = await paladin();
    const { after } = ok(applyLevelUp(data, plan, {
      hp: { mode: "average" },
      subclass: null,
      unchecked: ["classFeature:paladin/divine-sense-l3"],
      slots: false,
    }, buildRow));
    expect(after.subclass).toBe("");
    expect(after.slot1Total).toBe(2);
    expect(rowsOf(after, "features").map((row) => row.ref)).toEqual([
      "classFeature:paladin/fighting-style-l2",
      "classFeature:paladin/channel-divinity-l3",
      "classFeature:paladin/paladin-subclass-l3",
    ]);
  });

  it("undo restores only the fields still holding what it wrote and removes the rows it added", async () => {
    const { data, plan } = await paladin();
    const { after, undo } = ok(applyLevelUp(data, plan, { hp: { mode: "roll", result: 9 }, subclass: DEVOTION }, buildRow));
    expect(undoLevelUp(after, undo)).toEqual({ data, skipped: { fields: [], rows: [] } });

    // Edited since: the slot total stays, a removed row is reported, the rest goes back.
    const removed = rowsOf(after, "features")[1];
    const edited = { ...after, slot1Total: 5, features: rowsOf(after, "features").filter((row) => row !== removed) };
    const { data: restored, skipped } = undoLevelUp(edited, undo);
    expect(restored).toMatchObject({ level: 2, subclass: "", hpMaxMisc: 0, slot1Total: 5 });
    expect(rowsOf(restored, "features").map((row) => row.id)).toEqual(["feature_old"]);
    expect(skipped).toEqual({ fields: ["slot1Total"], rows: [{ list: "features", id: removed.id }] });
  });

  it("drops a field undo created when the sheet had none", async () => {
    const { plan } = await paladin();
    const data = sheet("paladin", 2, { hitDieFaces: 10, slot1Total: 2 });
    delete data.hpMaxMisc;
    const { after, undo } = ok(applyLevelUp(data, plan, { hp: { mode: "roll", result: 2 } }, buildRow));
    expect(after.hpMaxMisc).toBe(-4);
    expect(undoLevelUp(after, undo).data).not.toHaveProperty("hpMaxMisc");
  });

  it("stores a rolled hit point result as its difference from the average in hpMaxMisc", async () => {
    const info = await builtinClassInfo("fighter");
    const data = sheet("fighter", 5, { hitDieFaces: 10, hpMaxMisc: 2 });
    const plan = levelUpPlan({ data, classInfo: info })!;
    expect(ok(applyLevelUp(data, plan, { hp: { mode: "roll", result: 9 } }, buildRow)).after.hpMaxMisc).toBe(5);
    expect(ok(applyLevelUp(data, plan, { hp: { mode: "roll", result: 6 } }, buildRow)).after.hpMaxMisc).toBe(2);
    expect(ok(applyLevelUp(data, plan, { hp: { mode: "average" } }, buildRow)).after.hpMaxMisc).toBe(2);
    expect(() => applyLevelUp(data, plan, { hp: { mode: "roll", result: 11 } }, buildRow)).toThrow(RangeError);
  });

  it("raises ability scores capped at 20 and adds the ASI feat row", async () => {
    const info = await builtinClassInfo("fighter");
    const data = sheet("fighter", 5, { str: 19, con: 14 });
    const plan = levelUpPlan({ data, classInfo: info, asiFeatName: "Ability Score Improvement" })!;
    const { after, undo, followUp } = ok(applyLevelUp(data, plan, { hp: { mode: "average" }, asi: { kind: "abilities", increases: { str: 2 } } }, buildRow));
    expect(after.str).toBe(20);
    expect(rowsOf(after, "feats")).toEqual([expect.objectContaining({ ref: "feat:ability-score-improvement", category: "general", origin: "srd" })]);
    expect(followUp).toEqual({});
    expect(undoLevelUp(after, undo).data).toEqual(data);

    const split = ok(applyLevelUp(data, plan, { hp: { mode: "average" }, asi: { kind: "abilities", increases: { str: 1, con: 1 } } }, buildRow)).after;
    expect(split).toMatchObject({ str: 20, con: 15 });
    expect(asiScores({ str: 22, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }, { str: 2 })).toEqual({ str: 22 });
    for (const increases of [{ str: 3 }, { str: 1 }, { str: 1, dex: 1, con: 1 }, { str: 2, dex: 1 }, { str: 0.5, dex: 1.5 }]) {
      expect(() => applyLevelUp(data, plan, { hp: { mode: "average" }, asi: { kind: "abilities", increases } }, buildRow)).toThrow(RangeError);
    }
    const feat = ok(applyLevelUp(data, plan, { hp: { mode: "average" }, asi: { kind: "feat" } }, buildRow));
    expect(feat.after.str).toBe(19);
    expect(feat.after.feats).toEqual([]);
    expect(feat.followUp).toEqual({ feats: "general" });
  });

  it("writes pact slots and leaves level slots alone for a warlock", async () => {
    const data = sheet("warlock", 1, { pactSlots: 1, pactSlotLevel: 1 });
    const plan = levelUpPlan({ data, classInfo: await builtinClassInfo("warlock") })!;
    const { after, undo } = ok(applyLevelUp(data, plan, { hp: { mode: "average" } }, buildRow));
    expect(after).toMatchObject({ level: 2, pactSlots: 2, pactSlotLevel: 1 });
    expect(after).not.toHaveProperty("slot1Total");
    expect(undo.fields.map((field) => field.field)).toEqual(["level", "pactSlots"]);
  });

  it("refuses a stale plan and the 200 KB copied text cap", async () => {
    const { data, plan } = await paladin();
    expect(applyLevelUp({ ...data, level: 3 }, plan, { hp: { mode: "average" } }, buildRow)).toEqual({ ok: false, reason: "stale" });

    const ref = "classFeature:ash-warden/ash-mark-l2";
    const info = classInfoOf({ id: "ash-warden", blocks: null, entries: [{ ref, name: "Ash Mark" }] });
    const packText = new PackTextIndex({ entries: [{ ref, id: "ash-warden/ash-mark-l2", kind: "classFeature", name: "Ash Mark", entries: ["Mark a foe with ash."], meta: { level: 2 } }], overlays: {}, wizard: {}, zhTW: {} }, "en");
    const packContext = { ...context, packRefs: new Set([ref]), packText, homebrewOf: () => ({ pack: "p", item: "i", rev: 1 }) };
    const homebrewRow: LevelUpRowBuilder = (tab, entryRef, name) => buildCompendiumRow(tab, entryRef, name, system, packContext, false);
    const pack = sheet("ash-warden", 1);
    const packPlan = levelUpPlan({ data: pack, classInfo: info })!;
    expect(ok(applyLevelUp(pack, packPlan, { hp: { mode: "average" } }, homebrewRow)).after.features).toEqual([
      expect.objectContaining({ ref, origin: "custom", text: "Mark a foe with ash.", homebrewItem: "i" }),
    ]);
    // A sheet already near the cap: the homebrew row's copied text would pass 200 KB.
    const full = { ...pack, feats: [{ id: "feat_big", name: "Lore", origin: "pack", text: "x".repeat(200 * 1024 - 10) }] };
    expect(applyLevelUp(full, packPlan, { hp: { mode: "average" } }, homebrewRow)).toMatchObject({ ok: false, reason: "snapshot" });

    // A table copy of a Drive pack feature: no text copied, so no cap and no text.
    const drive = { ...packContext, homebrewOf: () => undefined };
    const tableRow: LevelUpRowBuilder = (tab, entryRef, name) => buildCompendiumRow(tab, entryRef, name, system, drive, false);
    const { after } = ok(applyLevelUp(pack, packPlan, { hp: { mode: "average" } }, tableRow));
    expect(rowsOf(after, "features")).toEqual([expect.objectContaining({ ref, origin: "pack", level: 2 })]);
    expect(rowsOf(after, "features")[0]).not.toHaveProperty("text");
  });

  it("asks the feats tab for an epic boon", async () => {
    const data = sheet("paladin", 18);
    const plan = levelUpPlan({ data, classInfo: await builtinClassInfo("paladin") })!;
    expect(ok(applyLevelUp(data, plan, { hp: { mode: "average" } }, buildRow)).followUp.feats).toBe("epicBoon");
  });
});
