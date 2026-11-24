import { describe, expect, it, vi } from "vitest";
import { zhWithheld } from "../../__tests__/zh-withheld";
import { createBuiltinSource, createPackSource, spellLevelsFrom, type ReferenceSource } from "../../reference/sources";
import spells from "@skald/system-dnd5e/data/dnd5e-2024/game/spells.json";
import { EDITED_FEATURE_TEXT, PACK_SPELL_REF, PACK_SPELL_TEXT_EN, PACK_SPELL_TEXT_ZH, PRINT_PACK, dndPrintOverrides } from "@skald/sheet-sdk/testing/fixtures/dnd-print/characters";
import type { CorpusEntry, CorpusOverlay } from "../../reference/load-corpus";
import { bodySource, loadCantripFacts, loadPrintText, loadPrintTexts, type PrintTextDeps } from "../print-text";

const srd = createBuiltinSource(spellLevelsFrom(spells));
const packSource = () => createPackSource(PRINT_PACK.entries as unknown as CorpusEntry[], PRINT_PACK.zhTW as unknown as Record<string, CorpusOverlay>);
const wizard = dndPrintOverrides("wizard");
const rowsOf = (list: string) => wizard[list] as Array<Record<string, unknown>>;

function deps(locale: string, pack: (() => Promise<ReferenceSource | null>) = async () => null): PrintTextDeps {
  return { locale, srd, pack, options: {} };
}

describe("rule T: where a row's printed text comes from", () => {
  it("the player's text, then the row's own text, then the reference", () => {
    expect(bodySource({ ref: "spell:shield", origin: "srd", playerText: "我的護盾", text: "" })).toEqual({ kind: "own", text: "我的護盾" });
    expect(bodySource({ ref: "spell:shield", origin: "srd", playerText: "  ", text: "存下的" })).toEqual({ kind: "own", text: "存下的" });
    expect(bodySource({ ref: "spell:shield", origin: "srd", text: "" })).toEqual({ kind: "srd", ref: "spell:shield", fragment: "" });
    expect(bodySource({ id: "species:elf#trance", ref: "species:elf", origin: "srd" })).toEqual({ kind: "srd", ref: "species:elf", fragment: "trance" });
    expect(bodySource({ ref: PACK_SPELL_REF, origin: "pack", text: "" })).toEqual({ kind: "pack", ref: PACK_SPELL_REF, fragment: "" });
    expect(bodySource({ id: "species:pack-folk#star-ward", ref: "species:pack-folk", origin: "pack" })).toEqual({ kind: "pack", ref: "species:pack-folk", fragment: "star-ward" });
    expect(bodySource({ name: "法術書", ref: "", origin: "custom", text: "" })).toEqual({ kind: "none" });
  });
});

