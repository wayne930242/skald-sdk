import { describe, expect, it } from "vitest";
import defaultData from "@skald/system-dnd5e/data/dnd5e-2024/default-data.json";
import spells from "@skald/system-dnd5e/data/dnd5e-2024/game/spells.json";
import { dndPrintOverrides, PACK_SPELL_NAME, WEAPON_PLAYER_TEXT, type DndPrintFixture } from "@skald/sheet-sdk/testing/fixtures/dnd-print/characters";
import type { Catalog } from "../../sheet/economy/catalog";
import { ABILITY_SKILLS, SHEET_ABILITY_COLUMNS, buildDndPrintModel } from "../print-model";

/** The formula values the sheet would add for the wizard (L5, INT 18, DEX 14, CON 14). */
const WIZARD_DERIVED: Record<string, unknown> = {
  strMod: -1, dexMod: 2, conMod: 2, intMod: 4, wisMod: 1, chaMod: 0, profBonus: 3,
  strSave: -1, dexSave: 2, conSave: 2, intSave: 7, wisSave: 4, chaSave: 0,
  arcana: 7, history: 7, investigation: 10, perception: 4, insight: 4, athletics: -1,
  passivePerception: 14, initiative: 2, ac: 13, hpMax: 32, hitDiceMax: 5,
  spellMod: 4, spellSaveDc: 15, spellAttack: 7,
};

const gameData = { spells } as Record<string, unknown>;

function model(fixture: DndPrintFixture, blanks = false, extra: Record<string, unknown> = {}, catalog: Catalog | null = null) {
  return buildDndPrintModel({
    values: { ...defaultData, ...dndPrintOverrides(fixture), ...(fixture === "wizard" ? WIZARD_DERIVED : {}), ...extra },
    blanks,
    nameOf: (row) => String(row.name ?? ""),
    gameData,
    catalog,
  });
}

