/**
 * What the D&D 2024 print document prints, read from the character on screen (stored data with
 * the formula values on top), arranged by the official 2024 sheet's regions. Pure: the play view's
 * readers (`play-model.ts`) decide the rules, this decides what goes on paper. Every region prints
 * in both modes; 「保留手寫空白」 (`blanks`) clears only the play state (current and temporary hit
 * points, spent hit dice, death saves, spent slots, conditions, exhaustion, concentration and
 * Heroic Inspiration), so the sheet can be played in pencil.
 */
import {
  ABILITIES,
  cantripDice,
  conditionsOf,
  exhaustionLevel,
  hitDice,
  hitPoints,
  num,
  pactSlots,
  rows,
  text,
  weaponAttack,
  type Ability,
  type CharacterValues,
  type SlotLevel,
} from "../sheet/play/play-model";
import { rowBodyText } from "../sheet/play/row-body";
import { inventorySummary, type CarryStatus } from "../sheet/economy/carry";
import { catalogItem, type Catalog } from "../sheet/economy/catalog";

export type Row = Record<string, unknown>;

/**
 * The official sheet's two ability columns (STR, DEX, CON | INT, WIS, CHA) and each ability's
 * skills in the sheet's order. Print-local: the play view keeps its alphabetical `SKILLS`.
 */
export const SHEET_ABILITY_COLUMNS: readonly [readonly Ability[], readonly Ability[]] = [["str", "dex", "con"], ["int", "wis", "cha"]];
export const ABILITY_SKILLS: Readonly<Record<Ability, readonly string[]>> = {
  str: ["athletics"],
  dex: ["acrobatics", "sleightOfHand", "stealth"],
  con: [],
  int: ["arcana", "history", "investigation", "nature", "religion"],
  wis: ["animalHandling", "insight", "medicine", "perception", "survival"],
  cha: ["deception", "intimidation", "performance", "persuasion"],
};

/** The 15 conditions of the sheet (schema `conditions` options); Exhaustion prints with its level. */
export const CONDITIONS = [
  "blinded", "charmed", "deafened", "exhaustion", "frightened", "grappled", "incapacitated", "invisible",
  "paralyzed", "petrified", "poisoned", "prone", "restrained", "stunned", "unconscious",
] as const;

/**
 * Bonus fields the 狀態與加值 box prints only when they change something: a number other than 0,
 * a switch on, a choice other than none. Unarmored Defense prints in the AC box's note instead.
 */
export const MODIFIER_FIELDS = [
  "initiativeMisc", "acMisc", "hpMaxMisc", "hpPerLevelBonus", "rangedAttackBonus", "jackOfAllTrades", "orderLoreBonus",
] as const;
export type ModifierField = (typeof MODIFIER_FIELDS)[number];

export const ARMOR_TRAINING = ["armorLight", "armorMedium", "armorHeavy", "armorShields"] as const;
export type ArmorTraining = (typeof ARMOR_TRAINING)[number];

export type Proficiency = "none" | "proficient" | "expertise";

export interface PrintRowLine {
  /** `${list}:${index}`: unique on the sheet, the key of the row's text. */
  key: string;
  list: string;
  name: string;
  level?: number;
  category?: string;
  origin: "srd" | "pack" | "custom";
}

export interface PrintTextRow {
  line: PrintRowLine;
  row: Row;
}

/** A row of 武器與傷害戲法: a weapon, or a cantrip whose game data deals damage. */
export interface PrintAttack {
  key: string;
  kind: "weapon" | "cantrip";
  name: string;
  /** The attack bonus (a weapon's, or the spell attack of a cantrip that makes an attack roll). */
  attack: number | null;
  /** The spell save DC of a cantrip that calls for a saving throw. */
  dc: number | null;
  /** Damage dice and modifier (`1d8+3`); a cantrip's dice at the character's level. */
  dice: string;
  /** The row's own damage type text; a cantrip's comes from its rules text (print-text). */
  damageType: string;
  notes: string;
  /** The spell row of a cantrip (`spells:<index>`), for its range and its save and damage type. */
  spellKey: string | null;
  ref: string;
}

