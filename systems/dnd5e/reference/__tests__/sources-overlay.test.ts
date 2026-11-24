import { describe, expect, it } from "vitest";
import { createBuiltinSource, createPackSource, ReferenceSources, type ReferenceOverlay } from "../sources";

/**
 * Pack overlays over built-in entries (plan T2b §4). All overlay text here is synthetic: the
 * mechanism is under test, not any book's wording.
 */

const overlays: Record<string, ReferenceOverlay> = {
  "spell:wish": {
    source: "XPHB",
    en: {
      name: "Sample Original Wish",
      entries: ["Synthetic original paragraph one.", "Synthetic original paragraph two."],
    },
    zhTW: { name: "樣本原文祈願術", entries: [null, "合成的原文第二段。"] },
  },
  "spell:alarm": {
    source: "XPHB",
    en: { material: "a synthetic bell" },
    zhTW: { material: "一個合成的鈴鐺" },
  },
  "creature:owl": {
    source: "XMM",
    en: {
      entries: [{ type: "entries", name: "Sample Flyby", entries: ["Synthetic original trait."] }],
      meta: { passive: 13, senses: ["Darkvision 60 ft."], hp: { average: 2 } },
      lore: [{ type: "entries", name: "Habitat", entries: ["Synthetic owl lore."] }],
    },
    zhTW: { meta: { senses: ["黑暗視覺 60 呎"] }, lore: [null] },
  },
  "class:bard": {
    source: "XPHB",
    en: { lore: [{ type: "entries", name: "Sample Bards", entries: ["Synthetic class lore."] }] },
    zhTW: { lore: [{ type: "entries", name: "樣本吟遊詩人", entries: ["合成的職業背景故事。"] }] },
  },
};

const spellLevels = new Map([["wish", 9], ["alarm", 1]]);

