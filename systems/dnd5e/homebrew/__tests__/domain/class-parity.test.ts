// @vitest-environment node
/**
 * A class copied from a built-in class, with no authored features, rebuilds the built-in progression:
 * the same counts and slot columns at levels 1–20, the same level-1 spellcasting meta, and generated
 * feature ids the built-in class also has (CLASS-IMPL §5 C1).
 */
import { beforeAll, describe, expect, it } from "vitest";
import { classCodec, featureTable, type TableCell } from "../../domain/class";
import { homebrewParents } from "../../domain/subclass";
import { linkRefs } from "../../../reference/tags";
import { classContext, classRecords, loadClassCorpus } from "./class-fixtures";

const NUMERIC = ["Cantrips", "Prepared Spells", "1", "2", "3", "4", "5", "6", "7", "8", "9", "Spell Slots", "Slot Level", "Weapon Mastery"];
const value = (cell: TableCell) => Number(cell) || 0;

beforeAll(async () => {
  await loadClassCorpus();
});

function copied(id: string) {
  const ctx = classContext();
  const form = { ...classCodec.copyFrom(id, ctx.builtin), id: `my-${id}`, nameEn: `My ${id}` };
  return { form, ctx, rows: classCodec.toRows(form, ctx) };
}

describe.each([
  ["wizard", ["spellcasting-l1", "ability-score-improvement-l4", "ability-score-improvement-l8", "ability-score-improvement-l12", "ability-score-improvement-l16", "epic-boon-l19", "wizard-subclass-l3", "subclass-feature-l6", "subclass-feature-l10", "subclass-feature-l14"]],
  ["paladin", ["spellcasting-l1", "weapon-mastery-l1", "paladin-subclass-l3", "subclass-feature-l7", "subclass-feature-l15", "subclass-feature-l20", "extra-attack-l5", "epic-boon-l19"]],
  ["warlock", ["pact-magic-l1", "warlock-subclass-l3", "subclass-feature-l6", "subclass-feature-l10", "subclass-feature-l14", "epic-boon-l19"]],
  ["fighter", ["weapon-mastery-l1", "fighter-subclass-l3", "extra-attack-l5", "ability-score-improvement-l4", "ability-score-improvement-l6", "ability-score-improvement-l8", "ability-score-improvement-l12", "ability-score-improvement-l14", "ability-score-improvement-l16", "subclass-feature-l7", "subclass-feature-l18"]],
])("copy of %s", (id, expected) => {
  it("rebuilds the table's counts, slots and mastery columns for levels 1–20", async () => {
    const { classes } = await loadClassCorpus();
    const { rows } = copied(id);
    const ours = featureTable(rows[0].payload.entry!.entries)!;
    const theirs = featureTable(classes[`class:${id}`].entries)!;
    const numeric = (labels: string[]) => labels.filter((label) => NUMERIC.includes(label));
    expect(numeric(ours.colLabels)).toEqual(numeric(theirs.colLabels));
    for (const label of numeric(theirs.colLabels)) {
      const column = (t: typeof ours) => t.rows.map((row) => value(row[t.colLabels.indexOf(label)]));
      expect(column(ours), label).toEqual(column(theirs));
    }
    expect(ours.rows.map((row) => row[1])).toEqual(theirs.rows.map((row) => row[1]));
  });

  it("writes the built-in level-1 spellcasting meta", async () => {
    const { classes } = await loadClassCorpus();
    const ours = (copied(id).rows[0].payload.entry!.meta!.spellcasting ?? null) as Record<string, unknown> | null;
    const theirs = (classes[`class:${id}`].meta!.spellcasting ?? null) as Record<string, unknown> | null;
    if (!theirs) return expect(ours).toBeNull();
    for (const key of ["ability", "progression", "cantripsL1", "preparedL1", "slotsL1", "pact"]) expect(ours![key], key).toEqual(theirs[key]);
  });

  it("generates only ids the built-in class has, linked from the table", async () => {
    const { featureIds } = await loadClassCorpus();
    const { rows } = copied(id);
    const leaves = rows.slice(1).map((r) => r.key.replace(`my-${id}/`, "").replace(`my-${id}-subclass`, `${id}-subclass`));
    expect(leaves).toEqual(expect.arrayContaining(expected));
    for (const leaf of leaves) expect(featureIds[id]).toContain(`classFeature:${id}/${leaf}`);
    const cells = featureTable(rows[0].payload.entry!.entries)!.rows.map((row) => String(row[2]));
    const linked = cells.flatMap((cell) => [...cell.matchAll(/\{@classFeature ([^}]+)\}/g)].flatMap((m) => linkRefs("classFeature", m[1].split("|"))));
    expect(linked.sort()).toEqual(rows.slice(1).map((r) => r.payload.entry!.ref).sort());
  });

  it("is a subclass parent with the copied ladder and caster", () => {
    const { rows, ctx } = copied(id);
    const [parent] = homebrewParents(classRecords(rows));
    expect(parent).toMatchObject({ id: `my-${id}`, builtin: false, subclassLevels: ctx.builtin[id].subclassLevels });
    expect(parent.caster).toBe({ wizard: "full", paladin: "half", warlock: "pact", fighter: "none" }[id]);
    expect(parent.thirdCaster).toBe(id === "fighter");
  });
});