export interface PrintSpell {
  key: string;
  name: string;
  level: number;
  prepared: boolean;
  /** ◆: a leveled spell from the species or the Magic Initiate feat is always prepared. */
  always: boolean;
  concentration: boolean;
  ritual: boolean;
  material: boolean;
  notes: string;
  row: Row;
}

export interface PrintEquipment {
  line: PrintRowLine;
  row: Row;
  qty: number;
  equipped: boolean;
  /** The row's weight in lb (unit × quantity), or null when neither the row nor the catalog knows it. */
  weight: number | null;
}

export interface DndPrintModel {
  name: string;
  blanks: boolean;
  identity: {
    background: string;
    className: string;
    species: string;
    lineage: string;
    subclass: string;
    player: string;
    level: number;
    xp: number;
  };
  /** Option ids (`neutralGood`, `medium`). */
  alignment: string;
  size: string;
  abilities: Array<{
    id: Ability;
    score: number;
    mod: number;
    save: number;
    saveProf: boolean;
    skills: Array<{ id: string; value: number; prof: Proficiency }>;
  }>;
  combat: {
    ac: number;
    shield: boolean;
    /** The AC box's small note: Unarmored Defense and the AC bonus. */
    acNote: Array<{ id: "unarmoredDefense"; value: string } | { id: "acMisc"; value: number }>;
    initiative: number;
    speed: number;
    baseSpeed: number;
    prof: number;
    passive: number;
    inspiration: boolean;
    darkvision: number;
  };
  hp: { current: number | null; max: number; temp: number | null };
  hitDice: { faces: number; max: number; spent: number | null };
  death: { successes: number; failures: number };
  /** Without exhaustion. Compact: the conditions in effect; blanks: every condition, unchecked. */
  conditions: Array<{ id: string; active: boolean }>;
  exhaustion: number;
  concentration: string;
  modifiers: Array<{ id: ModifierField; value: number | string | true }>;
  training: { armor: Record<ArmorTraining, boolean>; weapons: string; tools: string[]; masteries: string[] };
  attacks: PrintAttack[];
  lists: Record<"features" | "speciesTraits" | "feats", PrintTextRow[]>;
  /** Whether the character casts: a spellcasting ability, spells, slots or pact slots. */
  caster: boolean;
  /** Null for a non-caster in the compact print; blanks keeps the empty boxes. */
  spellcasting: { ability: string; mod: number | null; dc: number | null; attack: number | null; pact: SlotLevel | null } | null;
  /** Levels 1–9. */
  slots: SlotLevel[];
  /** Every spell, by level then name: the 戲法與法術 table and the spellbook. */
  spells: PrintSpell[];
  equipment: PrintEquipment[];
  /** Everything carried and the capacity, in lb; null when some row's weight is unknown. */
  carry: { carried: number; capacity: number; coins: number; status: CarryStatus } | null;
  /** The items whose text prints under 裝備說明. */
  itemRows: PrintTextRow[];
  /** Attack rows with the player's own text, printed under 武器說明. */
  attackTexts: PrintTextRow[];
  /** Always three lines. */
  attunement: [string, string, string];
  coins: Record<"cp" | "sp" | "ep" | "gp" | "pp", number>;
  languages: string[];
  appearance: string;
  backstory: string;
  notes: string;
}

export interface DndPrintInput {
  values: CharacterValues;
  blanks: boolean;
  /** A row's name in the viewer's locale (`displayName` of the play view). */
  nameOf: (row: Row) => string;
  /** Sort key compare for names in the viewer's locale. */
  compare?: (a: string, b: string) => number;
  /** The System's game data: which cantrips deal damage (`game/spells.json` `damageDice`). */
  gameData?: Record<string, unknown>;
  /** The SRD item catalog (weights); null until it loads, or when it does not. */
  catalog?: Catalog | null;
}

function originOf(row: Row): PrintRowLine["origin"] {
  const origin = text(row.origin);
  if (origin === "pack" || origin === "srd") return origin;
  return origin === "custom" || !text(row.ref) ? "custom" : "srd";
}

