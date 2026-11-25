import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import defaultData from "@skald/system-dnd5e/data/dnd5e-2024/default-data.json";
import spells from "@skald/system-dnd5e/data/dnd5e-2024/game/spells.json";
import { dndPrintOverrides } from "@skald/sheet-sdk/testing/fixtures/dnd-print/characters";
import { buildDndPrintModel } from "../print-model";
import { Page2 } from "../page-2";
import { Page1 } from "../page-1";
import { IDENTITY_FIELDS } from "../content";
import { sheetNamesFrom } from "../../sheet/play/sheet-names";
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

/**
 * UAT item 1 and M10: Fighter 3 (a subclass with its own Spellcasting, INT 16) / Wizard 1 created in zh-TW and printed in
 * English; m17 / M13: the hit dice box prints one line per die.
 */
function spellBladeModel(blanks = false) {
  return buildDndPrintModel({
    values: {
      ...defaultData,
      level: 4, classId: "fighter", className: "戰士", subclass: "zh-spell-blade", hitDieFaces: 10, hitDiceSpent: 1,
      speciesId: "elf", species: "精靈", backgroundId: "sage", background: "智者",
      spellAbility: "none", spellMod: 0, spellSaveDc: 0, spellAttack: 0, intMod: 3, profBonus: 2,
      features: [{ id: "f1", ref: "subclassFeature:fighter/spell-blade/spellcasting-l3", name: "施法", origin: "pack" }],
      multiclass: [{ id: "class-1", classId: "wizard", ref: "class:wizard", origin: "srd", name: "法師", subclass: "", level: 1, hitDie: 6, hitDiceSpent: 0, spellAbility: "int" }],
    },
    blanks,
    nameOf: (row) => String(row.name ?? ""),
    gameData: { spells } as Record<string, unknown>,
    catalog: null,
    casting: {
      names: sheetNamesFrom({
        class: { fighter: "Fighter", wizard: "Wizard" },
        subclass: { "fighter/spell-blade": "Spell Blade" },
        species: { elf: "Elf" },
        background: { sage: "Sage" },
      }),
    },
  });
}

describe("subclass casting and per-die hit dice on print (UAT)", () => {
  it("page 2 has a casting line for the subclass caster and one for the Wizard", () => {
    expect(spellBladeModel().spellcasting?.classes).toEqual([
      { name: "Fighter", ability: "int", mod: 3, dc: 13, attack: 5 },
      { name: "Wizard", ability: "int", mod: 3, dc: 13, attack: 5 },
    ]);
  });

  it("the identity prints in the viewer's locale: classes in the class box, subclasses in the subclass box", () => {
    expect(spellBladeModel().identity).toMatchObject({ className: "Fighter 3 / Wizard 1", subclass: "Spell Blade", species: "Elf", background: "Sage" });
  });

  it("the hit dice box prints one line per die, its labels above the values", () => {
    const model = spellBladeModel();
    expect(model.hitDicePools).toEqual([
      { faces: 10, max: 3, spent: 1 },
      { faces: 6, max: 1, spent: 0 },
    ]);
    const identity = { fields: IDENTITY_FIELDS.map((id) => ({ id, label: id, value: "" })), fits: null };
    const html = renderToStaticMarkup(<Page1 model={model} labels={labels} paper="A4" frames={{}} identity={identity} />);
    const box = /data-print-hit-dice-lines[^>]*>(.*?)<\/div>/.exec(html)?.[1] ?? "";
    const cells = [...box.matchAll(/<span[^>]*>(.*?)<\/span>/g)].map((match) => match[1]);
    expect(cells).toEqual(["", "hitDice.spent", "hitDice.max", "d10", "1", "3", "d6", "0", "1"]);
    // Blank for pencil: no spent dice printed.
    const blank = renderToStaticMarkup(<Page1 model={spellBladeModel(true)} labels={labels} paper="A4" frames={{}} identity={identity} />);
    expect(/data-print-hit-die="10"[^>]*>d10<\/span><span[^>]*><\/span>/.test(blank)).toBe(true);
  });
});
