import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  corpusPartCandidates,
  loadCorpusParts,
  loadEnglishCorpus,
  loadEnglishIndex,
  loadLocalizedIndex,
  loadOverlay,
  loadReferenceNames,
} from "../load-corpus";

/** The part manifest (`corpus/parts.json`, plan T2b §2.3) and the lazy name sources at runtime. */

// The package root runs the tests: apps/web here, systems/dnd5e in the public tree.
const dataDir = join(process.cwd(), "data", "dnd5e-2024");
const readJson = <T>(path: string): T => JSON.parse(readFileSync(join(dataDir, path), "utf8")) as T;
const manifest = readJson<Record<string, Record<string, string>>>("corpus/parts.json");

describe("corpus parts", () => {
  it("loads parts.json through its own literal dynamic import", async () => {
    const loader = readFileSync(join(__dirname, "..", "load-corpus.ts"), "utf8");
    // Built from parts: plugin code other than load-corpus.ts may not name the corpus path (budgets test).
    // The package prefix is `@` here and `@skald/system-dnd5e` in the public tree.
    const parts = ["data", "dnd5e-2024", "corpus", "parts.json"].join("/").replace(/[./]/g, "\\$&");
    expect(loader).toMatch(new RegExp(`import\\("@(?:skald/system-dnd5e)?/${parts}"\\)`));
    expect(await loadCorpusParts()).toEqual(manifest);
  });

  it("has an English and a zh-TW literal case for every part the manifest names", async () => {
    const parts = new Set(Object.values(manifest).flatMap((map) => Object.values(map)));
    expect(parts.size).toBeGreaterThan(10);
    for (const part of [...parts, "table"]) {
      expect(await loadEnglishCorpus(part), part).not.toBeNull();
      expect(await loadOverlay("zh-TW", part), part).not.toBeNull();
    }
  });

  it("finds the part of every built-in creature, magic item and chapter from the manifest", async () => {
    const parts = await loadCorpusParts();
    for (const file of readdirSync(join(dataDir, "corpus", "en"))) {
      const chunk = readJson<Record<string, { kind: Parameters<typeof corpusPartCandidates>[0]; id: string; meta?: { level?: number } }>>(`corpus/en/${file}`);
      for (const [ref, entry] of Object.entries(chunk)) {
        if (!["creature", "item", "chapter", "table"].includes(entry.kind)) continue;
        expect(corpusPartCandidates(entry.kind, entry.id, parts), ref).toContain(file.replace(/\.json$/, ""));
      }
    }
    expect(corpusPartCandidates("chapter", "xphb/sample-chapter", parts)).toEqual([]);
  });

  it("loads the lazy name sources: the reference catalog and the creature and magic item indexes", async () => {
    const en = await loadReferenceNames("en");
    expect(en.creature?.owl).toBe("Owl");
    expect(en.item?.["bag-of-holding"]).toBe("Bag of Holding");
    expect(en.table?.skills).toBe("Skills");
    expect(en.chapter?.["srd/playing-the-game"]).toBe("Playing the Game");
    const zh = await loadReferenceNames("zh-TW");
    const zhCreatures = (await loadLocalizedIndex("zh-TW", "creature")) as Record<string, { name: string }>;
    expect(zh.creature?.owl).toBe(zhCreatures.owl.name);
    expect(Object.keys(zh.creature ?? {}).sort()).toEqual(Object.keys((await loadEnglishIndex("creature")) ?? {}).sort());
    expect(Object.keys(zh.item ?? {}).sort()).toEqual(Object.keys((await loadEnglishIndex("item-magic")) ?? {}).sort());
  });
});