function line(list: string, row: Row, index: number, nameOf: DndPrintInput["nameOf"]): PrintRowLine {
  const level = num(row.level, Number.NaN);
  const category = text(row.category);
  return {
    key: `${list}:${index}`,
    list,
    name: nameOf(row).trim(),
    ...(list === "features" && Number.isFinite(level) && level > 0 ? { level } : {}),
    ...(category ? { category } : {}),
    origin: originOf(row),
  };
}

function textRows(values: CharacterValues, list: string, nameOf: DndPrintInput["nameOf"]): PrintTextRow[] {
  return rows(values[list])
    .map((row, index) => ({ line: line(list, row, index, nameOf), row }))
    .filter((entry) => entry.line.name !== "");
}

function proficiency(value: unknown): Proficiency {
  return value === "proficient" || value === "expertise" ? value : "none";
}

function modifierValue(values: CharacterValues, id: ModifierField): number | string | true | null {
  const value = values[id];
  if (id === "jackOfAllTrades") return value === true ? true : null;
  if (id === "orderLoreBonus") {
    const choice = text(value);
    return choice && choice !== "none" ? choice : null;
  }
  const amount = num(value);
  return amount !== 0 ? amount : null;
}

function signedMod(value: number): string {
  return value === 0 ? "" : value > 0 ? `+${value}` : `−${Math.abs(value)}`;
}

function spellOf(row: Row, index: number, nameOf: DndPrintInput["nameOf"]): PrintSpell {
  const level = Math.min(9, Math.max(0, Math.trunc(num(row.level))));
  const source = text(row.source);
  return {
    key: `spells:${index}`,
    name: nameOf(row).trim(),
    level,
    prepared: row.prepared === true,
    always: level > 0 && (source === "species" || source === "magic-initiate"),
    concentration: row.concentration === true,
    ritual: row.ritual === true,
    material: row.material === true,
    notes: text(row.notes).trim(),
    row,
  };
}

/** The spell held in Concentration: the sheet keeps its ref (or its name without one). */
function concentrationName(values: CharacterValues, spells: PrintSpell[], nameOf: DndPrintInput["nameOf"]): string {
  const key = text(values.concentration).trim();
  if (!key) return "";
  const row = spells.find((spell) => text(spell.row.ref) === key);
  if (row) return row.name;
  return key.includes(":") ? nameOf({ ref: key, name: "" }).trim() || key : key;
}

const cantripIndex = new WeakMap<object, Map<string, { dice: string; attack: boolean }>>();

/**
 * The damage cantrips of the game data (`damageDice`, `spellAttack`), by ref. Print-local reading of
 * `spellFactsOf` (row-text.ts): importing the play view's row-text into the print chunk would split
 * the sheet's play chunk.
 */
function damageCantrip(gameData: Record<string, unknown> | undefined, ref: string): { dice: string; attack: boolean } | null {
  const list = gameData?.spells;
  if (!Array.isArray(list) || !ref.startsWith("spell:")) return null;
  let index = cantripIndex.get(list);
  if (!index) {
    index = new Map();
    for (const spell of list as Array<Record<string, unknown>>) {
      if (typeof spell?.ref !== "string" || spell.level !== 0 || typeof spell.damageDice !== "string" || !spell.damageDice) continue;
      index.set(spell.ref, { dice: spell.damageDice, attack: spell.spellAttack === true });
    }
    cantripIndex.set(list, index);
  }
  return index.get(ref) ?? null;
}

const tenth = (value: number) => Math.round(value * 10) / 10;

