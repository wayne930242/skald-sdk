import { progressionAt } from "../../reference/class-progression";
import { multiclassRulesOf, prerequisites, type Prerequisite } from "../../reference/multiclass";
import { classIssues, sheetClasses, type ClassIssue, type SheetClass } from "../play/class-model";
import { ABILITIES, type Ability } from "../play/play-model";
import type { ClassInfo, ClassOrigin, LevelUpFeature, LevelUpSubclass } from "./class-data";
import { combinedSlotsOffer, extraAttackStacks, gainsOffer, thirdSlotsOffer, unarmoredOffer, type GainsOffer, type PlanClass } from "./multiclass";
import { LEVEL_UP_RULES } from "./rules";
import { slotsFrom, type SlotsOffer } from "./slots";

/**
 * The level-up helper's offer (phase 2b §4.1): what raising a D&D 2024 character one level gives,
 * for a built-in, Drive-pack or homebrew class alike. Pure: the caller loads the class.
 */

export { LEVEL_UP_RULES } from "./rules";
export { slotsDefaultOn, slotsFrom, type SlotsOffer } from "./slots";
export {
  classInfoOf,
  featureLevel,
  type ClassInfo,
  type ClassInfoEntry,
  type ClassInfoInput,
  type ClassOrigin,
  type FeatureChoice,
  type LevelUpFeature,
  type LevelUpSubclass,
} from "./class-data";

export interface LevelUpFeatureOffer extends LevelUpFeature {
  /** `<c>-subclass-l<N>` / `subclass-feature-l<N>`: hidden when the subclass's own features are offered. */
  placeholder: boolean;
}

export interface CountChange {
  before: number;
  after: number;
}

/** Which class a run raises: an existing sheet class (`""` = a starting class with no id) or a new one. */
export type LevelUpTarget = { kind: "advance"; classId: string } | { kind: "add"; classInfo: ClassInfo };

/** The `multiclass` row an added class writes (with `id`, `subclass ""`, `level 1`, `hitDiceSpent 0`). */
export interface NewClassRow {
  classId: string;
  ref: string;
  name: string;
  origin: ClassOrigin;
  hitDie: number;
  spellAbility: string;
}

export interface LevelUpPlan {
  /** The class level (the character level on a single-class plan). */
  fromLevel: number;
  toLevel: number;
  /** False: no class data (no `classId`, a custom class, a disabled pack): level and hit points only. */
  classFound: boolean;
  classId: string | null;
  hp: { faces: number; average: number };
  /** Class features at the target level not already on the sheet. */
  features: LevelUpFeatureOffer[];
  subclass: {
    /** The sheet's subclass, from a subclass feature row or its `subclass` text. */
    known: LevelUpSubclass | null;
    /** The sheet's `subclass` text. */
    text: string;
    firstLevel: number | null;
    /** Offer the picker (or 「稍後再選」). */
    choose: boolean;
    options: LevelUpSubclass[];
    /** Subclass features to add, by subclass ref: the known one's at the target level; a newly picked one's up to it. */
    offers: Record<string, LevelUpFeature[]>;
  };
  asi: null | { feature: string; abilities: Record<Ability, number>; cap: number; points: number; featRef: string; featName: string };
  epicBoon: boolean;
  slots: SlotsOffer | null;
  /**
   * The slots offer when the player picks a subclass that casts (a third caster, one with its own
   * Spellcasting feature), by subclass ref: it replaces `slots` while that subclass is picked (`slotsFor`).
   */
  slotsBySubclass?: Record<string, SlotsOffer | null>;
  spells: null | {
    cantrips?: CountChange;
    prepared?: CountChange;
    /** Spells on the sheet; on a multiclass plan only the target class's (`castingClass`). */
    sheet: { cantrips: number; prepared: number };
    list: string;
    /** Multiclass plan: the target class's `castingClass` (`""` = the starting class). */
    castingClass?: string;
  };
  /** Other table columns that change (Rages 3→4, Eldritch Invocations 1→3, author columns): info only. */
  columns: Array<{ index: number; label: string; before: string | number; after: string | number }>;