describe("D&D print model: the official sheet's regions", () => {
  it("identity: species and lineage in one value, the rest as the header prints them", () => {
    const print = model("wizard");
    expect(print.name).toBe("莉亞・霜語");
    expect(print.identity).toEqual({
      background: "智者", className: "法師", species: "精靈", lineage: "高等精靈血統", subclass: "塑能師", player: "測試玩家", level: 5, xp: 6500,
    });
    expect(print.alignment).toBe("neutralGood");
    expect(print.size).toBe("medium");
  });

  it("abilities carry their saves and their skills, grouped as the 2024 sheet groups them", () => {
    expect(SHEET_ABILITY_COLUMNS).toEqual([["str", "dex", "con"], ["int", "wis", "cha"]]);
    expect(ABILITY_SKILLS).toEqual({
      str: ["athletics"],
      dex: ["acrobatics", "sleightOfHand", "stealth"],
      con: [],
      int: ["arcana", "history", "investigation", "nature", "religion"],
      wis: ["animalHandling", "insight", "medicine", "perception", "survival"],
      cha: ["deception", "intimidation", "performance", "persuasion"],
    });
    const print = model("wizard");
    expect(print.abilities.map((ability) => [ability.id, ability.skills.map((skill) => skill.id)])).toEqual(
      Object.entries(ABILITY_SKILLS),
    );
    const int = print.abilities.find((ability) => ability.id === "int")!;
    expect(int).toMatchObject({ score: 18, mod: 4, save: 7, saveProf: true });
    expect(int.skills.find((skill) => skill.id === "investigation")).toEqual({ id: "investigation", value: 10, prof: "expertise" });
    expect(int.skills.find((skill) => skill.id === "arcana")).toEqual({ id: "arcana", value: 7, prof: "proficient" });
    expect(print.abilities.flatMap((ability) => ability.skills)).toHaveLength(18);
  });

  it("AC with the shield mark and its note; the spellcasting modifier", () => {
    const fighter = model("fighter");
    expect(fighter.combat.shield).toBe(true);
    expect(model("wizard").combat.shield).toBe(false);
    expect(model("wizard").combat.acNote).toEqual([{ id: "acMisc", value: 1 }]);
    expect(model("sparse", false, { unarmoredDefense: "barbarian", acMisc: 0 }).combat.acNote).toEqual([{ id: "unarmoredDefense", value: "barbarian" }]);
    expect(model("wizard").spellcasting).toEqual({ ability: "int", mod: 4, dc: 15, attack: 7, pact: null });
  });

  it("status: the conditions in effect and the bonuses that change something (not the AC note's unarmored defense)", () => {
    const print = model("fighter", false, { jackOfAllTrades: true, orderLoreBonus: "magician", rangedAttackBonus: 0, hpMaxMisc: -2, unarmoredDefense: "monk" });
    expect(print.modifiers).toEqual([
      { id: "initiativeMisc", value: 2 },
      { id: "hpMaxMisc", value: -2 },
      { id: "jackOfAllTrades", value: true },
      { id: "orderLoreBonus", value: "magician" },
    ]);
    const wizard = model("wizard");
    expect(wizard.conditions).toEqual([{ id: "poisoned", active: true }]);
    expect(wizard.exhaustion).toBe(1);
    expect(wizard.concentration).toBe("加速術");
  });

  it("training: the four armor marks always, weapons, tools and masteries", () => {
    expect(model("fighter").training).toEqual({
      armor: { armorLight: true, armorMedium: true, armorHeavy: true, armorShields: true },
      weapons: "簡易武器、軍用武器",
      tools: [],
      masteries: ["長劍 · 削弱", "標槍 · 緩速"],
    });
    expect(model("sparse").training.armor).toEqual({ armorLight: false, armorMedium: false, armorHeavy: false, armorShields: false });
  });

  it("attacks: the weapons, then the damage cantrips with their spell attack or save DC and dice for the level", () => {
    const fighter = model("fighter", false, { strMod: 3, dexMod: 1, profBonus: 2 });
    expect(fighter.attacks).toEqual([
      { key: "weapons:0", kind: "weapon", name: "長劍", attack: 5, dc: null, dice: "1d8+3", damageType: "揮砍", notes: "削弱 · 多用（1d10）", spellKey: null, ref: "baseItem:longsword" },
      { key: "weapons:1", kind: "weapon", name: "標槍", attack: 5, dc: null, dice: "1d6+3", damageType: "穿刺", notes: "緩速 · 投擲（30/120）", spellKey: null, ref: "baseItem:javelin" },
    ]);
    const cantrips = (level: number) =>
      model("wizard", false, {
        level,
        spells: [
          { id: "c1", level: 0, ref: "spell:fire-bolt", name: "火焰箭", origin: "srd" },
          { id: "c2", level: 0, ref: "spell:acid-splash", name: "酸液飛濺", origin: "srd", notes: "5 呎半徑" },
          { id: "c3", level: 0, ref: "spell:mage-hand", name: "法師之手", origin: "srd" },
          { id: "c4", level: 1, ref: "spell:magic-missile", name: "魔法飛彈", origin: "srd" },
        ],
      }).attacks.filter((attack) => attack.kind === "cantrip");
    expect(cantrips(1)).toEqual([
      { key: "cantrip:0", kind: "cantrip", name: "火焰箭", attack: 7, dc: null, dice: "1d10", damageType: "", notes: "", spellKey: "spells:0", ref: "spell:fire-bolt" },
      { key: "cantrip:1", kind: "cantrip", name: "酸液飛濺", attack: null, dc: 15, dice: "1d6", damageType: "", notes: "5 呎半徑", spellKey: "spells:1", ref: "spell:acid-splash" },
    ]);
    expect(cantrips(5).map((attack) => attack.dice)).toEqual(["2d10", "2d6"]);
    expect(cantrips(11).map((attack) => attack.dice)).toEqual(["3d10", "3d6"]);
    expect(cantrips(17).map((attack) => attack.dice)).toEqual(["4d10", "4d6"]);
    // without game data no cantrip is known to deal damage
    expect(buildDndPrintModel({ values: { ...defaultData, ...dndPrintOverrides("wizard") }, blanks: false, nameOf: (row) => String(row.name ?? "") })
      .attacks.map((attack) => attack.kind)).toEqual(["weapon", "weapon"]);
  });

  it("spells: every spell by level then name, with ◆ always-prepared, prepared, C/R/M and notes", () => {
    const print = model("wizard", false, {
      spells: [
        ...(dndPrintOverrides("wizard").spells as Array<Record<string, unknown>>),
        { id: "x1", level: 1, ref: "spell:detect-magic", name: "偵測魔法（血統）", origin: "srd", source: "species", prepared: false, notes: "每長休免費 1 次" },
        { id: "x2", level: 0, ref: "spell:light", name: "光亮術（學徒）", origin: "srd", source: "magic-initiate" },
        { id: "x3", level: 1, ref: "spell:sleep", name: "睡眠術（學徒）", origin: "srd", source: "magic-initiate", prepared: false },
      ],
    });
    expect(print.spells).toHaveLength(20);
    expect(print.spells.map((spell) => spell.level)).toEqual([0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 3, 3, 3]);
    const first = print.spells.filter((spell) => spell.level === 1).map((spell) => spell.name);
    expect(first).toEqual([...first].sort((a, b) => a.localeCompare(b)));
    expect(print.spells.find((spell) => spell.name === "偵測魔法（血統）")).toMatchObject({ always: true, prepared: false, notes: "每長休免費 1 次" });
    expect(print.spells.find((spell) => spell.name === "睡眠術（學徒）")).toMatchObject({ always: true });
    expect(print.spells.find((spell) => spell.name === "光亮術（學徒）")).toMatchObject({ always: false });
    expect(print.spells.find((spell) => spell.name === PACK_SPELL_NAME)).toMatchObject({ prepared: true, always: false, concentration: true, ritual: false, material: false });
    expect(print.spells.find((spell) => spell.name === "偵測魔法")).toMatchObject({ prepared: false, concentration: true, ritual: true });
    expect(print.spells.find((spell) => spell.name === "法師護甲")).toMatchObject({ material: true });
  });

  it("slots: levels 1 to 9, totals and the used ones; pact slots", () => {
    const print = model("wizard");
    expect(print.slots.map(({ level, total, used }) => `${level}:${used}/${total}`)).toEqual([
      "1:1/4", "2:0/3", "3:1/2", "4:0/0", "5:0/0", "6:0/0", "7:0/0", "8:0/0", "9:0/0",
    ]);
    const warlock = model("sparse", false, { spellAbility: "cha", pactSlots: 2, pactSlotLevel: 2, pactUsed: 1 });
    expect(warlock.spellcasting?.pact).toEqual({ level: 2, total: 2, used: 1 });
  });

  it("a character without spellcasting is no caster; blanks still prints the empty spellcasting area", () => {
    expect(model("fighter").caster).toBe(false);
    expect(model("fighter").spellcasting).toBeNull();
    expect(model("wizard").caster).toBe(true);
    expect(model("fighter", true).spellcasting).toEqual({ ability: "", mod: null, dc: null, attack: null, pact: null });
  });

  it("equipment: each row's weight and the carried load, with the item catalog", () => {
    const catalog: Catalog = { "baseItem:quarterstaff": [20, 4, "M"], "item:backpack": [200, 5, "G"], "item:rations": [5, 2, "G"] };
    const print = model("wizard", false, {}, catalog);
    expect(print.equipment.map(({ line, qty, weight }) => [line.name, qty, weight])).toEqual([
      ["法術書", 1, null], ["長棍", 1, 4], ["背包", 1, 5], ["口糧", 10, 20],
    ]);
    // coins: 12 cp + 30 sp + 85 gp = 127 coins, 2.54 lb
    expect(print.carry).toEqual({ carried: 31.5, capacity: 120, coins: 2.54, status: "ok" });
  });

  it("equipment without the catalog: a row's own weight only, and no carried load", () => {
    const print = model("wizard", false, {
      equipment: [
        { id: "e1", qty: 2, name: "鐵釘", weight: 0.25, ref: "", origin: "custom" },
        { id: "e2", qty: 1, name: "背包", ref: "item:backpack", origin: "srd" },
      ],
    });
    expect(print.equipment.map(({ line, weight }) => [line.name, weight])).toEqual([["鐵釘", 0.5], ["背包", null]]);
    expect(print.carry).toBeNull();
    // every row carries its own weight: the load is known without the catalog
    const own = model("wizard", false, { equipment: [{ id: "e1", qty: 2, name: "鐵釘", weight: 0.25, ref: "", origin: "custom" }] });
    expect(own.carry).toMatchObject({ carried: 3, capacity: 120, status: "ok" });
  });

  it("保留手寫空白 clears the play state only and keeps the character's data", () => {
    const print = model("wizard", true);
    expect(print.hp).toEqual({ current: null, max: 32, temp: null });
    expect(print.hitDice).toEqual({ faces: 6, max: 5, spent: null });
    expect(print.death).toEqual({ successes: 0, failures: 0 });
    expect(print.slots.find((slot) => slot.level === 1)).toEqual({ level: 1, total: 4, used: 0 });
    expect(print.conditions).toHaveLength(14);
    expect(print.conditions.every((condition) => !condition.active)).toBe(true);
    expect(print.exhaustion).toBe(0);
    expect(print.concentration).toBe("");
    expect(print.combat.inspiration).toBe(false);
    // the character's data still prints
    expect(print.identity.className).toBe("法師");
    expect(print.spells).toHaveLength(17);
    expect(print.languages).toEqual(["通用語", "精靈語", "龍語"]);
    expect(print.coins).toEqual({ cp: 12, sp: 30, ep: 0, gp: 85, pp: 0 });
    expect(print.attunement).toEqual(["守護者之戒", "", ""]);
    expect(print.appearance).toBe("銀灰長髮，左手腕上纏著墨水沾染的布條。");
    expect(print.modifiers).toEqual([{ id: "acMisc", value: 1 }]);
    const compact = model("wizard");
    expect(compact.hp).toEqual({ current: 24, max: 32, temp: 5 });
    expect(compact.hitDice).toEqual({ faces: 6, max: 5, spent: 1 });
    expect(compact.death).toEqual({ successes: 1, failures: 0 });
    expect(compact.combat.inspiration).toBe(true);
    expect(compact.attunement).toEqual(["守護者之戒", "", ""]);
  });

  it("text rows: features, species traits and feats in sheet order; items and the attacks' own text", () => {
    const print = model("wizard");
    expect(print.lists.features.map((entry) => entry.line.name)).toEqual([
      "施法", "儀式學家", "奧術回想", "學者", "法師子職", "塑能學者", "強力戲法", "屬性值提升", "記憶法術",
    ]);
    expect(print.lists.features[5].line).toEqual({ key: "features:5", list: "features", name: "塑能學者", level: 3, origin: "srd" });
    expect(print.lists.speciesTraits).toHaveLength(4);
    expect(print.lists.feats[0].line).toMatchObject({ name: "魔法學徒", category: "origin" });
    expect(print.itemRows.map((entry) => entry.line.name)).toEqual(["法術書", "長棍", "背包", "口糧"]);
    // an attack row prints only the text the player wrote (編輯文字), as the combat tab shows it
    expect(print.attackTexts.map(({ line, row }) => [line.key, line.name, row.playerText])).toEqual([["weapons:0", "匕首", WEAPON_PLAYER_TEXT]]);
    expect(model("fighter").attackTexts).toEqual([]);
    expect(print.appearance).toBe("銀灰長髮，左手腕上纏著墨水沾染的布條。");
    expect(print.backstory).toBe("在港都的老書庫長大，追查一本失竊的法術書來到內陸。");
    expect(print.notes).toBe("");
  });

  it("a row without a name is left out", () => {
    const print = model("sparse", false, {
      features: [{ id: "f1", name: "  ", ref: "" }, { id: "f2", name: "契約魔法", ref: "classFeature:warlock/pact-magic-l1", level: 1 }],
    });
    expect(print.lists.features.map(({ line }) => `${line.key} ${line.name}`)).toEqual(["features:1 契約魔法"]);
  });
});
