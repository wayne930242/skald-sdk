import { describe, expect, it } from "vitest";
import { casterKindOf, combinedSlots, SUBCLASS_SPELLCASTING_FEATURE, subclassCasting, subclassCastingOf } from "../../../reference/multiclass";
import { castingClasses, spellCasting, spellSourceOf } from "../casting-classes";
import { classLine, subclassLine } from "../class-model";
import { spellLibrary } from "../spells-tab";
import { originName, sheetNamesFrom, subclassIdOf } from "../sheet-names";

/**
 * UAT item 1 (astra Major): casting a subclass grants counts as a casting class on a multiclass sheet.
 * `fighter/spell-blade` stands in for a built-in subclass with its own Spellcasting feature.
 */

const BLADE_FEATURES = [
  { id: "f1", ref: "classFeature:fighter/second-wind-l1", name: "Second Wind" },
  { id: "f2", ref: "subclassFeature:fighter/spell-blade/spellcasting-l3", name: "Spellcasting" },
];

/** Fighter 3 (Spell Blade, INT 16) / Wizard 1, level 4, proficiency +2. */
const FIGHTER_BLADE_WIZARD = {
  level: 4,
  classId: "fighter",
  className: "Fighter",
  subclass: "Spell Blade",
  spellAbility: "none",
  spellMod: 0,
  spellSaveDc: 0,
  spellAttack: 0,
  int: 16,
  intMod: 3,
  profBonus: 2,
  features: BLADE_FEATURES,
  multiclass: [{ id: "class_w", classId: "wizard", ref: "class:wizard", origin: "srd", name: "Wizard", subclass: "", level: 1, hitDie: 6, hitDiceSpent: 0, spellAbility: "int" }],
};

describe("subclass-granted spellcasting", () => {
  it("a subclass's own Spellcasting feature or a homebrew subclass's meta makes a third caster", () => {
    expect(SUBCLASS_SPELLCASTING_FEATURE.exec("subclassFeature:fighter/spell-blade/spellcasting-l3")?.[1]).toBe("fighter/spell-blade");
    expect(SUBCLASS_SPELLCASTING_FEATURE.test("subclassFeature:fighter/champion/improved-critical-l3")).toBe(false);
    expect(SUBCLASS_SPELLCASTING_FEATURE.test("classFeature:wizard/spellcasting-l1")).toBe(false);
    expect(subclassCastingOf({}, true)).toEqual({ kind: "third", ability: "int", list: "wizard" });
    expect(subclassCastingOf({}, false)).toBeNull();
    expect(subclassCastingOf({ spellcasting: { progression: "third", ability: "wis", list: "druid" } })).toEqual({ kind: "third", ability: "wis", list: "druid" });
    expect(casterKindOf(undefined, { spellcasting: { progression: "third" } })).toBe("third");
    expect(casterKindOf(undefined, {})).toBeNull();
  });

  it("one rule for level-up and the sheet: the meta, or the subclass's own Spellcasting feature", () => {
    const refs = BLADE_FEATURES.map((feature) => feature.ref);
    expect(subclassCasting("fighter/spell-blade", {}, refs)).toEqual({ kind: "third", ability: "int", list: "wizard" });
    // Another subclass's Spellcasting feature does not count.
    expect(subclassCasting("fighter/champion", {}, refs)).toBeNull();
    expect(subclassCasting("fighter/champion", { spellcasting: { progression: "third", ability: "cha" } }, [])).toEqual({ kind: "third", ability: "cha" });
  });

  it("Fighter 3 (third caster) + Wizard 1: two caster levels, three 1st-level slots", () => {
    const rows = [
      { classId: "fighter", level: 3, kind: "third" as const },
      { classId: "wizard", level: 1, kind: "full" as const },
    ];
    expect(combinedSlots(rows, () => null)?.slice(0, 2)).toEqual([3, 0]);
  });

  it("Fighter 3 (a subclass with Spellcasting) + Wizard 1 shows two casting sources", () => {
    expect(castingClasses(FIGHTER_BLADE_WIZARD)).toEqual([
      { castingClass: "", classId: "fighter", name: "Fighter", ability: "int", mod: 3, dc: 13, attack: 5 },
      { castingClass: "wizard", classId: "wizard", name: "Wizard", ability: "int", mod: 3, dc: 13, attack: 5 },
    ]);
    // A spell of the starting class casts with the subclass's numbers, not the empty flat fields.
    expect(spellCasting(FIGHTER_BLADE_WIZARD, { castingClass: "" })).toEqual({ mod: 3, dc: 13, attack: 5 });
  });

  it("a homebrew third caster casts with the ability its entry names", () => {
    const values = {
      ...FIGHTER_BLADE_WIZARD,
      wis: 14,
      wisMod: 2,
      subclass: "Ash Warden",
      features: [{ id: "f3", ref: "subclassFeature:fighter/hb-ash/ember-l3", name: "Ember" }],
    };
    const meta = (id: string) => (id === "fighter/hb-ash" ? { spellcasting: { progression: "third", ability: "wis" } } : undefined);
    expect(castingClasses(values)[0]?.castingClass).toBe("wizard");
    expect(castingClasses(values, { subclassMeta: meta })[0]).toMatchObject({ castingClass: "", ability: "wis", mod: 2, dc: 12, attack: 4 });
  });

  it("a single-class third caster casts with its subclass's ability and list (F009)", () => {
    const { multiclass: _, ...single } = FIGHTER_BLADE_WIZARD;
    expect(castingClasses(single)).toEqual([{ castingClass: "", classId: "fighter", name: "Fighter", ability: "int", mod: 3, dc: 13, attack: 5 }]);
    expect(spellCasting(single, { castingClass: "" })).toEqual({ mod: 3, dc: 13, attack: 5 });
    expect(spellLibrary({ gameData: {} } as Parameters<typeof spellLibrary>[0], single)).toEqual({ tab: "spells", classId: "wizard" });
    const meta = (id: string) => (id === "fighter/hb-ash" ? { spellcasting: { progression: "third", ability: "wis", list: "druid" } } : undefined);
    const ash = { ...single, wis: 14, wisMod: 2, subclass: "Ash Warden", features: [{ id: "f3", ref: "subclassFeature:fighter/hb-ash/ember-l3", name: "Ember" }] };
    expect(spellCasting(ash, { castingClass: "" }, { subclassMeta: meta })).toEqual({ mod: 2, dc: 12, attack: 4 });
    expect(spellLibrary({ gameData: {} } as Parameters<typeof spellLibrary>[0], ash, undefined, { subclassMeta: meta })).toEqual({ tab: "spells", classId: "druid" });
  });

  it("a normal single-class caster is unchanged", () => {
    const wizard = { level: 1, classId: "wizard", className: "Wizard", spellAbility: "int", spellMod: 3, spellSaveDc: 13, spellAttack: 5, features: BLADE_FEATURES };
    expect(castingClasses(wizard)).toEqual([]);
    expect(spellCasting(wizard, {})).toEqual({ mod: 3, dc: 13, attack: 5 });
    expect(spellLibrary({ gameData: {} } as Parameters<typeof spellLibrary>[0], wizard)).toEqual({ tab: "spells", classId: "wizard" });
  });

  it("the subclass id comes from its features; several resolve by the stored name", () => {
    const names = sheetNamesFrom({ subclass: { "fighter/spell-blade": "Spell Blade", "fighter/champion": "Champion" } });
    expect(subclassIdOf(FIGHTER_BLADE_WIZARD, "fighter", "Spell Blade")).toBe("fighter/spell-blade");
    expect(subclassIdOf(FIGHTER_BLADE_WIZARD, "fighter", "")).toBeNull();
    const both = { features: [...BLADE_FEATURES, { id: "f4", ref: "subclassFeature:fighter/champion/improved-critical-l3", name: "x" }] };
    expect(subclassIdOf(both, "fighter", "Champion", names)).toBe("fighter/champion");
    expect(subclassIdOf(both, "fighter", "Somebody's own")).toBeNull();
  });

  it("background and feat spells belong to no class (their source shows instead)", () => {
    expect(spellSourceOf({ source: "magic-initiate", castingClass: "" })).toBe("magic-initiate");
    expect(spellSourceOf({ source: "species" })).toBe("species");
    expect(spellSourceOf({ source: "class" })).toBeNull();
    expect(spellSourceOf({ source: "other" })).toBeNull();
    // A player who set the class by hand keeps it.
    expect(spellSourceOf({ source: "magic-initiate", castingClass: "wizard" })).toBeNull();
  });
});

