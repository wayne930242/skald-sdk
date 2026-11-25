import { describe, expect, it } from "vitest";
import { MULTICLASS_SLOTS } from "../../../homebrew/domain/subclass/slots";
import { progressionAt, progressionOf } from "../../../reference/class-progression";
import { builtinClassEntry, CLASS_IDS } from "./class-info";

const FULL = ["bard", "cleric", "druid", "sorcerer", "wizard"];
const HALF = ["paladin", "ranger"];
const NONE = ["barbarian", "fighter", "monk", "rogue"];
const ZERO9 = [0, 0, 0, 0, 0, 0, 0, 0, 0];

describe("progressionOf (phase 2b §4.2)", () => {
  it.each(CLASS_IDS)("reads all 20 levels of %s from the corpus table", async (id) => {
    const progression = progressionOf(await builtinClassEntry(id));
    expect(progression).not.toBeNull();
    expect(progression!.levels.map((row) => row.level)).toEqual(Array.from({ length: 20 }, (_, index) => index + 1));
    for (const row of progression!.levels) {
      for (const feature of row.features) expect(feature.ref).toMatch(new RegExp(`^classFeature:${id}/[a-z0-9-]+-l${row.level}$`));
    }
  });

  it.each(FULL)("%s: slots are the multiclass table row L", async (id) => {
    const progression = progressionOf(await builtinClassEntry(id))!;
    for (const row of progression.levels) expect(row.slots, `${id} L${row.level}`).toEqual([...MULTICLASS_SLOTS[row.level - 1]]);
    expect(progression.levels.every((row) => row.pact === undefined)).toBe(true);
  });

  it.each(HALF)("%s: slots are the multiclass row ⌈L/2⌉, first 5 spell levels", async (id) => {
    const progression = progressionOf(await builtinClassEntry(id))!;
    for (const row of progression.levels) {
      const expected = [...MULTICLASS_SLOTS[Math.ceil(row.level / 2) - 1].slice(0, 5), 0, 0, 0, 0];
      expect(row.slots, `${id} L${row.level}`).toEqual(expected);
    }
    expect(progression.levels[0].cantrips).toBeUndefined();
    expect(progression.levels[0].prepared).toBe(2);
  });

  it("warlock: pact magic 1/1 … 4/5 and no level slots", async () => {
    const progression = progressionOf(await builtinClassEntry("warlock"))!;
    const pact = (level: number) => progressionAt(progression, level)?.pact;
    expect(pact(1)).toEqual({ slots: 1, level: 1 });
    expect(pact(2)).toEqual({ slots: 2, level: 1 });
    expect(pact(3)).toEqual({ slots: 2, level: 2 });
    expect(pact(5)).toEqual({ slots: 2, level: 3 });
    expect(pact(7)).toEqual({ slots: 2, level: 4 });
    expect(pact(9)).toEqual({ slots: 2, level: 5 });
    expect(pact(11)).toEqual({ slots: 3, level: 5 });
    expect(pact(17)).toEqual({ slots: 4, level: 5 });
    expect(pact(20)).toEqual({ slots: 4, level: 5 });
    expect(progression.levels.every((row) => row.slots === undefined)).toBe(true);
    expect(progressionAt(progression, 2)?.columns).toEqual([{ index: 3, label: "Eldritch Invocations", value: 3 }]);
  });

  it.each(NONE)("%s: no casting columns", async (id) => {
    const progression = progressionOf(await builtinClassEntry(id))!;
    for (const row of progression.levels) {
      expect(row.slots).toBeUndefined();
      expect(row.pact).toBeUndefined();
      expect(row.cantrips).toBeUndefined();
      expect(row.prepared).toBeUndefined();
    }
  });

  it("cleric cantrips go 3 → 4 at level 4", async () => {
    const progression = progressionOf(await builtinClassEntry("cleric"))!;
    expect(progressionAt(progression, 3)?.cantrips).toBe(3);
    expect(progressionAt(progression, 4)?.cantrips).toBe(4);
  });

  it("reads class columns by English label, keeping text cells", async () => {
    const barbarian = progressionOf(await builtinClassEntry("barbarian"))!;
    expect(barbarian.columnLabels).toEqual(["Rages", "Rage Damage", "Weapon Mastery"]);
    expect(progressionAt(barbarian, 1)?.columns.map((column) => column.value)).toEqual([2, "+2", 2]);
    expect(progressionAt(barbarian, 1)?.features.map((feature) => feature.ref)).toContain("classFeature:barbarian/rage-l1");
    const monk = progressionOf(await builtinClassEntry("monk"))!;
    expect(progressionAt(monk, 1)?.columns.find((column) => column.label === "Focus Points")?.value).toBe(0);
  });

  it("finds the table nested, in a resolved reference (SRD blocks first), and in homebrew-generated cells", () => {
    const table = {
      type: "table",
      colLabels: ["Level", "Proficiency Bonus", "Class Features", "Embers", "Prepared Spells", "1", "2", "3", "4", "5"],
      rows: [
        [1, "+2", "{@classFeature spellcasting|ash-warden||1||Spellcasting}", "—", 2, 2, "—", "—", "—", "—"],
        { type: "row", row: [2, "+2", "{@classFeature ash-mark|ash-warden||2||Ash Mark}", "1d4", 3, 2, "—", "—", "—", "—"] },
      ],
    };
    const nested = progressionOf({ entries: ["An ashen warden.", { type: "entries", name: "Features", entries: [table] }] })!;
    expect(nested.levels[1]).toEqual({
      level: 2,
      prepared: 3,
      slots: [2, 0, 0, 0, 0, 0, 0, 0, 0],
      columns: [{ index: 3, label: "Embers", value: "1d4" }],
      features: [{ ref: "classFeature:ash-warden/ash-mark-l2", name: "Ash Mark" }],
    });
    const other = { ...table, rows: [[1, "+2", "—", 9, 9, 9, "—", "—", "—", "—"]] };
    const resolved = progressionOf({ blocks: [{ block: other }], srdBlocks: [{ block: table }] })!;
    expect(resolved.levels).toHaveLength(2);
    expect(progressionOf(["no table"])).toBeNull();
    expect(progressionOf({ entries: [{ type: "table", colLabels: ["Level", "Feature"], rows: [] }] })).toBeNull();
    expect(nested.levels[0].slots).not.toEqual(ZERO9);
    expect(nested.levels[0].columns).toEqual([{ index: 3, label: "Embers", value: 0 }]);
  });
});
