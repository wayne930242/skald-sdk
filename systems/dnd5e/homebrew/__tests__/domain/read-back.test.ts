// @vitest-environment node
import { beforeAll, expect, it } from "vitest";
import { classCodec, type ClassContext } from "../../domain/class";
import { subclassCodec, type SubclassContext, type SubclassForm } from "../../domain/subclass";
import type { HomebrewItemRecord } from "../../domain/types";
import { classContext, classRecords, loadClassCorpus } from "./class-fixtures";
import { records, sampleForm, subclassContext } from "./subclass-fixtures";

beforeAll(async () => {
  await loadClassCorpus();
});

/** Rows as v4.152.0 stored them: `rewrite` turns today's generated wording into that release's. */
function asStored(rows: HomebrewItemRecord[], rewrite: (json: string) => string): HomebrewItemRecord[] {
  return rows.map((r) => ({ ...r, payload: JSON.parse(rewrite(JSON.stringify(r.payload))) }));
}

/** v4.152.0 filled Latin-lettered names in without a space next to CJK (the fixtures' zh templates have no such space). */
const unspaced = (json: string) => json.replace(/ (?=\p{Script=Han})|(?<=\p{Script=Han}) /gu, "");

/** A cleric-based class with a Latin-lettered zh name; today's and v4.152.0's wording differ in ability name, list term and spacing. */
function clericCase() {
  const ctx: ClassContext = classContext();
  ctx.abilityNames = { ...ctx.abilityNames, wis: { en: "Wisdom", zh: "睿知" } };
  ctx.labels = { ...ctx.labels, zh: { ...ctx.labels.zh, spellcastingText: "你以{ability}施展{list}法術列表的法術。" } };
  ctx.legacy = {
    labels: { en: {}, zh: { spellcastingText: "你以{ability}施展{list}法術清單的法術。" } },
    abilityNames: { wis: { en: "Wis", zh: "感知" } },
  };
  const form = { ...classCodec.copyFrom("cleric", ctx.builtin), id: "uat2", nameEn: "UAT2", nameZh: "UAT2秘紋" };
  return { ctx, rows: classRecords(classCodec.toRows(form, ctx)) };
}

const v4152Class = (json: string) =>
  unspaced(json).replaceAll("睿知", "感知").replaceAll("with Wisdom", "with Wis").replaceAll("法術列表", "法術清單");

it("opens a class saved by v4.152.0 (older ability names, list term, no CJK spacing) as a form", () => {
  const { ctx, rows } = clericCase();
  const stored = asStored(rows, v4152Class);
  expect(JSON.stringify(stored)).not.toEqual(JSON.stringify(rows));
  const read = classCodec.fromRows(stored[0].payload, classCodec.rowsOf("uat2", stored), ctx);
  expect(read.lossless).toBe(true);
  // The next save rewrites the generated text only: the class row (table caption, cells) and the generated features.
  const writes = classCodec.plan(read.form, ctx, stored).writes.map((w) => w.key);
  expect(writes).toContain("uat2");
  expect(writes).toContain("uat2/spellcasting-l1");
  expect(writes.every((k) => k === "uat2" || rows.find((r) => r.key === k)?.payload.entry?.meta?.generated)).toBe(true);
  // Today's rows read back too.
  expect(classCodec.fromRows(rows[0].payload, classCodec.rowsOf("uat2", rows), ctx).lossless).toBe(true);
});

it("keeps a class read-only when its progression table or generated text was edited", () => {
  const { ctx, rows } = clericCase();
  const table = (stored: HomebrewItemRecord[], layer: "entry" | "zhTW") =>
    stored[0].payload[layer]!.entries!.at(-1) as { caption: string; rows: unknown[][]; colLabels: string[] };
  const lossless = (stored: HomebrewItemRecord[]) => classCodec.fromRows(stored[0].payload, classCodec.rowsOf("uat2", stored), ctx).lossless;

  const number = structuredClone(rows);
  table(number, "entry").rows[3][1] = 9;
  expect(lossless(number)).toBe(false);
  const zhCell = structuredClone(rows);
  table(zhCell, "zhTW").rows[0][2] = "{@classFeature spellcasting|uat2||1||Hand}";
  expect(lossless(zhCell)).toBe(false);
  const column = structuredClone(rows);
  table(column, "entry").colLabels.push("Extra");
  expect(lossless(column)).toBe(false);
  // Wording that is neither today's nor v4.152.0's.
  const caption = structuredClone(rows);
  table(caption, "entry").caption = "My own caption";
  expect(lossless(caption)).toBe(false);
  // A v4.152.0 save with a table value changed by hand stays read-only as well.
  const old = asStored(rows, v4152Class);
  table(old, "zhTW").rows[4][1] = 9;
  expect(lossless(old)).toBe(false);
});

