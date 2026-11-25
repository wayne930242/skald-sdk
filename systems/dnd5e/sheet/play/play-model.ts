/**
 * The play view's reading of a D&D 2024 character (design §3.2 field contract) and the writes a
 * tap makes: hit points, hit dice, spell slots, rests and "add as attack". Pure functions, so the
 * rules are tested without rendering.
 */

import { hitPoints, num, rows, text, type CharacterPatch, type CharacterValues, type HitPoints } from "./values";
import { hitDicePools, longRestClassPatch, spendHitDie as spendPoolDie } from "./class-model";

export { hitPoints, num, rows, text };
export type { CharacterPatch, CharacterValues, HitPoints };

export const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"] as const;
export type Ability = (typeof ABILITIES)[number];

/** Skills in the official sheet's alphabetical order, with their ability (data/skills.json). */
export const SKILLS: ReadonlyArray<{ id: string; ability: Ability }> = [
  { id: "acrobatics", ability: "dex" },
  { id: "animalHandling", ability: "wis" },
  { id: "arcana", ability: "int" },
  { id: "athletics", ability: "str" },
  { id: "deception", ability: "cha" },
  { id: "history", ability: "int" },
  { id: "insight", ability: "wis" },
  { id: "intimidation", ability: "cha" },
  { id: "investigation", ability: "int" },
  { id: "medicine", ability: "wis" },
  { id: "nature", ability: "int" },
  { id: "perception", ability: "wis" },
  { id: "performance", ability: "cha" },
  { id: "persuasion", ability: "cha" },
  { id: "religion", ability: "int" },
  { id: "sleightOfHand", ability: "dex" },
  { id: "stealth", ability: "dex" },
  { id: "survival", ability: "wis" },
];

/** Fields the play view reads or writes; a template without them keeps its own layout. */
export const PLAY_VIEW_FIELDS = [
  "hp", "hpMax", "hpTemp", "ac", "initiative", "speed", "profBonus", "passivePerception",
  "hitDieFaces", "hitDiceSpent", "hitDiceMax", "deathSuccesses", "deathFailures", "heroicInspiration",
  "exhaustion", "concentration",
  ...ABILITIES.flatMap((ability) => [ability, `${ability}Mod`, `${ability}Save`, `${ability}SaveProf`]),
  ...SKILLS.flatMap((skill) => [skill.id, `${skill.id}Prof`]),
  "weapons", "spells", "equipment", "features", "speciesTraits", "feats",
  "spellAbility", "spellSaveDc", "spellAttack", "pactSlots", "pactSlotLevel", "pactUsed",
  ...Array.from({ length: 9 }, (_, index) => [`slot${index + 1}Total`, `slot${index + 1}Used`]).flat(),
  "cp", "sp", "ep", "gp", "pp",
] as const;

/** `+3`, `−1` (a real minus sign, as the printed sheet does), `+0`. */
export function signed(value: number): string {
  return value < 0 ? `−${Math.abs(value)}` : `+${value}`;
}

// ---------------------------------------------------------------------------
// Hit points
// ---------------------------------------------------------------------------

/** Damage takes temporary hit points first; healing never goes past the maximum (2024 rules). */
export function adjustHitPoints(values: CharacterValues, delta: number): CharacterPatch {
  const hp = hitPoints(values);
  if (delta >= 0) return { hp: { ...(values.hp as object), current: Math.min(hp.max, hp.current + delta) } };
  const damage = -delta;
  const fromTemp = Math.min(hp.temp, damage);
  const patch: CharacterPatch = {};
  if (fromTemp > 0) patch.hpTemp = hp.temp - fromTemp;
  const rest = damage - fromTemp;
  if (rest > 0) patch.hp = { ...(values.hp as object), current: Math.max(0, hp.current - rest) };
  return patch;
}

/** The starting class's Hit Point Dice pool (the only pool of a single-class sheet); see `hitDicePools`. */
export function hitDice(values: CharacterValues): { faces: number; max: number; left: number } {
  const [pool] = hitDicePools(values);
  return { faces: pool.faces, max: pool.max, left: pool.left };
}

