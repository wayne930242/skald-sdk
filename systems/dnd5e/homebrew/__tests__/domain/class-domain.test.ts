// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { classCodec, type ClassForm } from "../../domain/class";
import { assembleOpenPack } from "../../domain/assemble";
import { keptRefs, splitOpenPack } from "../../domain/split";
import type { HomebrewPayload } from "../../domain/types";
import { loadBuiltinIdentity, loadOpenPackSchemaCheck } from "../../../content-pack/open/load";
import { sealOpenPack, openPackText } from "../../../content-pack/open/seal";
import { validateOpenPackText } from "../../../content-pack/open/validate-open-pack";
import { classContext, classRecords, loadClassCorpus } from "./class-fixtures";
import { MULTICLASS_RULES, multiclassRulesOf } from "../../../reference/multiclass";

beforeAll(async () => {
  await loadClassCorpus();
});

/** A druid copy that borrows the druid list, with a zh-only name, an author column and two features. */
function ashWarden(): ClassForm {
  const ctx = classContext();
  return {
    ...classCodec.copyFrom("druid", ctx.builtin),
    id: "ash-warden", nameEn: "", nameZh: "灰燼守望者", textEn: "", textZh: "守望灰燼的人。",
    columns: [{ nameEn: "Embers", nameZh: "餘燼", values: Array.from({ length: 20 }, (_, i) => (i < 2 ? "" : String(1 + Math.floor(i / 5)))) }],
    features: [
      { level: 2, nameEn: "", nameZh: "灰燼印記", textEn: "", textZh: "你留下灰燼印記。" },
      { level: 6, nameEn: "Cinder Step", nameZh: "餘燼步", textEn: "You step through **smoke**.", textZh: "你穿過煙霧。" },
    ],
  };
}

function saved(form: ClassForm) {
  const ctx = classContext();
  const rows = classRecords(classCodec.toRows(form, ctx));
  return { ctx, rows, read: () => classCodec.fromRows(rows[0].payload, classCodec.rowsOf(rows[0].key, rows), ctx) };
}