  // Set on a multiclass plan (the input names `classes` or `target`); absent on L1's single-class shorthand.
  target?: { kind: "advance"; classId: string; rowId?: string } | { kind: "add"; classId: string };
  /** The total character level. */
  character?: { from: number; to: number };
  /** The sheet's class invariants broken (`classIssues`): nothing is offered and apply refuses until fixed. */
  issues?: ClassIssue[];
  /** Add: unmet 13s over every sheet class and the new one (shown, never blocking: the DM-approval checkbox allows it). */
  prerequisites?: Prerequisite[];
  /** Add: the proficiencies the new class gives a multiclass character, minus what the sheet has. */
  gains?: GainsOffer | null;
  /** Offered Extra Attack features another class already gives: they start unchecked (the "does not stack" note). */
  extraAttackStacks?: string[];
  /** Add of a class with Unarmored Defense: settable only when the sheet has none, else a note. */
  unarmoredDefense?: null | { value: "barbarian" | "monk"; settable: boolean };
  /** A sheet class has no data: the slots offer is hidden (a note asks the player to adjust slots by hand). */
  slotsUnknown?: boolean;
  /** Add: the new row. */
  newClass?: NewClassRow;
}

export interface LevelUpInput {
  data: Record<string, unknown>;
  /** The starting class (shorthand when `classes` does not hold it). */
  classInfo: ClassInfo | null;
  /** Every sheet class by `classId` (null = no data); present or `target` present = a multiclass plan. */
  classes?: ReadonlyMap<string, ClassInfo | null>;
  /** Default: advance the starting class. */
  target?: LevelUpTarget;
  /** Localized entry names (a granted tool row's name); default the ref's last segment. */
  nameOf?: (ref: string) => string;
  /** Localized "Martial weapons" label appended to `weaponProficiencies`; default "Martial weapons". */
  martialWeaponsLabel?: string;
  /** 「Martial weapons」 in every catalog: `weaponProficiencies` holding any of them already has it. */
  martialWeaponsLabels?: readonly string[];
  /** Default: the current level + 1 (one level per run). */
  toLevel?: number;
  /** The localized name of the Ability Score Improvement feat row. */
  asiFeatName?: string;
}

const num = (value: unknown, fallback = 0) => (typeof value === "number" && Number.isFinite(value) ? value : fallback);
const rowsOf = (value: unknown): Array<Record<string, unknown>> =>
  Array.isArray(value) ? value.filter((row): row is Record<string, unknown> => typeof row === "object" && row !== null) : [];
const leafOf = (ref: string) => ref.slice(ref.lastIndexOf("/") + 1);
const normalize = (text: string) => text.trim().toLowerCase();

/** `classFeature:<c>/<c>-subclass-l<N>` or `classFeature:<c>/subclass-feature-l<N>`: the subclass's slot in the class table. */
export function isPlaceholder(classId: string, ref: string): boolean {
  if (ref !== `classFeature:${classId}/${leafOf(ref)}`) return false;
  const slug = /^(.+)-l\d+$/.exec(leafOf(ref))?.[1];
  return slug === `${classId}-subclass` || slug === "subclass-feature";
}

/** The refs of every list row on the sheet. */
export function sheetRefs(data: Record<string, unknown>): Set<string> {
  const refs = new Set<string>();
  for (const value of Object.values(data)) for (const row of rowsOf(value)) if (typeof row.ref === "string" && row.ref) refs.add(row.ref);
  return refs;
}

/** The class's subclass on the sheet: a subclass feature row of that class, else its subclass text. */
export function knownSubclass(data: Record<string, unknown>, info: ClassInfo, subclassText: string = typeof data.subclass === "string" ? data.subclass : ""): LevelUpSubclass | null {
  for (const row of rowsOf(data.features)) {
    const ref = typeof row.ref === "string" ? row.ref : "";
    const parts = ref.startsWith("subclassFeature:") ? ref.slice("subclassFeature:".length).split("/") : [];
    if (parts.length !== 3 || parts[0] !== info.id) continue;
    const id = `${parts[0]}/${parts[1]}`;
    const found = info.subclasses.find((subclass) => subclass.id === id);
    if (found) return found;
    const name = subclassText.trim() ? subclassText.trim() : parts[1];
    return { ref: `subclass:${id}`, id, name, names: [name], features: [] };
  }
  const text = normalize(subclassText);
  if (!text) return null;
  return info.subclasses.find((subclass) => subclass.names.some((name) => normalize(name) === text)) ?? null;
}