/** Spending a Hit Point Die of the starting class's size: one die more spent and the roll healed, at least 1 HP. */
export function spendHitDie(values: CharacterValues, rolled: number): CharacterPatch | null {
  return spendPoolDie(values, hitDice(values).faces, rolled);
}

// ---------------------------------------------------------------------------
// Spell slots and rests
// ---------------------------------------------------------------------------

export interface SlotLevel {
  level: number;
  total: number;
  used: number;
}

export function spellSlots(values: CharacterValues): SlotLevel[] {
  const slots: SlotLevel[] = [];
  for (let level = 1; level <= 9; level += 1) {
    const total = Math.max(0, num(values[`slot${level}Total`]));
    if (total > 0) slots.push({ level, total, used: Math.min(total, Math.max(0, num(values[`slot${level}Used`]))) });
  }
  return slots;
}

export function pactSlots(values: CharacterValues): SlotLevel | null {
  const total = Math.max(0, num(values.pactSlots));
  if (total === 0) return null;
  return { level: Math.max(1, num(values.pactSlotLevel, 1)), total, used: Math.min(total, Math.max(0, num(values.pactUsed))) };
}

/**
 * A tap on pip `index` of a level (0-based, left first): an open pip spends one slot, a spent pip
 * gives one back. Spent pips sit on the right, as a tally does.
 */
export function tapSlotPip(slot: SlotLevel, index: number): number {
  const open = slot.total - slot.used;
  return index < open ? slot.used + 1 : Math.max(0, slot.used - 1);
}

/** The lowest level at or above `level` with an open slot, or null. */
export function slotForSpell(values: CharacterValues, level: number): { field: string; used: number } | null {
  for (const slot of spellSlots(values)) {
    if (slot.level >= level && slot.used < slot.total) return { field: `slot${slot.level}Used`, used: slot.used + 1 };
  }
  const pact = pactSlots(values);
  if (pact && pact.level >= level && pact.used < pact.total) return { field: "pactUsed", used: pact.used + 1 };
  return null;
}

/** Short rest: a Warlock's pact slots come back (other recoveries are spent Hit Dice, by hand). */
export function shortRestPatch(values: CharacterValues): CharacterPatch {
  return num(values.pactUsed) > 0 ? { pactUsed: 0 } : {};
}

/**
 * Long rest (2024): all HP and all spent Hit Point Dice back, every slot back, death saves
 * cleared, and one Exhaustion level removed.
 */
export function longRestPatch(values: CharacterValues): CharacterPatch {
  const hp = hitPoints(values);
  const patch: CharacterPatch = {
    hp: { ...(values.hp as object), current: hp.max },
    hpTemp: 0,
    hitDiceSpent: 0,
    ...longRestClassPatch(values),
    deathSuccesses: 0,
    deathFailures: 0,
    pactUsed: 0,
  };
  for (let level = 1; level <= 9; level += 1) patch[`slot${level}Used`] = 0;
  const exhaustion = exhaustionLevel(values);
  return exhaustion > 0 ? { ...patch, ...exhaustionPatch(values, exhaustion - 1) } : patch;
}

// ---------------------------------------------------------------------------
// Exhaustion (SRD 5.2.1): levels 1–6; a D20 Test is reduced by 2 per level, Speed by 5 feet.
// ---------------------------------------------------------------------------

export const MAX_EXHAUSTION = 6;

/** The Exhaustion level; a sheet that has the condition without a level counts as level 1. */
export function exhaustionLevel(values: CharacterValues): number {
  const level = Math.min(MAX_EXHAUSTION, Math.max(0, Math.trunc(num(values.exhaustion))));
  if (level > 0) return level;
  return conditionsOf(values).includes("exhaustion") ? 1 : 0;
}