describe("names in the viewer's locale (UAT M10)", () => {
  const en = sheetNamesFrom({
    class: { fighter: "Fighter", wizard: "Wizard" },
    subclass: { "fighter/champion": "Champion" },
    species: { elf: "Elf" },
    background: { sage: "Sage" },
  });
  const zhSheet = {
    level: 4,
    classId: "fighter",
    className: "zh-fighter",
    subclass: "zh-champion",
    species: "zh-elf",
    speciesId: "elf",
    background: "zh-sage",
    backgroundId: "sage",
    features: [{ id: "f", ref: "subclassFeature:fighter/champion/improved-critical-l3", name: "x" }],
    multiclass: [{ id: "class_w", classId: "wizard", ref: "class:wizard", name: "zh-wizard", subclass: "", level: 1, hitDie: 6, hitDiceSpent: 0, spellAbility: "int" }],
  };

  it("resolves built-in classes, subclasses, species and backgrounds from their ids", () => {
    expect(classLine(zhSheet, { separator: " / ", level: String }, en)).toBe("Fighter 3 · Champion / Wizard 1");
    expect(classLine(zhSheet, { separator: " / ", level: String }, en, { subclasses: false })).toBe("Fighter 3 / Wizard 1");
    expect(subclassLine(zhSheet, " / ", en)).toBe("Champion");
    expect(originName(zhSheet, "species", en)).toBe("Elf");
    expect(originName(zhSheet, "background", en)).toBe("Sage");
  });

  it("keeps the stored text for custom entries and without names", () => {
    const custom = { ...zhSheet, classId: "", className: "Spellsword", speciesId: "", multiclass: [] };
    expect(classLine(custom, { separator: " / ", level: String }, en)).toBe("Spellsword · zh-champion");
    expect(originName(custom, "species", en)).toBe("zh-elf");
    expect(classLine(zhSheet, { separator: " / ", level: String })).toBe("zh-fighter 3 · zh-champion / zh-wizard 1");
  });
});
