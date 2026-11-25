// @vitest-environment node
import { expect, it } from "vitest";
import { loadEnglishCorpus } from "../../../reference/load-corpus";
import {
  subclassCodec as codec,
  subclassLevelsOf,
  MULTICLASS_SLOTS,
  thirdCasterSlots,
  type SubclassForm,
} from "../../domain/subclass";
import { subclassContext, sampleForm, records } from "./subclass-fixtures";
import { assembleOpenPack } from "../../domain/assemble";
import { keptRefs, splitOpenPack } from "../../domain/split";
import { loadBuiltinIdentity, loadOpenPackSchemaCheck } from "../../../content-pack/open/load";
import { sealOpenPack, openPackText } from "../../../content-pack/open/seal";
import { validateOpenPackText } from "../../../content-pack/open/validate-open-pack";
import { linkRefs } from "../../../reference/tags";
it("matches all parent levels and multiclass slots", async () => {
  const classes = {
    barbarian: [3, 6, 10, 14],
    bard: [3, 6, 14],
    cleric: [3, 6, 17],
    druid: [3, 6, 10, 14],
    fighter: [3, 7, 10, 15, 18],
    monk: [3, 6, 11, 17],
    paladin: [3, 7, 15, 20],
    ranger: [3, 7, 11, 15],
    rogue: [3, 9, 13, 17],
    sorcerer: [3, 6, 14, 18],
    warlock: [3, 6, 10, 14],
    wizard: [3, 6, 10, 14],
  };
  for (const [id, levels] of Object.entries(classes))
    expect(subclassLevelsOf(id, Object.keys((await loadEnglishCorpus(`classFeature-${id}`))!))).toEqual(levels);
  const table = (await loadEnglishCorpus("table"))!["table:multiclass-spellcaster-spell-slots-per-spell-level"]
    .entries[0] as { rows: string[][] };
  expect(table.rows.map((r) => r.slice(1).map((x) => Number(x) || 0))).toEqual(MULTICLASS_SLOTS);
  expect([3, 7, 19].map((n) => thirdCasterSlots(n))).toEqual([
    [2, 0, 0, 0],
    [4, 2, 0, 0],
    [4, 3, 3, 1],
  ]);
});
it.each([
  ["paladin", "oath-of-devotion"],
  ["cleric", "life-domain"],
])("rebuilds %s corpus spell refs", async (parent, id) => {
  const c = subclassContext(parent),
    entries = Object.values((await loadEnglishCorpus(`subclassFeature-${parent}`))!),
    s = entries.find((x) => x.id.endsWith(`${id}-spells-l3`))!,
    table = s.entries.find((x) => typeof x === "object" && x !== null && "rows" in x) as { rows: string[][] };
  const refs = (x: string) => [...x.matchAll(/\{@spell ([^}]+)\}/g)].flatMap((m) => linkRefs("spell", m[1].split("|")));
  const spells = table.rows.map(([n, x]) => ({ level: Number(n), refs: refs(x) }));
  c.spellNames = Object.fromEntries(spells.flatMap((x) => x.refs).map((r) => [r, { en: r, zh: r }]));
  const f = {
    ...codec.empty(parent),
    id,
    nameEn: id,
    spells,
    features:
      parent === "paladin"
        ? entries
            .filter((x) => x !== s && !x.id.endsWith(`/${id}-l3`))
            .map((x) => ({ level: Number(x.meta?.level), nameEn: x.name, nameZh: "", textEn: "", textZh: "" }))
        : [],
  };
  const rows = codec.toRows(f, c);
  expect(rows[0].payload.entry!.ref).toBe(`subclass:${parent}/${id}`);
  if (parent === "paladin")
    expect(
      rows
        .slice(1)
        .map((r) => [r.key, r.kind, r.payload.entry!.meta!.level])
        .sort(),
    ).toEqual(entries.map((e) => [e.id, e.kind, e.meta?.level]).sort());
  const out = rows[2].payload.entry!.entries[1] as { colLabels: string[]; rows: string[][] };
  expect(out.colLabels).toHaveLength(2);
  expect(out.rows.map(([n, x]) => [n, refs(x)])).toEqual(table.rows.map(([n, x]) => [n, refs(x)]));
});
it("round trips, protects lossy imports, orders changes", () => {
  const f: SubclassForm = sampleForm(),
    c = subclassContext();
  f.nameZh = "燈";
  f.features.push({ ...f.features[0], nameZh: "光", nameEn: "" });
  f.spellcasting = { ability: "int", list: "wizard", prepared: [], cantrips: [], textEn: "Study.", textZh: "研習" };
  c.otherFeatureIds = new Set(["fighter/other/flare-l3"]);
  const rows = records(codec.toRows(f, c));
  expect(JSON.stringify(rows[0])).toContain("{@b Flare}");
  const read = codec.fromRows(rows[0].payload, rows.slice(1), c);
  expect(read.lossless).toBe(true);
  expect(codec.plan(read.form, c, rows).writes).toEqual([]);
  read.form.features.pop();
  read.form.features[0].level = 7;
  const plan = codec.plan(read.form, c, rows);
  expect(plan.writes.map((r) => r.key)).toEqual([rows[0].key, rows[1].key, "fighter/lamplighter/flare-l7"]);
  expect(plan.deletes).toEqual(rows.slice(3).map((r) => r.id));
  rows[0].payload.entry!.source = "import";
  expect(codec.fromRows(rows[0].payload, rows.slice(1), c).lossless).toBe(false);
});
it("seals, validates and splits generated rows unchanged", async () => {
  const rows = codec.toRows(sampleForm(), subclassContext()),
    file = await sealOpenPack(
      assembleOpenPack({ packId: "test-lamps", name: "Test lamps", notice: "Original.", packVersion: "1.0.0" }, rows),
    );
  const identity = await loadBuiltinIdentity();
  const v = await validateOpenPackText(openPackText(file), {
    builtinRefs: identity.refs,
    builtinNameKeys: identity.nameKeys,
    schema: await loadOpenPackSchemaCheck(),
  });
  expect(v.ok, JSON.stringify(v)).toBe(true);
  if (v.ok)
    expect(splitOpenPack(file, keptRefs(v.pack)).items.sort((a, b) => a.key.localeCompare(b.key))).toEqual(
      rows.sort((a, b) => a.key.localeCompare(b.key)),
    );
});