/** Sets the level; the `exhaustion` condition is on exactly while the level is above 0. */
export function exhaustionPatch(values: CharacterValues, level: number): CharacterPatch {
  const next = Math.min(MAX_EXHAUSTION, Math.max(0, Math.trunc(level)));
  const others = conditionsOf(values).filter((id) => id !== "exhaustion");
  return { exhaustion: next, conditions: next > 0 ? [...others, "exhaustion"] : others };
}

/**
 * Speed less 5 feet per Exhaustion level, and 10 feet in armor whose Strength requirement the
 * character does not meet (SRD 5.2.1 p.92), as the sheet's `currentSpeed` formula does.
 */
export function speedOf(values: CharacterValues): number {
  return Math.max(0, num(values.speed) - (armorSlows(values) ? 10 : 0) - 5 * exhaustionLevel(values));
}

/** The Speed the tile shows: the player's override of `currentSpeed` wins (B-024), else `speedOf`. */
export function speedShown(values: CharacterValues, overridden: boolean): number {
  return overridden ? num(values.currentSpeed) : speedOf(values);
}

/** Worn armor whose Strength requirement is above the character's Strength (SRD 5.2.1 p.92). */
export function armorSlows(values: CharacterValues): boolean {
  return num(values.armorStrReq) > num(values.str, 10);
}

/**
 * The data a roll reads with the D20 Test penalty set from the play view's Exhaustion level. Every
 * d20 roll of the sheet is `{{#d20[@field-@d20Penalty]}}` (edit mode, print and the play view
 * alike, T4F-R-F007); the sheet formula derives `d20Penalty` from the level field, and this also
 * counts the bare condition as level 1. Rolls that do not read it (damage, healing) are unchanged.
 */
export function exhaustionRollData(data: Record<string, unknown>, level: number): Record<string, unknown> {
  return { ...data, d20Penalty: 2 * level };
}

// ---------------------------------------------------------------------------
// Death saving throws (SRD 5.2.1)
// ---------------------------------------------------------------------------

export type DeathSaveOutcome = "success" | "failure" | "twoFailures" | "revived" | "stable" | "dead";

/**
 * One Death Saving Throw: 10 or higher succeeds, lower fails; a natural 1 counts as two failures,
 * a natural 20 regains 1 Hit Point. Three successes make the character Stable, which resets both
 * tallies, as regaining any Hit Points does.
 */
/**
 * The natural d20 of a d20 macro roll (B-022): with advantage or disadvantage the macro rolls two
 * d20s first and keeps the higher or the lower; any extra dice come after them.
 */
export function keptD20(rolls: readonly number[], adv: number): number | undefined {
  if (adv === 0 || rolls.length < 2) return rolls[0];
  return adv > 0 ? Math.max(rolls[0], rolls[1]) : Math.min(rolls[0], rolls[1]);
}

export function deathSave(values: CharacterValues, natural: number, total: number): { outcome: DeathSaveOutcome; patch: CharacterPatch } {
  const successes = Math.min(3, Math.max(0, num(values.deathSuccesses)));
  const failures = Math.min(3, Math.max(0, num(values.deathFailures)));
  if (natural === 20) {
    return { outcome: "revived", patch: { hp: { ...(values.hp as object), current: 1 }, deathSuccesses: 0, deathFailures: 0 } };
  }
  if (natural === 1 || total < 10) {
    const next = Math.min(3, failures + (natural === 1 ? 2 : 1));
    return { outcome: next >= 3 ? "dead" : natural === 1 ? "twoFailures" : "failure", patch: { deathFailures: next } };
  }
  const next = successes + 1;
  if (next >= 3) return { outcome: "stable", patch: { deathSuccesses: 0, deathFailures: 0 } };
  return { outcome: "success", patch: { deathSuccesses: next } };
}

// ---------------------------------------------------------------------------
// Casting: slot level, ritual, concentration
// ---------------------------------------------------------------------------

export interface CastOption {
  /** The field the slot is spent from: `slot2Used`, `pactUsed`. */
  field: string;
  level: number;
  left: number;
  pact: boolean;
}