/** The table row at a class level; level 0 (a class not taken yet) reads as an empty row. */
function rowAt(info: ClassInfo, level: number) {
  return level === 0 ? { level: 0, columns: [], features: [] } : progressionAt(info.progression, level);
}

function slotsOffer(data: Record<string, unknown>, info: ClassInfo, from: number, to: number): SlotsOffer | null {
  const before = rowAt(info, from);
  const after = rowAt(info, to);
  if (!before || !after || (!after.slots && !after.pact)) return null;
  return slotsFrom(data, before.slots ?? null, after.slots ?? null, after.pact ? before.pact ?? { slots: 0, level: 0 } : null, after.pact ?? null);
}

/** Spell row sources that are not the class's own (`spells.source`). */
const NOT_CLASS_SPELL: ReadonlySet<string> = new Set(["magic-initiate", "species"]);

function spellsOffer(data: Record<string, unknown>, info: ClassInfo, from: number, to: number, castingClass?: string): LevelUpPlan["spells"] {
  const before = rowAt(info, from);
  const after = rowAt(info, to);
  if (!before || !after || (after.cantrips === undefined && after.prepared === undefined)) return null;
  // The class's own spells (UAT m14): a background or species spell (Magic Initiate) is not one, and on a multiclass sheet only this class's count.
  const spells = rowsOf(data.spells).filter(
    (row) => !NOT_CLASS_SPELL.has(typeof row.source === "string" ? row.source : "") && (castingClass === undefined || (typeof row.castingClass === "string" ? row.castingClass : "") === castingClass),
  );
  const out: NonNullable<LevelUpPlan["spells"]> = {
    sheet: {
      cantrips: spells.filter((row) => num(row.level) === 0).length,
      prepared: spells.filter((row) => num(row.level) >= 1 && row.prepared === true).length,
    },
    list: info.spellList ?? info.id,
    ...(castingClass !== undefined ? { castingClass } : {}),
  };
  if (after.cantrips !== undefined) out.cantrips = { before: before.cantrips ?? 0, after: after.cantrips };
  if (after.prepared !== undefined) out.prepared = { before: before.prepared ?? 0, after: after.prepared };
  return out;
}

function columnChanges(info: ClassInfo, from: number, to: number): LevelUpPlan["columns"] {
  const before = rowAt(info, from);
  const after = rowAt(info, to);
  if (!before || !after) return [];
  return after.columns
    .map((column) => ({ index: column.index, label: column.label, before: before.columns.find((c) => c.index === column.index)?.value ?? 0, after: column.value }))
    .filter((column) => column.before !== column.after);
}

function emptyPlan(fromLevel: number, toLevel: number, info: ClassInfo | null, faces: number, subclassText: string): LevelUpPlan {
  return {
    fromLevel,
    toLevel,
    classFound: info !== null,
    classId: info?.id ?? null,
    hp: { faces, average: Math.floor(faces / 2) + 1 },
    features: [],
    subclass: { known: null, text: subclassText, firstLevel: null, choose: false, options: [], offers: {} },
    asi: null,
    epicBoon: false,
    slots: null,
    spells: null,
    columns: [],
  };
}