/** A third-caster subclass with spells, a Latin-lettered zh name and CJK labels. */
function subclassCase() {
  const c: SubclassContext = subclassContext();
  c.abilityNames = { wis: { en: "Wisdom", zh: "睿知" } };
  c.labels = {
    en: c.labels.en,
    zh: { ...c.labels.zh, alwaysPrepared: "{sub}法術始終準備。", castingRule: "以{ability}施法。", prepared: "已準備法術", castingName: "{sub}施法", spellsName: "{sub}法術" },
  };
  c.legacy = { labels: { en: {}, zh: { alwaysPrepared: "{sub}法術總是備妥。", prepared: "備妥法術" } }, abilityNames: { wis: { en: "Wisdom", zh: "感知" } } };
  c.spellNames = { "spell:shield": { en: "Shield", zh: "護盾術" } };
  const f: SubclassForm = {
    ...sampleForm(),
    nameZh: "UAT2堡壘",
    spellcasting: { ability: "wis", list: "wizard", prepared: [{ level: 3, value: 2 }], cantrips: [], textEn: "Study.", textZh: "" },
    spells: [{ level: 3, refs: ["spell:shield"] }],
  };
  return { c, rows: records(subclassCodec.toRows(f, c)) };
}

const v4152Subclass = (json: string) =>
  unspaced(json)
    .replaceAll("睿知", "感知")
    .replaceAll("始終準備", "總是備妥")
    .replaceAll("已準備法術", "備妥法術")
    .replaceAll('"—"', '"0"');

it("opens a subclass saved by v4.152.0 (older terms, 0 for empty slots, no CJK spacing) as a form", () => {
  const { c, rows } = subclassCase();
  const stored = asStored(rows, v4152Subclass);
  expect(JSON.stringify(stored)).toContain('"0"');
  const read = subclassCodec.fromRows(stored[0].payload, stored.slice(1), c);
  expect(read.lossless).toBe(true);
  expect(read.form.spellcasting?.textEn).toBe("Study.");
  expect(subclassCodec.fromRows(rows[0].payload, rows.slice(1), c).lossless).toBe(true);
});

it("keeps a subclass read-only when its spell or casting table or description was edited", () => {
  const { c, rows } = subclassCase();
  const lossless = (stored: HomebrewItemRecord[]) => subclassCodec.fromRows(stored[0].payload, stored.slice(1), c).lossless;
  const row = (stored: HomebrewItemRecord[], generated: string) => stored.find((r) => r.payload.entry?.meta?.generated === generated)!;
  const lastTable = (r: HomebrewItemRecord, layer: "entry" | "zhTW") => r.payload[layer]!.entries!.at(-1) as { rows: string[][] };

  const spells = structuredClone(rows);
  lastTable(row(spells, "spells"), "entry").rows[0][1] = "{@spell magic missile||Magic Missile}";
  expect(lossless(spells)).toBe(false);
  const slots = structuredClone(rows);
  lastTable(row(slots, "spellcasting"), "zhTW").rows[0][2] = "3";
  expect(lossless(slots)).toBe(false);
  const old = asStored(rows, v4152Subclass);
  lastTable(row(old, "spellcasting"), "entry").rows[5][1] = "7";
  expect(lossless(old)).toBe(false);
  const desc = structuredClone(rows);
  desc[0].payload.entry!.entries = ["Changed by hand.", ...desc[0].payload.entry!.entries!];
  expect(lossless(desc)).toBe(false);
});

it("reads an orphan subclass back with its old parent's name taken from the stored class-level column", () => {
  const { c, rows } = subclassCase();
  const named: SubclassContext = { ...c, parent: { ...c.parent, name: { en: "Ember Knight", zh: "UAT2燼騎" } } };
  const stored = records(subclassCodec.toRows({ ...subclassCodec.fromRows(rows[0].payload, rows.slice(1), c).form }, named));
  const stand = subclassCodec.orphanContext(stored[0].payload, stored.slice(1), { ...c })!;
  expect(stand.parent.name).toEqual({ en: "Ember Knight", zh: "UAT2燼騎" });
  expect(subclassCodec.fromRows(stored[0].payload, stored.slice(1), stand).lossless).toBe(true);
});

it("reads a subclass with a sibling feature back as a form before and after its parent is deleted", () => {
  const c: SubclassContext = { ...subclassContext("ember"), otherFeatureIds: new Set(["subclassFeature:ember/other/flare-l3"]) };
  c.parent = { ...c.parent, builtin: false };
  const own = records(subclassCodec.toRows({ ...sampleForm(), parent: "ember" }, c));
  const sibling = records(subclassCodec.toRows({ ...sampleForm(), id: "other", parent: "ember" }, { ...c, otherFeatureIds: new Set() }));
  // The sibling's same-named feature is a bold label, not a link.
  expect(JSON.stringify(own[0].payload.entry)).toContain("{@b Flare}");
  expect(subclassCodec.fromRows(own[0].payload, own.slice(1), c).lossless).toBe(true);
  const pack = [...own, ...sibling];
  const stand = subclassCodec.orphanContext(own[0].payload, own.slice(1), { ...c }, pack, own[0].key)!;
  expect(subclassCodec.fromRows(own[0].payload, own.slice(1), stand).lossless).toBe(true);
});