/** Every slot the spell can be cast with: its level or higher, open slots only, pact magic last. */
export function castOptions(values: CharacterValues, spellLevel: number): CastOption[] {
  const options: CastOption[] = spellSlots(values)
    .filter((slot) => slot.level >= spellLevel && slot.used < slot.total)
    .map((slot) => ({ field: `slot${slot.level}Used`, level: slot.level, left: slot.total - slot.used, pact: false }));
  const pact = pactSlots(values);
  if (pact && pact.level >= spellLevel && pact.used < pact.total) {
    options.push({ field: "pactUsed", level: pact.level, left: pact.total - pact.used, pact: true });
  }
  return options;
}

/**
 * Whether the spell can be cast as a Ritual (10 minutes longer, no slot): it has the Ritual tag
 * and is prepared, or sits in a Wizard's spellbook (Ritual Adept).
 */
export function canCastRitual(values: CharacterValues, spell: Record<string, unknown>): boolean {
  if (spell.ritual !== true || num(spell.level) < 1) return false;
  if (spell.prepared === true) return true;
  return rows(values.features).some((row) => /\/ritual-adept(-l\d+)?$/.test(text(row.ref)));
}

/** What the sheet keeps for the spell being concentrated on: its ref, or its name without one. */
export function concentrationKey(spell: Record<string, unknown>): string {
  return text(spell.ref) || text(spell.name);
}

/**
 * The writes of one cast: the slot spent (none for a ritual), and a Concentration spell replacing
 * the one held before (`replaced`: its key, when there was another).
 */
export function castPatch(
  values: CharacterValues,
  spell: Record<string, unknown>,
  via: CastOption | "ritual",
): { patch: CharacterPatch; replaced: string | null } {
  const patch: CharacterPatch = via === "ritual" ? {} : { [via.field]: num(values[via.field]) + 1 };
  let replaced: string | null = null;
  if (spell.concentration === true) {
    const previous = text(values.concentration);
    const next = concentrationKey(spell);
    if (previous && previous !== next) replaced = previous;
    patch.concentration = next;
  }
  return { patch, replaced };
}

/** Leveled spells prepared from somewhere other than the class (a feat, a species, Druidic): always prepared. */
export function alwaysPreparedCount(spells: unknown): number {
  return rows(spells).filter((spell) => num(spell.level) > 0 && spell.prepared === true && (text(spell.source) || "class") !== "class").length;
}

// ---------------------------------------------------------------------------
// Dice in a feature's rules text
// ---------------------------------------------------------------------------

const DIE = "(?:4|6|8|10|12|20|100)";
const PROFICIENCY_DICE = [
  new RegExp(`number of d(${DIE})s? equal to your Proficiency Bonus`, "i"),
  new RegExp(`(?:等於|等同)你?(?:的)?熟練加值[^。d]{0,4}d(${DIE})`),
];

/**
 * The dice a feature rolls, from its rules text: "a number of d4s equal to your Proficiency
 * Bonus" (a pack species trait, A3-05) at the character's bonus, else each written `NdM` (Second Wind's 1d10).
 */
export function featureDice(body: string | null, profBonus: number): string[] {
  if (!body) return [];
  for (const pattern of PROFICIENCY_DICE) {
    const match = pattern.exec(body);
    if (match) return [`${Math.max(1, profBonus)}d${match[1]}`];
  }
  const found = [...body.matchAll(new RegExp(`(?<![\\w.])(\\d+)d(${DIE})(?![\\d])`, "g"))].map((match) => `${match[1]}d${match[2]}`);
  return [...new Set(found)].slice(0, 3);
}

// ---------------------------------------------------------------------------
// Spells
// ---------------------------------------------------------------------------

export interface SpellGroup {
  level: number;
  spells: Record<string, unknown>[];
}

