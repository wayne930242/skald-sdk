import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import defaultData from "@skald/system-dnd5e/data/dnd5e-2024/default-data.json";
import spells from "@skald/system-dnd5e/data/dnd5e-2024/game/spells.json";
import { dndPrintOverrides } from "@skald/sheet-sdk/testing/fixtures/dnd-print/characters";
import { buildDndPrintModel } from "../print-model";
import { Page2 } from "../page-2";
import type { PrintLabels } from "../print-labels";

/** CLASS-IMPL §7.5 M5: page 2 prints one casting line per casting class. */

/** The wizard fixture as Wizard 3 (INT 18, the sheet's spell fields) / Cleric 2 (WIS 12), level 5. */
function multiclassModel(extra: Record<string, unknown> = {}) {
  return buildDndPrintModel({
    values: {
      ...defaultData,
      ...dndPrintOverrides("wizard"),
      intMod: 4, wisMod: 1, profBonus: 3, spellMod: 4, spellSaveDc: 15, spellAttack: 7,
      multiclass: [{ id: "class-1", classId: "cleric", ref: "class:cleric", origin: "srd", name: "牧師", subclass: "", level: 2, hitDie: 8, hitDiceSpent: 0, spellAbility: "wis" }],
      ...extra,
    },
    blanks: false,
    nameOf: (row) => String(row.name ?? ""),
    gameData: { spells } as Record<string, unknown>,
    catalog: null,
  });
}

const labels: PrintLabels = {
  print: (key) => key,
  sheet: (key) => ({ "option.spellAbility.int": "智力", "option.spellAbility.wis": "睿知" })[key] ?? key,
  stats: {} as PrintLabels["stats"],
  list: (items) => items.join("、"),
};

describe("multiclass casting on print (CLASS-IMPL §7.5 M5)", () => {
  it("the model carries one casting line per casting class, starting class first", () => {
    expect(multiclassModel().spellcasting?.classes).toEqual([
      { name: "法師", ability: "int", mod: 4, dc: 15, attack: 7 },
      { name: "牧師", ability: "wis", mod: 1, dc: 12, attack: 4 },
    ]);
  });

  it("a non-casting extra class adds no line; a single-class sheet has no lines", () => {
    const fighter = [{ id: "class-1", classId: "fighter", ref: "class:fighter", origin: "srd", name: "戰士", subclass: "", level: 2, hitDie: 10, hitDiceSpent: 0, spellAbility: "none" }];
    expect(multiclassModel({ multiclass: fighter }).spellcasting?.classes).toEqual([{ name: "法師", ability: "int", mod: 4, dc: 15, attack: 7 }]);
    expect(multiclassModel({ multiclass: [] }).spellcasting).not.toHaveProperty("classes");
  });

  it("page 2 prints two casting lines", () => {
    const html = renderToStaticMarkup(
      <Page2 model={multiclassModel()} labels={labels} paper="A4" frames={{}} portrait={null} attribution="" carry="" />,
    );
    const lines = [...html.matchAll(/data-print-casting-line[^>]*>(.*?)<\/div>/g)].map((match) => match[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
    expect(lines).toEqual(["法師 · 智力 +4 DC 15 · +7", "牧師 · 睿知 +1 DC 12 · +4"]);
  });
});