describe("ReferenceSources with pack overlays", () => {
  it("shows the XPHB overlay over a built-in spell, with the SRD blocks kept for the toggle", async () => {
    const sources = new ReferenceSources([createBuiltinSource(spellLevels, overlays)]);
    const en = await sources.resolve("spell:wish", "en");
    expect(en).toMatchObject({ origin: "srd", textSource: "xphb", overlayName: "Sample Original Wish", name: "Wish" });
    expect(en!.blocks.map((block) => block.block)).toEqual(["Synthetic original paragraph one.", "Synthetic original paragraph two."]);
    expect(en!.blocks.every((block) => !block.english)).toBe(true);
    expect(en!.srdBlocks).toHaveLength(5);
    expect(String(en!.srdBlocks![0].block)).toMatch(/^Wish is the mightiest spell/);

    const zh = await sources.resolve("spell:wish", "zh-TW");
    expect(zh).toMatchObject({ textSource: "xphb", overlayName: "樣本原文祈願術" });
    // Sparse zh-TW: block 0 falls back to the overlay's English, not to the SRD translation.
    expect(zh!.blocks).toEqual([
      { block: "Synthetic original paragraph one.", english: true },
      { block: "合成的原文第二段。", english: false },
    ]);
    // The toggle shows the SRD version in the viewer's language.
    expect(zh!.srdBlocks![0]).toMatchObject({ english: false });
  });

  it("shows the overlay's material component, the SRD one for the toggle", async () => {
    const sources = new ReferenceSources([createBuiltinSource(spellLevels, overlays)]);
    const en = await sources.resolve("spell:alarm", "en");
    expect((en!.meta.components as { mText?: string }).mText).toBe("a synthetic bell");
    expect((en!.srdMeta!.components as { mText?: string }).mText).toBe("a bell and silver wire");
    expect(en!.blocks).toEqual(en!.srdBlocks);
    const zh = await sources.resolve("spell:alarm", "zh-TW");
    expect((zh!.meta.components as { mText?: string }).mText).toBe("一個合成的鈴鐺");
  });

  it("shows the XMM overlay of a built-in creature with its meta over the SRD meta, and the SRD meta for the toggle", async () => {
    const sources = new ReferenceSources([createBuiltinSource(spellLevels, overlays)]);
    const en = await sources.resolve("creature:owl", "en");
    expect(en).toMatchObject({ kind: "creature", origin: "srd", textSource: "xmm" });
    expect(en!.blocks.map((block) => (block.block as { name: string }).name)).toEqual(["Sample Flyby"]);
    expect(en!.srdBlocks!.map((block) => (block.block as { name: string }).name)).toEqual(["Flyby", "Talons"]);
    expect(en!.meta).toMatchObject({ passive: 13, senses: ["Darkvision 60 ft."], hp: { average: 2 }, ac: [11] });
    expect(en!.srdMeta).toMatchObject({ passive: 15, senses: ["Darkvision 120 ft."], hp: { average: 1, formula: "1d4 - 1" } });
    expect(en!.lore).toEqual([{ block: overlays["creature:owl"].en.lore![0], english: false }]);

    const zh = await sources.resolve("creature:owl", "zh-TW");
    expect(zh!.meta).toMatchObject({ passive: 13, senses: ["黑暗視覺 60 呎"] });
    expect(zh!.lore).toEqual([{ block: overlays["creature:owl"].en.lore![0], english: true }]);
  });

  it("shows habitat and treasure with lore but without a wording toggle", async () => {
    const meta = { habitat: ["Sample marsh"], treasure: ["Sample trinkets"] };
    const source = createBuiltinSource(new Map(), { "creature:owl": { source: "XMM", en: { meta, lore: ["Sample lore."] } } });
    const result = await source.resolve("creature:owl", "en");
    expect(result).toMatchObject({ meta, lore: [{ block: "Sample lore." }] });
    expect(result?.textSource).toBeUndefined();
    expect(result?.srdBlocks).toBeUndefined();
  });

  it("replaces a nested English metadata field whole", async () => {
    const source = createBuiltinSource(new Map(), { "spell:wish": { source: "XPHB", en: { meta: { components: { sample: true } } } } });
    const result = await source.resolve("spell:wish", "en");
    expect(result?.meta.components).toEqual({ sample: true });
  });

  it("adds lore from a lore-only overlay without replacing the SRD text", async () => {
    const sources = new ReferenceSources([createBuiltinSource(spellLevels, overlays)]);
    const zh = await sources.resolve("class:bard", "zh-TW");
    expect(zh?.textSource).toBeUndefined();
    expect(zh!.srdBlocks).toBeUndefined();
    expect(zh!.overlayName).toBeUndefined();
    expect(zh!.lore).toEqual([{ block: overlays["class:bard"].zhTW!.lore![0], english: false }]);
    expect(zh!.blocks.length).toBeGreaterThan(0);
  });

  it("shows SRD text only without the pack", async () => {
    const sources = new ReferenceSources([createBuiltinSource(spellLevels)]);
    const en = await sources.resolve("creature:owl", "en");
    expect(en).toMatchObject({ kind: "creature", origin: "srd", lore: [] });
    expect(en!.textSource).toBeUndefined();
    expect(en!.srdBlocks).toBeUndefined();
    expect(en!.blocks.map((block) => (block.block as { name: string }).name)).toEqual(["Flyby", "Talons"]);
  });

  it("resolves an include node to the overlaid entry, toggle data included", async () => {
    const sources = new ReferenceSources([createBuiltinSource(spellLevels, overlays)]);
    const included = await sources.resolveInclude({ type: "include", ref: "creature:owl" }, "en");
    expect(included).toMatchObject({ ref: "creature:owl", textSource: "xmm" });
    expect(included!.srdBlocks).toHaveLength(2);
    expect(await sources.resolveInclude({ type: "entries", entries: [] }, "en")).toBeNull();
    expect(await sources.resolveInclude({ type: "include", ref: "creature:sample-nothing" }, "en")).toBeNull();
  });

  it("resolves the built-in lazy kinds: creatures, magic items, tables and chapters", async () => {
    const sources = new ReferenceSources([createBuiltinSource(spellLevels)]);
    for (const ref of [
      "creature:aboleth",
      "creature:zombie",
      "item:bag-of-holding",
      "item:2-wand-of-the-war-mage",
      "item:rope",
      "table:skills",
      "chapter:srd/playing-the-game",
      "chapter:srd/monsters/stat-block-overview",
    ]) {
      expect(await sources.resolve(ref, "zh-TW"), ref).toMatchObject({ ref, origin: "srd" });
    }
    expect(await sources.resolve("chapter:xphb/sample-chapter", "en")).toBeNull();
  });

  it("reads a pack creature's lore and zh-TW meta", async () => {
    const entry = {
      kind: "creature" as const, id: "sample-mire-lurker", ref: "creature:sample-mire-lurker", name: "Sample Mire Lurker",
      entries: [{ type: "entries", name: "Bite", entries: ["Synthetic bite."] }],
      meta: { languages: ["None"], hp: { average: 22, formula: "4d8 + 4" } },
      lore: [{ type: "entries", name: "Sample", entries: ["Synthetic lore."] }],
    };
    const sources = new ReferenceSources([
      createBuiltinSource(spellLevels),
      createPackSource([entry], { [entry.ref]: { name: "樣本泥沼潛伏者", entries: [null], meta: { languages: ["無"] }, lore: [null] } }),
    ]);
    const zh = await sources.resolve(entry.ref, "zh-TW");
    expect(zh).toMatchObject({ origin: "pack", localizedName: "樣本泥沼潛伏者", meta: { languages: ["無"], hp: { average: 22 } } });
    expect(zh!.lore).toEqual([{ block: entry.lore[0], english: true }]);
  });
});