export function spellGroups(spells: unknown): SpellGroup[] {
  const groups = new Map<number, Record<string, unknown>[]>();
  for (const spell of rows(spells)) {
    const level = Math.min(9, Math.max(0, Math.trunc(num(spell.level))));
    groups.set(level, [...(groups.get(level) ?? []), spell]);
  }
  return [...groups.entries()].sort(([a], [b]) => a - b).map(([level, list]) => ({ level, spells: list }));
}

/** Prepared leveled spells (cantrips are always ready and do not count). */
export function preparedCount(spells: unknown): number {
  return rows(spells).filter((spell) => num(spell.level) > 0 && spell.prepared === true).length;
}

/**
 * A leveled spell's dice cast from a slot of `castLevel`: `step` (its higher-level dice) once for
 * each slot level above the spell's (SRD 5.2.1 Using a Higher-Level Spell Slot). Same dice add up
 * (Burning Hands from a level 2 slot: 3d6 + 1d6 = 4d6); other dice are appended.
 */
export function upcastDice(base: string, step: string | null | undefined, spellLevel: number, castLevel: number): string {
  const above = Math.max(0, castLevel - spellLevel);
  const extra = step ? /^(\d+)d(\d+)$/.exec(step) : null;
  if (above === 0 || !extra) return base;
  const count = Number(extra[1]) * above;
  const same = /^(\d+)d(\d+)$/.exec(base);
  if (same && same[2] === extra[2]) return `${Number(same[1]) + count}d${same[2]}`;
  return `${base}+${count}d${extra[2]}`;
}

/**
 * Healing dice plus the caster's spellcasting ability modifier, for a spell whose healing adds it
 * (SRD 5.2.1 Cure Wounds: 2d8 plus the modifier; an upcast adds dice only). A zero modifier adds
 * nothing; a negative one is subtracted.
 */
export function healWithSpellMod(dice: string, addsMod: boolean | undefined, spellMod: number): string {
  if (!addsMod || !Number.isFinite(spellMod) || spellMod === 0) return dice;
  return spellMod < 0 ? `${dice}-${Math.abs(spellMod)}` : `${dice}+${spellMod}`;
}

/** A cantrip's damage dice at a character level: one more die at levels 5, 11 and 17. */
export function cantripDice(dice: string, characterLevel: number): string {
  const match = /^(\d+)d(\d+)$/.exec(dice);
  if (!match) return dice;
  const tier = 1 + (characterLevel >= 5 ? 1 : 0) + (characterLevel >= 11 ? 1 : 0) + (characterLevel >= 17 ? 1 : 0);
  return `${Number(match[1]) * tier}d${match[2]}`;
}

// ---------------------------------------------------------------------------
// Weapons
// ---------------------------------------------------------------------------

/**
 * An ability modifier: the derived value when the caller has one (the sheet), else the formula
 * over the stored score (the compendium writes from stored data only).
 */
export function abilityMod(values: CharacterValues, ability: string): number {
  if (ability === "spell") return num(values.spellMod);
  return num(values[`${ability}Mod`], Math.floor((num(values[ability], 10) - 10) / 2));
}

export function proficiencyBonus(values: CharacterValues): number {
  return num(values.profBonus, 2 + Math.floor((Math.max(1, num(values.level, 1)) - 1) / 4));
}

/** SRD 5.2.1 Archery: "a +2 bonus to attack rolls you make with Ranged weapons". */
export const ARCHERY_BONUS = 2;

/**
 * The sheet fields a feat sets besides its feats row, when it is added on the sheet (the wizard
 * sets them through its own effects): Archery gives the ranged attack bonus.
 */
export function featSheetPatch(ref: string): CharacterPatch | undefined {
  return ref === "feat:archery" ? { rangedAttackBonus: ARCHERY_BONUS } : undefined;
}

/**
 * A weapons row's attack and damage modifiers, the same sum as the sheet formula `weapons[].attack`:
 * a row marked `ranged` adds the character's ranged attack bonus (Archery) to the attack roll, not
 * to damage (SRD 5.2.1 Archery). Edit mode, print and the bot evaluate that formula.
 */