/** One class's offer from class level `from` to `to` (L1's logic, at the class level). */
function classOffer(data: Record<string, unknown>, info: ClassInfo | null, from: number, to: number, faces: number, subclassText: string, asiFeatName: string | undefined, castingClass?: string): LevelUpPlan {
  const plan = emptyPlan(from, to, info, faces, subclassText);
  if (!info) return plan;
  const onSheet = sheetRefs(data);
  plan.features = info.features
    .filter((feature) => feature.level === to && !onSheet.has(feature.ref) && !feature.optionOf)
    .map((feature) => ({ ...feature, placeholder: isPlaceholder(info.id, feature.ref) }));

  const placeholderLevels = info.features.filter((feature) => leafOf(feature.ref).startsWith(`${info.id}-subclass-`)).map((feature) => feature.level);
  const subclassLevels = info.subclasses.flatMap((subclass) => subclass.features.map((feature) => feature.level));
  const firstLevel = placeholderLevels.length ? Math.min(...placeholderLevels) : subclassLevels.length ? Math.min(...subclassLevels) : null;
  const known = knownSubclass(data, info, subclassText);
  plan.subclass.known = known;
  plan.subclass.firstLevel = firstLevel;
  if (known) {
    plan.subclass.offers[known.ref] = known.features.filter((feature) => feature.level === to && !onSheet.has(feature.ref) && !feature.optionOf);
  } else if (firstLevel !== null && to >= firstLevel) {
    plan.subclass.choose = true;
    plan.subclass.options = info.subclasses;
    for (const option of info.subclasses) {
      plan.subclass.offers[option.ref] = option.features.filter((feature) => feature.level <= to && !onSheet.has(feature.ref) && !feature.optionOf);
    }
  }

  const asi = info.features.find((feature) => feature.level === to && feature.ref === `classFeature:${info.id}/ability-score-improvement-l${to}`);
  if (asi) {
    plan.asi = {
      feature: asi.ref,
      abilities: Object.fromEntries(ABILITIES.map((ability) => [ability, num(data[ability], 10)])) as Record<Ability, number>,
      cap: LEVEL_UP_RULES.abilityCap,
      points: LEVEL_UP_RULES.asiPoints,
      featRef: LEVEL_UP_RULES.asiFeatRef,
      featName: asiFeatName ?? "Ability Score Improvement",
    };
  }
  plan.epicBoon = info.features.some((feature) => feature.ref === `classFeature:${info.id}/epic-boon-l${to}`);
  plan.slots = slotsOffer(data, info, from, to) ?? (known ? thirdSlotsOffer(data, info, known, from, to) : null);
  for (const option of plan.subclass.options) {
    // A subclass picked in this run casts only after it: before, the class had none of its slots (from 0).
    if (option.casting === "third" && info.casting === null) (plan.slotsBySubclass ??= {})[option.ref] = thirdSlotsOffer(data, info, option, 0, to);
  }
  plan.spells = spellsOffer(data, info, from, to, castingClass);
  plan.columns = columnChanges(info, from, to);
  return plan;
}

/**
 * The offer for one level up, or null at the top level. `toLevel` must be the next character level
 * (`LEVEL_UP_RULES.levelsPerRun`). Without `classes` and `target` it is L1's single-class plan.
 */
export function levelUpPlan(input: LevelUpInput): LevelUpPlan | null {
  const { data } = input;
  const character = Math.max(1, Math.trunc(num(data.level, 1)));
  if (character >= LEVEL_UP_RULES.maxLevel) return null;
  const toLevel = input.toLevel ?? character + LEVEL_UP_RULES.levelsPerRun;
  if (toLevel !== character + LEVEL_UP_RULES.levelsPerRun) throw new RangeError(`Level up goes one level at a time (${character} → ${character + 1})`);
  const subclassText = typeof data.subclass === "string" ? data.subclass : "";
  if (input.classes === undefined && input.target === undefined) {
    return classOffer(data, input.classInfo, character, toLevel, num(data.hitDieFaces, 8), subclassText, input.asiFeatName);
  }
  return multiclassPlan(input, character);
}