describe("loadPrintText", () => {
  it("a table copy's pack trait row (no text, D9) prints its own section of the device's pack", async () => {
    const source: ReferenceSource = {
      origin: "pack",
      resolve: async (ref) => ({
        ref, kind: "species", id: "pack-folk", origin: "pack", name: "Pack Folk", higherLevel: [], meta: {}, lore: [],
        blocks: [
          { block: { type: "entries", name: "Star Ward", entries: ["Ward words."] }, english: true },
          { block: { type: "entries", name: "Darkvision", entries: ["Sixty feet."] }, english: true },
        ],
      }),
    };
    const row = { id: "species:pack-folk#star-ward", name: "Star Ward", ref: "species:pack-folk", origin: "pack" };
    const result = await loadPrintText(row, deps("en", async () => source));
    expect(result.status).toBe("ok");
    expect(result.body).toBe("Ward words.");
    expect((await loadPrintText(row, deps("en"))).status).toBe("packMissing");
  });

  it.skipIf(zhWithheld("corpus/zh-TW/classFeature-wizard.json"))("an SRD feature prints the corpus text in the viewer's locale", async () => {
    const row = rowsOf("features")[0];
    const zh = await loadPrintText(row, deps("zh-TW"));
    const en = await loadPrintText(row, deps("en"));
    expect(en.status).toBe("ok");
    expect(en.body).toContain("As a student of arcane magic");
    expect(zh.status).toBe("ok");
    expect(zh.body).toMatch(/\p{Script=Han}/u);
    expect(zh.body).not.toContain("As a student of arcane magic");
  });

  it("prints the whole text, past the 8,000-character row snapshot cap", async () => {
    const long = `${"Rules text. ".repeat(900)}The end.`;
    const source: ReferenceSource = {
      origin: "srd",
      resolve: async (ref) => ({ ref, kind: "feat", id: "long", origin: "srd", name: "Long", blocks: [{ block: long, english: false }], higherLevel: [], meta: {}, lore: [] }),
    };
    const result = await loadPrintText({ ref: "feat:long", origin: "srd" }, { locale: "en", srd: source, pack: async () => null, options: {} });
    expect(result.body.length).toBeGreaterThan(10_000);
    expect(result.body.endsWith("The end.")).toBe(true);
  });

  it("a row with saved text prints that text only", async () => {
    const row = rowsOf("features")[2];
    const srdResolve = vi.spyOn(srd, "resolve");
    const result = await loadPrintText(row, deps("zh-TW"));
    expect(result).toEqual({ status: "ok", body: EDITED_FEATURE_TEXT, higher: "", meta: null });
    expect(srdResolve).not.toHaveBeenCalled();
    srdResolve.mockRestore();
  });

  it("a pack row's snapshot saved before B-001 prints with today's heads, and the row keeps its text (PT2R-F005)", async () => {
    const row = { ref: PACK_SPELL_REF, origin: "pack", text: "戲法. 自選三道。\n• 專長：. 警覺" };
    const result = await loadPrintText(row, deps("zh-TW"));
    expect(result.body).toBe("戲法：自選三道。\n• 專長：警覺");
    expect(row.text).toBe("戲法. 自選三道。\n• 專長：. 警覺");
  });

  it("a species trait row prints its own block", async () => {
    const result = await loadPrintText(rowsOf("speciesTraits")[3], deps("en"));
    expect(result.body).toMatch(/^You don't need to sleep/);
    expect(result.body).not.toContain("Darkvision");
  });

  it("a spell carries its higher-level text and its meta", async () => {
    const fireball = rowsOf("spells").find((spell) => spell.ref === "spell:fireball")!;
    const result = await loadPrintText(fireball, deps("en"));
    expect(result.body).toContain("A bright streak flashes");
    expect(result.higher).toContain("The damage increases by 1d6");
    expect(result.meta).toMatchObject({ level: 3, school: "V" });
  });

  it("a pack row without text prints the cached pack's text, and a notice without the pack", async () => {
    const row = rowsOf("spells").find((spell) => spell.ref === PACK_SPELL_REF)!;
    const zh = await loadPrintText(row, deps("zh-TW", async () => packSource()));
    expect(zh.status).toBe("ok");
    expect(zh.body).toContain(PACK_SPELL_TEXT_ZH);
    expect(zh.meta).toMatchObject({ school: "D" });
    const en = await loadPrintText(row, deps("en", async () => packSource()));
    expect(en.body).toContain(PACK_SPELL_TEXT_EN);
    expect(await loadPrintText(row, deps("zh-TW"))).toEqual({ status: "packMissing", body: "", higher: "", meta: null });
    // the row itself is never written
    expect(row.text).toBe("");
  });

  it("loads the pack once for all rows and keeps going when one row fails", async () => {
    const pack = vi.fn(async () => packSource());
    const broken: ReferenceSource = { origin: "srd", resolve: () => Promise.reject(new Error("chunk failed")) };
    const texts = await loadPrintTexts(
      [
        { key: "a", row: { ref: PACK_SPELL_REF, origin: "pack" } },
        { key: "b", row: { ref: PACK_SPELL_REF, origin: "pack" } },
        { key: "c", row: { ref: "spell:shield", origin: "srd" } },
      ],
      { locale: "en", srd: broken, pack, options: {} },
    );
    expect(pack).toHaveBeenCalledTimes(1);
    expect(texts.get("a")?.status).toBe("ok");
    expect(texts.get("c")).toEqual({ status: "none", body: "", higher: "", meta: null });
  });
});

const trait = (species: string, slug: string, index: number) => ({
  key: `speciesTraits:${index}`,
  row: { id: `species:${species}#${slug}`, ref: `species:${species}`, name: slug, origin: "srd", text: "" },
});
const lineageRow = (ref: string, index: number) => ({ key: `speciesTraits:${index}`, row: { id: ref, ref, name: ref, origin: "srd", text: "" } });

describe("rule L: a lineage's traits print once, in the lineage's version", () => {
  it.skipIf(zhWithheld("corpus/zh-TW/lineage.json"))("brass dragonborn: the lineage's blocks replace the generic traits of the same name, and the lineage row is dropped", async () => {
    const entries = [
      trait("dragonborn", "draconic-ancestry", 0),
      trait("dragonborn", "breath-weapon", 1),
      trait("dragonborn", "damage-resistance", 2),
      trait("dragonborn", "darkvision", 3),
      trait("dragonborn", "draconic-flight", 4),
      lineageRow("lineage:dragonborn/brass", 5),
    ];
    const en = await loadPrintTexts(entries, deps("en"));
    expect(en.get("speciesTraits:5")?.status).toBe("merged");
    expect(en.get("speciesTraits:2")).toMatchObject({ status: "ok", body: "You have Resistance to Fire damage.", lineage: "speciesTraits:5" });
    // the same text as the generic trait: replaced, not tagged
    expect(en.get("speciesTraits:3")).toMatchObject({ status: "ok", body: "You have Darkvision with a range of 60 feet." });
    expect(en.get("speciesTraits:3")?.lineage).toBeUndefined();
    // a trait the lineage does not repeat keeps the species' text (the ancestors table)
    expect(en.get("speciesTraits:0")?.body).toContain("Draconic Ancestors");
    const zh = await loadPrintTexts(entries, deps("zh-TW"));
    expect(zh.get("speciesTraits:2")?.body).toContain("火焰");
    expect(zh.get("speciesTraits:5")?.status).toBe("merged");
    // printed once: no trait text appears twice
    const bodies = [...zh.values()].filter((text) => text.status === "ok").map((text) => text.body);
    expect(new Set(bodies).size).toBe(bodies.length);
  });

  it("high elf: Elven Lineage (High Elf) replaces the three-lineage Elven Lineage trait", async () => {
    const entries = [
      trait("elf", "darkvision", 0),
      trait("elf", "elven-lineage", 1),
      trait("elf", "fey-ancestry", 2),
      trait("elf", "keen-senses", 3),
      trait("elf", "trance", 4),
      lineageRow("lineage:elf/high-elf-lineage", 5),
    ];
    const en = await loadPrintTexts(entries, deps("en"));
    expect(en.get("speciesTraits:1")).toMatchObject({ status: "ok", lineage: "speciesTraits:5" });
    expect(en.get("speciesTraits:1")?.body).toContain("Prestidigitation");
    expect(en.get("speciesTraits:1")?.body).not.toContain("Wood Elf");
    expect(en.get("speciesTraits:5")?.status).toBe("merged");
  });

  it("a lineage without its traits on the sheet keeps its own row; a trait the player rewrote keeps the player's text", async () => {
    const alone = await loadPrintTexts([lineageRow("lineage:elf/high-elf-lineage", 0)], deps("en"));
    expect(alone.get("speciesTraits:0")).toMatchObject({ status: "ok" });
    expect(alone.get("speciesTraits:0")?.body).toContain("Prestidigitation");
    const own = { key: "speciesTraits:1", row: { ...trait("elf", "elven-lineage", 1).row, playerText: "我的血統筆記" } };
    const texts = await loadPrintTexts([trait("elf", "darkvision", 0), own, lineageRow("lineage:elf/high-elf-lineage", 2)], deps("en"));
    expect(texts.get("speciesTraits:1")).toMatchObject({ body: "我的血統筆記" });
    // what the player's text kept from the lineage still prints on the lineage row
    expect(texts.get("speciesTraits:2")?.status).toBe("ok");
    expect(texts.get("speciesTraits:2")?.body).toContain("Prestidigitation");
    expect(texts.get("speciesTraits:2")?.body).not.toContain("Darkvision");
  });
});

describe("rule L with a trait row that is not SRD (POR-F007)", () => {
  it("a lineage block whose trait row is a pack or custom row prints once, on the lineage row", async () => {
    for (const origin of ["pack", "custom"] as const) {
      const other = { key: "speciesTraits:1", row: { ...trait("elf", "elven-lineage", 1).row, origin } };
      const texts = await loadPrintTexts([trait("elf", "darkvision", 0), other, lineageRow("lineage:elf/high-elf-lineage", 2)], { ...deps("en"), pack: async () => null });
      expect(texts.get("speciesTraits:2")?.status, origin).toBe("ok");
      expect(texts.get("speciesTraits:2")?.body, origin).toContain("Prestidigitation");
      // the trait row keeps its own (pack or custom) text: the lineage's version is not on it
      expect(texts.get("speciesTraits:1")?.body ?? "", origin).not.toContain("Prestidigitation");
    }
  });
});

describe("cantrip facts: the save and the damage type from the English rules text", () => {
  it("reads an attack cantrip, a save cantrip and one whose damage type is chosen", async () => {
    const facts = await loadCantripFacts(["spell:fire-bolt", "spell:acid-splash", "spell:vicious-mockery", "spell:sorcerous-burst", "spell:nope"], deps("zh-TW"));
    expect(facts.get("spell:fire-bolt")).toEqual({ save: null, damageType: "fire" });
    expect(facts.get("spell:acid-splash")).toEqual({ save: "dex", damageType: "acid" });
    expect(facts.get("spell:vicious-mockery")).toEqual({ save: "wis", damageType: "psychic" });
    expect(facts.get("spell:sorcerous-burst")).toEqual({ save: null, damageType: null });
    expect(facts.has("spell:nope")).toBe(false);
  });
});