export function weaponAttack(
  values: CharacterValues,
  row: Record<string, unknown>,
): { attack: number; damageMod: number } {
  const mod = abilityMod(values, text(row.ability) || "str");
  const magic = num(row.magic);
  const ranged = row.ranged === true ? num(values.rangedAttackBonus) : 0;
  return { attack: mod + (row.proficient === false ? 0 : proficiencyBonus(values)) + magic + ranged, damageMod: mod + magic };
}

/** A weapon item of the wizard game data (`game/weapons.json`). */
export interface GameWeapon {
  id: string;
  ref: string;
  category?: string;
  type?: string;
  damage?: { dice?: string; type?: string };
  properties?: string[];
  mastery?: string[];
  range?: string;
}

const RANGED_TYPES = new Set(["R"]);

/** Finesse uses the higher of STR and DEX, a ranged weapon DEX, anything else STR. */
export function weaponAbility(values: CharacterValues, weapon: GameWeapon): "str" | "dex" {
  const properties = weapon.properties ?? [];
  if (properties.includes("itemProperty:finesse")) return abilityMod(values, "dex") > abilityMod(values, "str") ? "dex" : "str";
  return RANGED_TYPES.has(weapon.type ?? "") ? "dex" : "str";
}

/** Whether the character can use Weapon Mastery: a class feature that grants it, or masteries picked. */
export function hasWeaponMastery(values: CharacterValues): boolean {
  if (rows(values.weaponMasteries).length > 0) return true;
  return rows(values.features).some((row) => /\/weapon-mastery(-l\d+)?$/.test(text(row.ref)));
}

/**
 * Whether the training text covers a weapon. The wizard writes it from class data in the
 * viewer's locale ("Simple and Martial weapons", "簡易武器"); an unknown text counts as trained.
 */
export function proficientWith(values: CharacterValues, weapon: GameWeapon): boolean {
  const training = text(values.weaponProficiencies).toLowerCase();
  if (training.trim() === "") return true;
  const martial = /martial|軍用/.test(training);
  const simple = /simple|簡易/.test(training);
  if (!martial && !simple) return true;
  return weapon.category === "martial" ? martial : simple || martial;
}

export interface AttackLabels {
  name: string;
  damageType: (code: string) => string;
  mastery: (ref: string) => string;
  property: (ref: string) => string;
}

/** The weapons row "Add as attack" writes for an inventory or compendium weapon (S13). */
export function weaponAttackRow(
  values: CharacterValues,
  weapon: GameWeapon,
  labels: AttackLabels,
  id: string,
  origin = "srd",
): Record<string, unknown> {
  const masteryRef = weapon.mastery?.[0] ?? "";
  const notes = [
    ...(weapon.properties ?? []).map((property) => labels.property(property)),
    ...(weapon.range ? [weapon.range] : []),
  ].filter(Boolean);
  return {
    id,
    name: labels.name,
    ability: weaponAbility(values, weapon),
    proficient: proficientWith(values, weapon),
    magic: 0,
    damageDice: weapon.damage?.dice ?? "",
    damageType: weapon.damage?.type ? labels.damageType(weapon.damage.type) : "",
    mastery: masteryRef && hasWeaponMastery(values) ? labels.mastery(masteryRef) : "",
    notes: notes.join(" · "),
    ranged: RANGED_TYPES.has(weapon.type ?? ""),
    ref: weapon.ref,
    origin,
  };
}

/** Game weapons by ref (`baseItem:dagger`). */
export function weaponsByRef(gameWeapons: unknown): Map<string, GameWeapon> {
  const map = new Map<string, GameWeapon>();
  for (const item of rows(gameWeapons)) {
    if (typeof item.ref === "string") map.set(item.ref, item as unknown as GameWeapon);
  }
  return map;
}

export function conditionsOf(values: CharacterValues): string[] {
  return Array.isArray(values.conditions) ? values.conditions.filter((item): item is string => typeof item === "string") : [];
}
