// @vitest-environment node
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { canonicalJson } from "../../../content-pack/domain/canonical-json";
import type { OpenPack } from "../../../content-pack/open/format";
import { loadBuiltinIdentity, loadOpenPackSchemaCheck } from "../../../content-pack/open/load";
import { openPackText, sealOpenPack } from "../../../content-pack/open/seal";
import { validateOpenPackText, type ValidateOpenPackDeps } from "../../../content-pack/open/validate-open-pack";
import { assembleOpenPack, exportHomebrewPack } from "../../domain/assemble";
import { HOMEBREW_FORMS } from "../../domain/forms";
import { keptRefs, splitOpenPack } from "../../domain/split";
import type { HomebrewItemInput, HomebrewPackRecord } from "../../domain/types";
import { backgroundFixture, builtinContext, featFixture, loadBuiltinEntries, itemFixture, speciesFixture, spellFixture } from "./fixtures";

// Loads the built-in names once; slow on a loaded machine.
vi.setConfig({ testTimeout: 30_000 });

const lantern = (): OpenPack =>
  JSON.parse(readFileSync(new URL("../../../content-pack/open/example/lantern-table.pack.json", import.meta.url), "utf8")) as OpenPack;

const record: HomebrewPackRecord = {
  id: "00000000-0000-4000-8000-000000000001", packId: "lamp-district", name: "Lamp District", notice: "Written by the test.",
  packVersion: "1.0.0", position: 0, enabled: true, revision: 1, updatedAt: "2026-11-25T00:00:00.000Z",
};

function fiveKinds(): HomebrewItemInput[] {
  const context = builtinContext();
  return [
    { kind: "feat", key: "lamplighter", payload: HOMEBREW_FORMS.feat.toPayload(featFixture(), context) },
    { kind: "spell", key: "ember-lance", payload: HOMEBREW_FORMS.spell.toPayload(spellFixture(), context) },
    { kind: "item", key: "lantern-of-patience", payload: HOMEBREW_FORMS.item.toPayload(itemFixture(), context) },
    { kind: "species", key: "mossfolk", payload: HOMEBREW_FORMS.species.toPayload(speciesFixture(), context) },
    { kind: "background", key: "lamp-keeper", payload: HOMEBREW_FORMS.background.toPayload(backgroundFixture(), context) },
  ];
}

let deps: ValidateOpenPackDeps;
beforeAll(async () => {
  await loadBuiltinEntries();
  const [schema, identity] = await Promise.all([loadOpenPackSchemaCheck(), loadBuiltinIdentity()]);
  deps = { builtinRefs: identity.refs, builtinNameKeys: identity.nameKeys, schema };
});

describe("homebrew packs ⇄ v1 packs", () => {
  it("splits the example pack into rows and assembles its payload back", async () => {
    const file = lantern();
    const checked = await validateOpenPackText(openPackText(file), deps);
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    const split = splitOpenPack(file, keptRefs(checked.pack));
    expect(split.manifest).toEqual({ packId: "lantern-table", name: "Lantern Table house rules", notice: file.manifest.notice, packVersion: "1.0.0" });
    expect(split.items.map(({ kind, key }) => `${kind}:${key}`)).toEqual(["feat:lantern-watcher", "overlay:spell:light"]);
    const assembled = assembleOpenPack(split.manifest, split.items);
    expect(canonicalJson(assembled.payload)).toBe(canonicalJson(file.payload));
  });

  it("exports a five-kind pack the validator keeps whole", async () => {
    const text = await exportHomebrewPack(record, fiveKinds());
    const checked = await validateOpenPackText(text, deps);
    expect(checked.ok, JSON.stringify(checked)).toBe(true);
    if (!checked.ok) return;
    expect(checked.name).toBe("Lamp District");
    expect(checked.report).toMatchObject({
      counts: { background: 1, feat: 1, item: 1, species: 1, spell: 1 }, dropped: [], droppedByName: [], droppedOverlays: [], builtinMismatch: false,
    });
    expect(Object.keys(checked.pack.wizard).sort()).toEqual(["backgrounds", "equipment-packages", "feats", "species", "spells"]);
    const file = JSON.parse(text) as OpenPack;
    expect(file.manifest).not.toHaveProperty("requiresBuiltin");
    expect(file.manifest.locales).toEqual(["en", "zh-TW"]);
    // Imported again, the rows are the rows written.
    const split = splitOpenPack(file, keptRefs(checked.pack));
    expect(canonicalJson(split.items.map(({ kind, key, payload }) => ({ kind, key, payload })).sort((a, b) => (a.key < b.key ? -1 : 1))))
      .toBe(canonicalJson(fiveKinds().sort((a, b) => (a.key < b.key ? -1 : 1))));
  });

  it("leaves out what the validator dropped and keeps a wizard item no entry owns as its own row", async () => {
    const file = lantern();
    file.payload.entries.push(
      { kind: "feat", id: "alert-again", name: "Alert", entries: ["Same name as a built-in feat."], meta: { category: "origin", grants: {}, repeatable: false } },
      { kind: "background", id: "night-watch", name: "Night Watch", entries: ["Kept."], meta: {} },
    );
    file.payload.zhTW = { ...file.payload.zhTW, "feat:alert-again": { name: "x", entries: [] } };
    file.payload.wizard = {
      ...file.payload.wizard,
      feats: [...(file.payload.wizard?.feats ?? []), { id: "alert-again", ref: "feat:alert-again", origin: "pack", label: { en: "Alert", "zh-TW": "Alert" } }],
      "equipment-packages": [
        { id: "background/night-watch/a", origin: "pack", label: { en: "Night Watch (A)", "zh-TW": "Night Watch (A)" }, owner: "night-watch", ownerKind: "background", option: "A", gp: 5, items: [] },
        { id: "background/alert-again/a", origin: "pack", label: { en: "x", "zh-TW": "x" }, owner: "alert-again", ownerKind: "feat", option: "A", gp: 1, items: [] },
        { id: "loose", origin: "pack", label: { en: "Loose kit", "zh-TW": "Loose kit" }, gp: 3, items: [] },
      ],
    };
    file.payload.overlays = { ...file.payload.overlays, "spell:not-a-spell": { en: { entries: ["No such built-in."] } } };
    const checked = await validateOpenPackText(openPackText(await sealOpenPack(file)), deps);
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    const { items } = splitOpenPack(file, keptRefs(checked.pack));
    expect(items.map(({ kind, key }) => `${kind}:${key}`)).toEqual([
      "feat:lantern-watcher", "background:night-watch", "overlay:spell:light", "wizard:equipment-packages/loose",
    ]);
    expect(items[1].payload.wizard?.["equipment-packages"]?.map((item) => item.id)).toEqual(["background/night-watch/a"]);
  });
});
