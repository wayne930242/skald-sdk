import { beforeAll, describe, expect, it } from "vitest";
import { canonicalJson } from "../../../content-pack/domain/canonical-json";
import { formKindOf, HOMEBREW_FORMS, newHomebrewId, type HomebrewForms } from "../../domain/forms";
import type { HomebrewFormKind } from "../../domain/types";
import { backgroundFixture, builtinContext, loadBuiltinEntries, featFixture, itemFixture, speciesFixture, spellFixture } from "./fixtures";

const fixtures: { [K in HomebrewFormKind]: () => HomebrewForms[K] } = {
  feat: featFixture,
  spell: spellFixture,
  item: itemFixture,
  species: speciesFixture,
  background: backgroundFixture,
};
const kinds = Object.keys(fixtures) as HomebrewFormKind[];

function codec<K extends HomebrewFormKind>(kind: K) {
  return HOMEBREW_FORMS[kind] as unknown as {
    empty(): HomebrewForms[K];
    issues(form: HomebrewForms[K]): string[];
    toPayload(form: HomebrewForms[K], context?: ReturnType<typeof builtinContext>): import("../../domain/types").HomebrewPayload;
    fromPayload(payload: import("../../domain/types").HomebrewPayload): { form: HomebrewForms[K]; lossless: boolean };
  };
}

beforeAll(async () => {
  await loadBuiltinEntries();
});

describe("homebrew forms ⇄ v1", () => {
  it.each(kinds)("%s: the form comes back from its payload, losslessly", (kind) => {
    const form = fixtures[kind]();
    const payload = codec(kind).toPayload(form, builtinContext());
    expect(formKindOf(payload)).toBe(kind);
    expect(payload.entry).toMatchObject({ kind, id: form.id, ref: `${kind}:${form.id}`, source: "homebrew", name: form.nameEn });
    expect(payload.zhTW?.name).toBe(form.nameZh);
    const read = codec(kind).fromPayload(payload);
    expect(read).toEqual({ form, lossless: true });
  });

  it.each(kinds)("%s: a blank form has issues and refuses to convert", (kind) => {
    const empty = codec(kind).empty();
    expect(codec(kind).issues(empty)).toEqual(expect.arrayContaining(["name", "id"]));
    expect(() => codec(kind).toPayload(empty)).toThrow();
  });

  it("writes a Chinese-only name and text on both sides and reads them back on the zh-TW side", () => {
    const form = { ...featFixture(), id: "hb-abc12345", nameEn: "", textEn: "" };
    const payload = HOMEBREW_FORMS.feat.toPayload(form);
    expect(payload.entry?.name).toBe(form.nameZh);
    expect(payload.zhTW?.name).toBe(form.nameZh);
    expect(payload.entry?.entries).toEqual(payload.zhTW?.entries);
    const read = HOMEBREW_FORMS.feat.fromPayload(payload);
    expect(read).toEqual({ form, lossless: true });
  });

  it("has no zh-TW layer without zh-TW fields, and saving a read payload changes nothing", () => {
    const form = { ...spellFixture(), nameZh: "", textZh: "", higherZh: "", materialZh: "" };
    const payload = HOMEBREW_FORMS.spell.toPayload(form);
    expect(payload.zhTW).toBeUndefined();
    const again = HOMEBREW_FORMS.spell.toPayload(HOMEBREW_FORMS.spell.fromPayload(payload).form);
    expect(canonicalJson(again)).toBe(canonicalJson(payload));
  });

  it("keeps a trait without zh-TW text readable in zh-TW (English falls in)", () => {
    const payload = HOMEBREW_FORMS.species.toPayload(speciesFixture());
    const zh = payload.zhTW?.entries as Array<{ name: string; entries: unknown[] }>;
    expect(zh[1]).toEqual({ type: "entries", name: "扎根", entries: ["You have Advantage on saving throws against being pushed."] });
    expect(payload.entry?.meta?.traits).toEqual([
      { name: "Soft Step", entries: ["You leave no tracks on grass or moss."] },
      { name: "Rooted", entries: ["You have Advantage on saving throws against being pushed."] },
    ]);
  });

  it("reads an imported entry the markup cannot express as lossy", () => {
    const payload = HOMEBREW_FORMS.feat.toPayload(featFixture());
    const imported = { ...payload, entry: { ...payload.entry!, entries: [...payload.entry!.entries, { type: "table", rows: [["1"]] }] } };
    expect(HOMEBREW_FORMS.feat.fromPayload(imported).lossless).toBe(false);
    const granted = { ...payload, entry: { ...payload.entry!, meta: { ...payload.entry!.meta, grants: { skillChoiceCount: 1 } } } };
    expect(HOMEBREW_FORMS.feat.fromPayload(granted).lossless).toBe(false);
    // The author's own source label and an absent ref are not losses.
    const { ref: _ref, ...unreffed } = payload.entry!;
    expect(HOMEBREW_FORMS.feat.fromPayload({ ...payload, entry: { ...unreffed, source: "mine" } }).lossless).toBe(true);
  });

  it("refuses a payload of another kind", () => {
    const payload = HOMEBREW_FORMS.feat.toPayload(featFixture());
    expect(() => HOMEBREW_FORMS.spell.fromPayload(payload)).toThrow();
  });

  it("makes ids from the English name, or hb- and eight random characters", () => {
    expect(newHomebrewId("Lantern Watcher's Oath")).toBe("lantern-watchers-oath");
    const id = newHomebrewId("", () => 0.5);
    expect(id).toMatch(/^hb-[a-z0-9]{8}$/);
    expect(newHomebrewId("").length).toBe(11);
  });

  it("names built-in refs by token and homebrew refs by name in the background's rows", () => {
    const ownFeat = { ref: "feat:lamplighter", name: "Lamplighter", meta: { category: "origin", grants: {} }, builtin: false };
    const form = { ...backgroundFixture(), originFeat: "feat:lamplighter" };
    const payload = HOMEBREW_FORMS.background.toPayload(form, builtinContext([ownFeat]));
    const w = payload.wizard?.backgrounds?.[0].w as Record<string, unknown>;
    expect(w.feats).toEqual([{ id: "feat:lamplighter", ref: "feat:lamplighter", label: "Lamplighter", origin: "pack", category: "origin" }]);
    expect(w.tools).toEqual([
      { id: "baseItem:calligraphers-supplies", ref: "baseItem:calligraphers-supplies", label: "{{i18n:ref.baseItem.calligraphers-supplies}}", origin: "srd" },
    ]);
    const pkg = payload.wizard?.["equipment-packages"]?.[0];
    expect(pkg).toMatchObject({ id: "background/lamp-keeper/a", owner: "lamp-keeper", ownerKind: "background", label: { en: "Lamp Keeper (A)", "zh-TW": "守燈者（A）" } });
    expect((pkg?.w as Record<string, unknown>).armorType).toBe("light");
  });
});
