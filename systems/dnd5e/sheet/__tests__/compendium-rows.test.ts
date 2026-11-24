import { describe, expect, it } from "vitest";
import type { LoadedSystem } from "@skald/types/system";
import { loadDnd5e2024Data } from "../../data-access/builtin-local-data";
import { buildCompendiumRow } from "../compendium-rows";
import { collectReferenceRows } from "../dnd-sheet-adapter";
import type { GameSpell } from "../use-reference-context";

describe("dnd5e-2024 compendium and reference rows", () => {
  it("appends a built-in spell row with its list fields from the wizard spell data", async () => {
    const data = await loadDnd5e2024Data();
    const system = { schema: data.schema, gameData: data.gameData } as unknown as LoadedSystem;
    const gameSpells = new Map(
      (data.gameData?.spells as GameSpell[]).map((spell) => [spell.id, spell]),
    );
    const token = (value: unknown) => String(value).replace(/^\{\{i18n:.*\.(.+)\}\}$/, "$1");
    const built = buildCompendiumRow("spells", "spell:fireball", "Fireball", system, { gameSpells, token });
    expect(built?.list).toBe("spells");
    expect(built?.row).toMatchObject({
      name: "Fireball", ref: "spell:fireball", origin: "srd", text: "", level: 3, prepared: false,
      castingTime: "1-action", range: "point-150-feet", concentration: false, ritual: false, material: true,
    });
    expect(String(built?.row.id)).toMatch(/^spell_/);
    const feat = buildCompendiumRow("feats", "feat:alert", "Alert", system, { gameSpells, token });
    expect(feat?.row).toMatchObject({ category: "origin", origin: "srd" });
    const feature = buildCompendiumRow("features", "classFeature:fighter/second-wind-l1", "Second Wind", system, { gameSpells, token });
    expect(feature?.row).toMatchObject({ level: 1 });
  });

  it("collects the character's named rows for the reference browser", () => {
    const rows = collectReferenceRows({
      feats: [{ id: "f1", name: "Alert", ref: "feat:alert", origin: "srd", text: "" }],
      spells: [{ id: "s1", name: "Hex", ref: "spell:hex", origin: "pack", text: "You place a curse…" }, { id: "s2" }],
      notes: "ignored",
    });
    expect(rows).toEqual([
      { list: "feats", name: "Alert", ref: "feat:alert", origin: "srd", text: "" },
      { list: "spells", name: "Hex", ref: "spell:hex", origin: "pack", text: "You place a curse…" },
    ]);
  });
});