export function buildDndPrintModel({ values, blanks, nameOf, compare = (a, b) => a.localeCompare(b), gameData, catalog = null }: DndPrintInput): DndPrintModel {
  const level = Math.max(1, num(values.level, 1));

  const abilities = ABILITIES.map((id) => ({
    id,
    score: num(values[id], 10),
    mod: num(values[`${id}Mod`], Math.floor((num(values[id], 10) - 10) / 2)),
    save: num(values[`${id}Save`]),
    saveProf: values[`${id}SaveProf`] === true,
    skills: ABILITY_SKILLS[id].map((skill) => ({ id: skill, value: num(values[skill]), prof: proficiency(values[`${skill}Prof`]) })),
  }));

  const hp = hitPoints(values);
  const dice = hitDice(values);
  const exhaustion = exhaustionLevel(values);
  const active = new Set(conditionsOf(values));
  const conditions = blanks
    ? CONDITIONS.filter((id) => id !== "exhaustion").map((id) => ({ id, active: false }))
    : CONDITIONS.filter((id) => id !== "exhaustion" && active.has(id)).map((id) => ({ id, active: true }));

  const modifiers = MODIFIER_FIELDS.flatMap((id) => {
    const value = modifierValue(values, id);
    return value === null ? [] : [{ id, value }];
  });

  const unarmored = text(values.unarmoredDefense);
  const acMisc = num(values.acMisc);
  const acNote: DndPrintModel["combat"]["acNote"] = [
    ...(unarmored && unarmored !== "none" ? [{ id: "unarmoredDefense" as const, value: unarmored }] : []),
    ...(acMisc !== 0 ? [{ id: "acMisc" as const, value: acMisc }] : []),
  ];

  const spells = rows(values.spells).map((row, index) => spellOf(row, index, nameOf)).filter((spell) => spell.name !== "");
  spells.sort((a, b) => a.level - b.level || compare(a.name, b.name));

  const weapons: PrintAttack[] = rows(values.weapons).flatMap((row, index) => {
    const name = text(row.name).trim();
    if (!name) return [];
    const { attack, damageMod } = weaponAttack(values, row);
    const dice = text(row.damageDice).trim();
    return [{
      key: `weapons:${index}`,
      kind: "weapon" as const,
      name,
      attack,
      dc: null,
      dice: dice ? `${dice}${signedMod(damageMod)}` : signedMod(damageMod).replace(/^\+/, ""),
      damageType: text(row.damageType).trim(),
      notes: [text(row.mastery).trim(), text(row.notes).trim()].filter(Boolean).join(" · "),
      spellKey: null,
      ref: text(row.ref),
    }];
  });
  const cantrips: PrintAttack[] = spells.flatMap((spell, index) => {
    const ref = text(spell.row.ref);
    const facts = spell.level === 0 && text(spell.row.origin) !== "pack" ? damageCantrip(gameData, ref) : null;
    if (!facts) return [];
    return [{
      key: `cantrip:${index}`,
      kind: "cantrip" as const,
      name: spell.name,
      attack: facts.attack ? num(values.spellAttack) : null,
      dc: facts.attack ? null : num(values.spellSaveDc),
      dice: cantripDice(facts.dice, level),
      damageType: "",
      notes: spell.notes,
      spellKey: spell.key,
      ref,
    }];
  });
  // renumber: cantrip keys follow their order in the table, not the spell list
  cantrips.forEach((attack, index) => {
    attack.key = `cantrip:${index}`;
  });

  const slots: SlotLevel[] = Array.from({ length: 9 }, (_, index) => {
    const slotLevel = index + 1;
    const total = Math.max(0, num(values[`slot${slotLevel}Total`]));
    const used = blanks ? 0 : Math.min(total, Math.max(0, num(values[`slot${slotLevel}Used`])));
    return { level: slotLevel, total, used };
  });
  const pact = pactSlots(values);
  const casterAbility = text(values.spellAbility);
  const hasAbility = casterAbility !== "" && casterAbility !== "none";
  const caster = hasAbility || spells.length > 0 || slots.some((slot) => slot.total > 0) || pact !== null;

  const summary = inventorySummary(values, catalog);
  const equipment = rows(values.equipment).flatMap((row, index): PrintEquipment[] => {
    const entry = { line: line("equipment", row, index, nameOf), row };
    if (entry.line.name === "") return [];
    const own = num(row.weight, Number.NaN);
    const known = (Number.isFinite(own) && own >= 0) || catalogItem(catalog, row.ref) !== undefined;
    return [{ ...entry, qty: num(row.qty, 1), equipped: row.equipped === true, weight: known ? tenth(summary.rows[index].weight) : null }];
  });
  const everyWeight = rows(values.equipment).every((row) => {
    const own = num(row.weight, Number.NaN);
    return Number.isFinite(own) && own >= 0;
  });
  const carry = catalog !== null || everyWeight
    ? { carried: summary.carried, capacity: summary.capacity, coins: summary.coins, status: summary.status }
    : null;

  const shortList = (list: string) => rows(values[list]).map((row) => nameOf(row).trim()).filter(Boolean);
  const masteries = rows(values.weaponMasteries)
    .map((row) => [nameOf(row).trim(), text(row.mastery).trim()].filter(Boolean).join(" · "))
    .filter(Boolean);
  const attunement = (["attunement1", "attunement2", "attunement3"] as const).map((id) => text(values[id]).trim());

  return {
    name: text(values.name).trim(),
    blanks,
    identity: {
      background: text(values.background).trim(),
      className: text(values.className).trim(),
      species: text(values.species).trim(),
      lineage: text(values.lineage).trim(),
      subclass: text(values.subclass).trim(),
      player: text(values.player).trim(),
      level,
      xp: Math.max(0, num(values.xp)),
    },
    alignment: text(values.alignment),
    size: text(values.size),
    abilities,
    combat: {
      ac: num(values.ac),
      shield: values.shield === true,
      acNote,
      initiative: num(values.initiative),
      // exhaustion is play state: blanks prints the speed it would reduce (POR-F004)
      speed: Math.max(0, num(values.speed) - 5 * (blanks ? 0 : exhaustion)),
      baseSpeed: num(values.speed),
      prof: num(values.profBonus, 2),
      passive: num(values.passivePerception, 10),
      inspiration: !blanks && values.heroicInspiration === true,
      darkvision: num(values.darkvision),
    },
    hp: { current: blanks ? null : hp.current, max: hp.max, temp: blanks ? null : hp.temp > 0 ? hp.temp : null },
    hitDice: { faces: dice.faces, max: dice.max, spent: blanks ? null : dice.max - dice.left },
    death: blanks
      ? { successes: 0, failures: 0 }
      : { successes: Math.min(3, Math.max(0, num(values.deathSuccesses))), failures: Math.min(3, Math.max(0, num(values.deathFailures))) },
    conditions,
    exhaustion: blanks ? 0 : exhaustion,
    concentration: blanks ? "" : concentrationName(values, spells, nameOf),
    modifiers,
    training: {
      armor: Object.fromEntries(ARMOR_TRAINING.map((id) => [id, values[id] === true])) as Record<ArmorTraining, boolean>,
      weapons: text(values.weaponProficiencies).trim(),
      tools: shortList("toolProficiencies"),
      masteries,
    },
    attacks: [...weapons, ...cantrips],
    lists: {
      features: textRows(values, "features", nameOf),
      speciesTraits: textRows(values, "speciesTraits", nameOf),
      feats: textRows(values, "feats", nameOf),
    },
    caster,
    spellcasting: caster || blanks
      ? {
        ability: hasAbility ? casterAbility : "",
        mod: hasAbility ? num(values.spellMod) : null,
        dc: hasAbility ? num(values.spellSaveDc) : null,
        attack: hasAbility ? num(values.spellAttack) : null,
        pact: pact && blanks ? { ...pact, used: 0 } : pact,
      }
      : null,
    slots,
    spells,
    equipment,
    carry,
    itemRows: equipment.map(({ line: itemLine, row }) => ({ line: itemLine, row })),
    attackTexts: textRows(values, "weapons", nameOf).filter((entry) => rowBodyText(entry.row, null).trim() !== ""),
    attunement: [attunement[0], attunement[1], attunement[2]],
    coins: { cp: num(values.cp), sp: num(values.sp), ep: num(values.ep), gp: num(values.gp), pp: num(values.pp) },
    languages: shortList("languages"),
    appearance: text(values.appearance).trim(),
    backstory: text(values.backstory).trim(),
    notes: text(values.notes).trim(),
  };
}