function multiclassPlan(input: LevelUpInput, character: number): LevelUpPlan {
  const { data } = input;
  const sheet = sheetClasses(data);
  const start = sheet[0];
  const infoOf = (sheetClass: SheetClass): ClassInfo | null =>
    input.classes?.get(sheetClass.classId) ?? (sheetClass.start ? input.classInfo : null) ?? null;
  const common = { character: { from: character, to: character + 1 } };
  const issues = classIssues(data);
  if (issues.length > 0) {
    return { ...emptyPlan(start.level, start.level + 1, infoOf(start), start.hitDie, start.subclass), ...common, target: { kind: "advance", classId: start.classId }, issues };
  }
  const target = input.target ?? { kind: "advance" as const, classId: start.classId };
  let plan: LevelUpPlan;
  let info: ClassInfo | null;
  const before: PlanClass[] = sheet.map((sheetClass) => {
    const classInfo = infoOf(sheetClass);
    return { classId: sheetClass.classId, level: sheetClass.level, info: classInfo, subclass: classInfo ? knownSubclass(data, classInfo, sheetClass.subclass) : null };
  });
  const after = before.map((entry) => ({ ...entry }));
  if (target.kind === "add") {
    info = target.classInfo;
    const added = info;
    if (sheet.some((sheetClass) => sheetClass.classId === added.id)) throw new RangeError(`${added.id} is already a class on the sheet`);
    plan = classOffer(data, info, 0, 1, info.hitDie, "", input.asiFeatName, info.id);
    plan.target = { kind: "add", classId: info.id };
    after.push({ classId: info.id, level: 1, info, subclass: null });
    const rules = [...before.map((entry) => entry.info?.multiclass ?? multiclassRulesOf(entry.classId, undefined)), info.multiclass];
    const scores = Object.fromEntries(ABILITIES.map((ability) => [ability, num(data[ability], 10)])) as Record<Ability, number>;
    plan.prerequisites = prerequisites(scores, rules);
    plan.gains = gainsOffer(data, info.multiclass, { nameOf: input.nameOf, martialWeaponsLabel: input.martialWeaponsLabel, martialWeaponsLabels: input.martialWeaponsLabels });
    plan.unarmoredDefense = unarmoredOffer(data, info.unarmoredDefense);
    plan.newClass = { classId: info.id, ref: `class:${info.id}`, name: info.name, origin: info.origin, hitDie: info.hitDie, spellAbility: info.spellAbility };
  } else {
    const index = sheet.findIndex((sheetClass) => sheetClass.classId === target.classId);
    if (index < 0) throw new RangeError(`No class ${target.classId} on the sheet`);
    const sheetClass = sheet[index];
    info = infoOf(sheetClass);
    plan = classOffer(data, info, sheetClass.level, sheetClass.level + 1, sheetClass.hitDie, sheetClass.subclass, input.asiFeatName, sheetClass.start ? "" : sheetClass.classId);
    plan.target = { kind: "advance", classId: sheetClass.classId, ...(sheetClass.rowId !== undefined ? { rowId: sheetClass.rowId } : {}) };
    after[index].level += 1;
    plan.prerequisites = [];
    plan.gains = null;
    plan.unarmoredDefense = null;
  }
  Object.assign(plan, common);
  plan.issues = [];
  plan.slotsUnknown = after.some((entry) => entry.info === null);
  plan.slots = plan.slotsUnknown ? null : combinedSlotsOffer(data, before, after);
  // A picked subclass that casts changes the target's caster kind: the combined slots with it.
  const targetIndex = target.kind === "add" ? after.length - 1 : sheet.findIndex((sheetClass) => sheetClass.classId === target.classId);
  if (plan.slotsBySubclass) {
    plan.slotsBySubclass = Object.fromEntries(
      plan.subclass.options
        .filter((option) => Object.hasOwn(plan.slotsBySubclass ?? {}, option.ref))
        .map((option) => [option.ref, plan.slotsUnknown ? null : combinedSlotsOffer(data, before, after.map((entry, index) => (index === targetIndex ? { ...entry, subclass: option } : entry)))]),
    );
  }
  plan.extraAttackStacks = info ? extraAttackStacks(data, info.id, plan.features) : [];
  return plan;
}

/** The slots offer with `subclassRef` as the picked subclass (a third caster's own), else the plan's. */
export function slotsFor(plan: LevelUpPlan, subclassRef: string | null): SlotsOffer | null {
  return subclassRef && plan.slotsBySubclass && Object.hasOwn(plan.slotsBySubclass, subclassRef) ? plan.slotsBySubclass[subclassRef] : plan.slots;
}

/**
 * The features a run adds with `subclassRef` as the subclass (the known one, a picked one, or null
 * for 「稍後再選」), before the player unchecks any: class features (placeholders hidden when the
 * subclass's own features are offered) then the subclass's.
 */
export function offeredFeatures(plan: LevelUpPlan, subclassRef: string | null = plan.subclass.known?.ref ?? null): LevelUpFeature[] {
  const own = subclassRef ? plan.subclass.offers[subclassRef] ?? [] : [];
  const atLevel = own.some((feature) => feature.level === plan.toLevel);
  const classFeatures = plan.features.filter((feature) => !(feature.placeholder && atLevel));
  return [...classFeatures.map(({ placeholder: _, ...feature }) => feature), ...own];
}