describe("class codec", () => {
  it("round trips zh-only names, author columns and a borrowed list", () => {
    const form = ashWarden();
    const { ctx, rows, read } = saved(form);
    expect(rows[0].payload.entry!.meta!.spellcasting).toMatchObject({ list: "druid", progression: "full" });
    expect((rows[0].payload.wizard!.classes![0].w as Record<string, unknown>).spellList).toBe("druid");
    const back = read();
    expect(back.lossless).toBe(true);
    expect(back.form).toEqual({ ...form, features: form.features.map((x, i) => ({ ...x, key: back.form.features[i].key })) });
    expect(back.form.features.map((x) => x.key)).toEqual([expect.stringMatching(/^hb-[a-z0-9]{8}-l2$/), "cinder-step-l6"]);
    expect(classCodec.plan(back.form, ctx, rows)).toMatchObject({ writes: [], deletes: [], addedRows: 0 });
  });

  it("copies the multiclass rules into meta.multiclass and round trips an edited block", () => {
    const ctx = classContext();
    const rogue = { ...classCodec.copyFrom("rogue", ctx.builtin), id: "shade", nameEn: "Shade" };
    const meta = saved(rogue).rows[0].payload.entry!.meta!;
    expect(meta.multiclass).toEqual(MULTICLASS_RULES.rogue);
    expect(multiclassRulesOf("shade", meta)).toEqual({ ...MULTICLASS_RULES.rogue, known: true });
    const edited: ClassForm = {
      ...rogue,
      multiclass: {
        requires: { abilities: ["dex", "int"], mode: "any", score: 13 },
        gains: { armor: ["light", "shield"], weapons: ["martial"], skills: { count: 2, from: "any" }, tools: { choice: { category: "gaming", count: 1 } } },
      },
    };
    const back = saved(edited).read();
    expect(back.lossless).toBe(true);
    expect(back.form.multiclass).toEqual(edited.multiclass);
    const blank = { ...rogue, multiclass: { ...rogue.multiclass, requires: { abilities: [], mode: "all" as const, score: 13 as const } } };
    const fallback = saved(blank).rows[0].payload.entry!.meta!.multiclass as { requires: { abilities: string[] } };
    expect(fallback.requires.abilities).toEqual(["dex"]);
    expect(classCodec.issues({ ...rogue, multiclass: { ...rogue.multiclass, gains: { ...rogue.multiclass.gains, armor: ["heavy" as never] } } }, ctx))
      .toContain("multiclass");
  });

  it("keeps an own list out of the meta and the wizard item", () => {
    const form = { ...ashWarden(), nameEn: "Ash Warden", casting: { ...ashWarden().casting!, list: "" } };
    const { rows, read } = saved(form);
    expect(rows[0].payload.entry!.meta!.spellcasting).not.toHaveProperty("list");
    expect(rows[0].payload.wizard!.classes![0].w).not.toHaveProperty("spellList");
    expect(read().lossless).toBe(true);
  });

  it("reads a hand-written or edited class as lossy", async () => {
    const { classes } = await loadClassCorpus();
    const wizard = classes["class:wizard"];
    const hand: HomebrewPayload = { entry: { ...wizard, id: "hand", ref: "class:hand", source: "homebrew" } };
    expect(classCodec.fromRows(hand, [], classContext()).lossless).toBe(false);
    const { rows } = saved(ashWarden());
    const stored = structuredClone(rows);
    // A generated row's text edited by hand is not today's or v4.152.0's wording: read-only, so a save cannot overwrite it.
    expect(rows[3].payload.entry!.meta!.generated).toBeTruthy();
    rows[3].payload = { ...rows[3].payload, entry: { ...rows[3].payload.entry!, entries: ["Edited by hand."] } };
    expect(classCodec.fromRows(rows[0].payload, rows.slice(1), classContext()).lossless).toBe(false);
    stored[3].payload = { ...stored[3].payload, entry: { ...stored[3].payload.entry!, meta: { ...stored[3].payload.entry!.meta, extra: 1 } } };
    expect(classCodec.fromRows(stored[0].payload, stored.slice(1), classContext()).lossless).toBe(false);
  });

  it("plans only changed rows, new ASI rows and deletes of re-levelled features", () => {
    const { ctx, rows, read } = saved(ashWarden());
    const form = read().form;
    form.asi = "fighter";
    form.features[1].level = 7;
    const plan = classCodec.plan(form, ctx, rows);
    const step = rows.find((r) => r.key === "ash-warden/cinder-step-l6")!;
    expect(plan.writes.map((w) => w.key)).toEqual([
      "ash-warden", "ash-warden/ability-score-improvement-l6", "ash-warden/ability-score-improvement-l14", "ash-warden/cinder-step-l7",
    ]);
    expect(plan.writes[0]).toMatchObject({ id: rows[0].id, expectedRevision: 1 });
    expect(plan.addedRows).toBe(3);
    expect(plan.deletes).toEqual([step.id]);
  });

  it("never gives an authored feature a generated slug", () => {
    const form = { ...ashWarden(), features: [
      { level: 10, nameEn: "Ability Score Improvement", nameZh: "", textEn: "Own.", textZh: "" },
      { level: 1, nameEn: "Spellcasting", nameZh: "", textEn: "Own.", textZh: "" },
    ] };
    const keys = classCodec.toRows(form, classContext()).map((r) => r.key);
    expect(keys).toContain("ash-warden/ability-score-improvement-2-l10");
    expect(keys).toContain("ash-warden/spellcasting-2-l1");
    expect(keys.filter((k) => k === "ash-warden/spellcasting-l1")).toHaveLength(1);
  });

  it("lists what blocks a save", () => {
    const ctx = classContext();
    const base = { ...ashWarden(), nameEn: "Ash Warden" };
    expect(classCodec.issues(base, ctx)).toEqual([]);
    expect(classCodec.issues({ ...base, id: "wizard" }, ctx)).toContain("id");
    expect(classCodec.issues({ ...base, saves: ["wis"] }, ctx)).toContain("saves");
    expect(classCodec.issues({ ...base, casting: { ...base.casting!, countsLike: "paladin" } }, ctx)).toContain("countsLike");
    expect(classCodec.issues({ ...base, casting: { ...base.casting!, list: "fighter" } }, ctx)).toContain("list");
    expect(classCodec.issues({ ...base, columns: [{ nameEn: "X", nameZh: "", values: Array(20).fill("x".repeat(41)) }] }, ctx)).toContain("columns");
    expect(classCodec.issues({ ...base, features: [{ level: 21, nameEn: "Late", nameZh: "", textEn: "", textZh: "" }] }, ctx)).toContain("feature");
    expect(() => classCodec.toRows({ ...base, hitDie: 7 as 8 }, ctx)).toThrow(/hitDie/);
  });

  it("seals, validates and splits generated rows unchanged", async () => {
    const rows = classCodec.toRows({ ...ashWarden(), nameEn: "Ash Warden" }, classContext());
    const file = await sealOpenPack(assembleOpenPack({ packId: "test-ash", name: "Test ash", notice: "Original.", packVersion: "1.0.0" }, rows));
    const identity = await loadBuiltinIdentity();
    const v = await validateOpenPackText(openPackText(file), {
      builtinRefs: identity.refs, builtinNameKeys: identity.nameKeys, schema: await loadOpenPackSchemaCheck(),
    });
    expect(v.ok, JSON.stringify(v)).toBe(true);
    if (!v.ok) return;
    const byKey = (a: { key: string }, b: { key: string }) => a.key.localeCompare(b.key);
    expect(splitOpenPack(file, keptRefs(v.pack)).items.sort(byKey)).toEqual([...rows].sort(byKey));
  });
});
