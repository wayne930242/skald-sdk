import { progressionAt } from "../../reference/class-progression";
import { combinedPact, combinedSlots, type CasterKind, type MulticlassRules } from "../../reference/multiclass";
import { SKILLS } from "../play/play-model";
import { slotsFrom, type ClassInfo, type LevelUpFeature, type LevelUpSubclass, type SlotsOffer } from "./plan";

/**
 * The multiclass parts of a level-up plan (CLASS-IMPL §7.4): combined spell slots over every sheet
 * class, the proficiencies a new class gives, Extra Attack that does not stack, Unarmored Defense.
 * Pure; `plan.ts` assembles them.
 */

/** A sheet class as the slot math reads it (its known subclass may make it a third caster). */
export interface PlanClass {
  classId: string;
  level: number;
  info: ClassInfo | null;
  subclass: LevelUpSubclass | null;
}

export type ArmorGain = "armorLight" | "armorMedium" | "armorShields";

export interface GainsOffer {
  /** False: the class has no multiclass data (a note asks the player to add proficiencies by hand). */
  known: boolean;
  /** Armor toggles the sheet does not have yet. */
  armor: ArmorGain[];
  /** Labels to append to `weaponProficiencies` (the localized "Martial weapons" label when absent). */
  weapons: string[];
  /** Skill picks: `count` of the sheet's skill ids (`sleightOfHand`) not yet proficient. */
  skills: null | { count: number; from: string[] };
  /** Tool rows to add (`grant`, not on the sheet yet) and a named choice. */
  tools: { grant: Array<{ ref: string; name: string }>; choice: null | { category: string; count: number } };
}

const ARMOR_FIELD: Record<"light" | "medium" | "shield", ArmorGain> = { light: "armorLight", medium: "armorMedium", shield: "armorShields" };

const rowsOf = (value: unknown): Array<Record<string, unknown>> =>
  Array.isArray(value) ? value.filter((row): row is Record<string, unknown> => typeof row === "object" && row !== null) : [];
const camel = (id: string) => id.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());

function kindOf(entry: PlanClass): CasterKind | null {
  return entry.info?.casting ?? (entry.subclass?.casting === "third" ? "third" : null);
}

function combined(classes: PlanClass[]): { slots: number[] | null; pact: { slots: number; level: number } | null } {
  const byId = new Map(classes.map((entry) => [entry.classId, entry.info]));
  const rows = classes.map((entry) => ({ classId: entry.classId, kind: kindOf(entry), level: entry.level }));
  const row = (id: string, level: number) => progressionAt(byId.get(id)?.progression, level);
  return {
    slots: combinedSlots(rows, (id, level) => row(id, level)?.slots ?? null),
    pact: combinedPact(rows, (id, level) => row(id, level)?.pact ?? null),
  };
}

/** Slots and Pact Magic of every sheet class before and after the run (`combinedSlots` / `combinedPact`). */
export function combinedSlotsOffer(data: Record<string, unknown>, before: PlanClass[], after: PlanClass[]): SlotsOffer | null {
  const from = combined(before);
  const to = combined(after);
  return slotsFrom(data, from.slots, to.slots, from.pact, to.pact);
}

/** What a new class gives as a multiclass, minus what the sheet already has; never saving throws. */
export function gainsOffer(
  data: Record<string, unknown>,
  rules: MulticlassRules,
  options: { nameOf?: (ref: string) => string; martialWeaponsLabel?: string; martialWeaponsLabels?: readonly string[] },
): GainsOffer {
  const armor = rules.gains.armor.map((kind) => ARMOR_FIELD[kind]).filter((field) => data[field] !== true);
  const label = options.martialWeaponsLabel ?? "Martial weapons";
  const weaponText = (typeof data.weaponProficiencies === "string" ? data.weaponProficiencies : "").toLowerCase();
  const hasMartial = [label, ...(options.martialWeaponsLabels ?? []), "martial"].map((needle) => needle.toLowerCase()).some((needle) => weaponText.includes(needle));
  const weapons = rules.gains.weapons.includes("martial") && !hasMartial ? [label] : [];
  let skills: GainsOffer["skills"] = null;
  if (rules.gains.skills && rules.gains.skills.count > 0) {
    const list = rules.gains.skills.from === "any" ? SKILLS.map((skill) => skill.id) : rules.gains.skills.from.map(camel);
    const from = list.filter((id) => (data[`${id}Prof`] ?? "none") === "none");
    if (from.length > 0) skills = { count: Math.min(rules.gains.skills.count, from.length), from };
  }
  const onSheet = new Set(rowsOf(data.toolProficiencies).map((row) => row.ref).filter((ref): ref is string => typeof ref === "string" && ref !== ""));
  const nameOf = options.nameOf ?? ((ref: string) => ref.slice(ref.lastIndexOf(":") + 1));
  const grant = (rules.gains.tools?.grant ?? []).filter((ref) => !onSheet.has(ref)).map((ref) => ({ ref, name: nameOf(ref) }));
  const choice = rules.gains.tools?.choice ?? null;
  return { known: rules.known, armor, weapons, skills, tools: { grant, choice: choice ? { ...choice } : null } };
}

/** Offered Extra Attack features while another class's Extra Attack row is on the sheet: they never stack. */
export function extraAttackStacks(data: Record<string, unknown>, classId: string, offered: readonly LevelUpFeature[]): string[] {
  const isExtraAttack = (ref: string) => /^classFeature:[^/]+\/extra-attack(-l\d+)?$/.test(ref);
  const others = Object.values(data)
    .flatMap(rowsOf)
    .some((row) => typeof row.ref === "string" && isExtraAttack(row.ref) && !row.ref.startsWith(`classFeature:${classId}/`));
  return others ? offered.filter((feature) => isExtraAttack(feature.ref)).map((feature) => feature.ref) : [];
}

/** A new class's Unarmored Defense: settable only while the sheet uses none (one AC method at a time). */
export function unarmoredOffer(data: Record<string, unknown>, value: "barbarian" | "monk" | null): { value: "barbarian" | "monk"; settable: boolean } | null {
  if (!value) return null;
  const current = typeof data.unarmoredDefense === "string" ? data.unarmoredDefense : "";
  return { value, settable: current === "" || current === "none" };
}
