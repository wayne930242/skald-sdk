import { PACK_LIMITS } from "../../content-pack/domain/limits";
import { canonicalJson } from "../../content-pack/domain/canonical-json";
import { packSnapshotBytes } from "../../content-pack/domain/overlay";
import { stampOf } from "../../homebrew/domain/rows";
import { PACK_ORIGIN } from "@skald/sheet-sdk/modules/character/pack-text";
import { classDerivedPatch } from "../play/class-model";
import { ABILITIES, featSheetPatch, type Ability } from "../play/play-model";
import { newEntryId } from "../compendium-rows";
import { optionFields } from "./option-row";
import { LEVEL_UP_RULES, offeredFeatures, sheetRefs, slotsDefaultOn, slotsFor, type LevelUpPlan } from "./plan";

/**
 * Applying a level-up offer (phase 2b §4.3): one new data object, and a targeted undo of exactly
 * what it wrote. Pure; the dialog runs it inside one `PlayContext.update(updater)` call.
 */

export type HpChoice = { mode: "average" } | { mode: "roll"; result: number };

export type AsiChoice =
  /** +2 to one ability or +1 to two (`LEVEL_UP_RULES.asiPoints`), each capped at `abilityCap`. */
  | { kind: "abilities"; increases: Partial<Record<Ability, number>> }
  /** Another feat: nothing written, the compendium's feats tab opens after apply. */
  | { kind: "feat" };

export interface LevelUpChoices {
  hp: HpChoice;
  /** Feature refs the player unchecked (every offered feature starts checked). */
  unchecked?: readonly string[];
  /** The picked subclass ref while the plan offers the picker; null or absent = 「稍後再選」. */
  subclass?: string | null;
  /** Required when the plan has an ASI; absent = decide later (nothing written). */
  asi?: AsiChoice | null;
  /** Write the new slot totals; default: `slotsDefaultOn` of the offer (`slotsFor` the picked subclass). */
  slots?: boolean;
  /** Features that start unchecked (`plan.extraAttackStacks`) the player checked anyway. */
  checked?: readonly string[];
  /** Add: the gains to write (every offered gain starts on). */
  gains?: {
    /** Gains switched off: an armor field, `"weapons"`, a granted tool ref. */
    off?: readonly string[];
    /** Picked skill ids (`plan.gains.skills.from`, at most `count`). */
    skills?: readonly string[];
    /** Names typed for the tool choice (at most its `count`). */
    tools?: readonly string[];
  };
  /** Add: set the new class's Unarmored Defense when settable; default true. */
  unarmoredDefense?: boolean;
  /**
   * The picked option of each offered feature that is a choice (`LevelUpFeature.choice`), by the
   * feature's ref; absent = 稍後再選. A `feature` option by its ref, a `feat` by its ref and name, a
   * `named` option (or a feat choice's alternative) by its name.
   */
  options?: Readonly<Record<string, { ref?: string; name: string }>>;
  /** The row name of a feature with a named option picked; default "Feature: Option". */
  optionRowName?: (feature: string, option: string) => string;
}

/**
 * Row ids for one apply run: the n-th id of a prefix is the same on every call, so a run applied
 * again on newer data (inside the updater) writes the same rows its undo names.
 */
export type RunIds = (prefix: "class" | "tool", n: number) => string;

/** A `RunIds` that makes each id once, with `newEntryId`, and returns it again after. */
export function runIds(): RunIds {
  const made = new Map<string, string>();
  return (prefix, n) => {
    const key = `${prefix}#${n}`;
    let id = made.get(key);
    if (id === undefined) made.set(key, (id = newEntryId(prefix)));
    return id;
  };
}

/** The row of a picked entry, as the compendium builds it (`buildCompendiumRow(tab, ref, name, …, !inTable)`). */
export type LevelUpRowBuilder = (tab: "features" | "feats", ref: string, name: string) => { list: string; row: Record<string, unknown> } | null;

/**
 * A row the run touched: added (`{ list, id }`; with `row` = removed only while it still equals it),
 * or one field of an existing row edited (`field`, `before`, `written`).
 */
export type LevelUpRowUndo =
  | { list: string; id: string; row?: Record<string, unknown>; field?: undefined }
  | { list: string; id: string; field: string; before: unknown; written: unknown };

export interface LevelUpUndo {
  /** Every scalar written: the value before and the value written. */
  fields: Array<{ field: string; before: unknown; written: unknown }>;
  /** Every row added or row field edited, by list and row id. */
  rows: LevelUpRowUndo[];
}

/** What to open after apply: the feats tab (another feat, an epic boon), the spells tab (new counts). */
export interface LevelUpFollowUp {
  feats?: "general" | "epicBoon" | "fightingStyle";
  /** `castingClass` on a multiclass run: rows added from the spells tab get it (`""` = the starting class). */
  spells?: { list: string; castingClass?: string };
}

export type LevelUpResult =
  | { ok: true; after: Record<string, unknown>; undo: LevelUpUndo; followUp: LevelUpFollowUp }
  /** `stale`: the sheet's level moved since the plan; `issues`: the plan found broken class invariants; `snapshot`: the 200 KB copied text cap. */
  | { ok: false; reason: "stale" }
  | { ok: false; reason: "issues" }
  | { ok: false; reason: "snapshot"; bytes: number };

const num = (value: unknown, fallback = 0) => (typeof value === "number" && Number.isFinite(value) ? value : fallback);

/** The written ability scores of an ASI choice; throws on a choice the rules do not allow. */
export function asiScores(current: Readonly<Record<Ability, number>>, increases: Partial<Record<Ability, number>>): Partial<Record<Ability, number>> {
  const picked = Object.entries(increases).filter(([, value]) => value !== undefined && value !== 0) as Array<[Ability, number]>;
  const total = picked.reduce((sum, [, value]) => sum + value, 0);
  const valid =
    total === LEVEL_UP_RULES.asiPoints &&
    picked.length <= LEVEL_UP_RULES.asiPoints &&
    picked.every(([ability, value]) => ABILITIES.includes(ability) && Number.isInteger(value) && value >= 1);
  if (!valid) throw new RangeError("An ability score improvement is +2 to one ability or +1 to two");
  return Object.fromEntries(
    picked.map(([ability, value]) => [ability, Math.max(current[ability], Math.min(LEVEL_UP_RULES.abilityCap, current[ability] + value))]),
  );
}

/** Whether a row carries copied text the snapshot cap counts (a pack row with text, a homebrew row). */
function copiesText(row: Record<string, unknown>): boolean {
  return (row.origin === PACK_ORIGIN && typeof row.text === "string" && row.text !== "") || stampOf(row) !== null;
}

const listRows = (value: unknown): Array<Record<string, unknown>> =>
  Array.isArray(value) ? value.filter((row): row is Record<string, unknown> => typeof row === "object" && row !== null) : [];

/** Whether the sheet still is where the plan started: total level, the target class's level, no added class twice. */
function fresh(data: Record<string, unknown>, plan: LevelUpPlan): boolean {
  if (num(data.level, 1) !== (plan.character?.from ?? plan.fromLevel)) return false;
  const target = plan.target;
  if (!target) return true;
  const rows = listRows(data.multiclass);
  if (target.kind === "add") return !rows.some((row) => row.classId === target.classId) && data.classId !== target.classId;
  if (target.rowId === undefined) return true;
  const row = rows.find((candidate) => candidate.id === target.rowId);
  return row !== undefined && num(row.level) === plan.fromLevel;
}

/**
 * The sheet after the level up, or why not. Writes only: `level` (the total), the target row's
 * `level` or the new `multiclass` row, `hpMaxMisc` (a roll), `hpClassAdjust` (`classDerivedPatch`),
 * the picked subclass, ability scores and the ASI feat row, the new slot totals (Used untouched),
 * the checked feature rows not already on the sheet, and an added class's gains.
 */
export function applyLevelUp(
  data: Record<string, unknown>,
  plan: LevelUpPlan,
  choices: LevelUpChoices,
  buildRow: LevelUpRowBuilder,
  ids: RunIds = runIds(),
): LevelUpResult {
  const counts = { class: 0, tool: 0 };
  const nextId = (prefix: "class" | "tool") => ids(prefix, ++counts[prefix]);
  if (plan.issues && plan.issues.length > 0) return { ok: false, reason: "issues" };
  if (!fresh(data, plan)) return { ok: false, reason: "stale" };
  const after: Record<string, unknown> = { ...data };
  const undo: LevelUpUndo = { fields: [], rows: [] };
  const followUp: LevelUpFollowUp = {};
  const write = (field: string, value: unknown) => {
    const existing = undo.fields.find((entry) => entry.field === field);
    if (existing) existing.written = value;
    else undo.fields.push({ field, before: data[field], written: value });
    after[field] = value;
  };
  const addRow = (list: string, row: Record<string, unknown>, keepIfEdited = false) => {
    after[list] = [...listRows(after[list]), row];
    if (typeof row.id === "string") undo.rows.push(keepIfEdited ? { list, id: row.id, row } : { list, id: row.id });
  };
  const editRow = (list: string, id: string, field: string, value: unknown) => {
    const rows = listRows(after[list]);
    const current = rows.find((row) => row.id === id);
    if (!current) return;
    after[list] = rows.map((row) => (row === current ? { ...row, [field]: value } : row));
    const existing = undo.rows.find((entry) => entry.list === list && entry.id === id && entry.field === field);
    if (existing && existing.field !== undefined) existing.written = value;
    else undo.rows.push({ list, id, field, before: current[field], written: value });
  };
  let copied = false;
  const append = (tab: "features" | "feats", ref: string, name: string, extra?: Record<string, unknown>) => {
    const built = buildRow(tab, ref, name);
    if (!built) return;
    addRow(built.list, extra ? { ...built.row, ...extra } : built.row);
    copied ||= copiesText(built.row);
  };

  const target = plan.target;
  const rowId = target?.kind === "advance" ? target.rowId : undefined;
  write("level", plan.character?.to ?? plan.toLevel);
  if (rowId !== undefined) editRow("multiclass", rowId, "level", plan.toLevel);

  if (choices.hp.mode === "roll") {
    const { result } = choices.hp;
    if (!Number.isInteger(result) || result < 1 || result > plan.hp.faces) throw new RangeError(`A hit die roll is 1–${plan.hp.faces}`);
    write(LEVEL_UP_RULES.hpRollField, num(data[LEVEL_UP_RULES.hpRollField]) + result - plan.hp.average);
  }

  const picked = plan.subclass.choose ? choices.subclass ?? null : null;
  const pickedSubclass = picked ? plan.subclass.options.find((option) => option.ref === picked) : undefined;
  if (picked && !pickedSubclass) throw new RangeError(`Not a subclass this level offers: ${picked}`);

  if (plan.newClass) {
    const { classId, ref, name, origin, hitDie, spellAbility } = plan.newClass;
    const row = { id: nextId("class"), classId, ref, origin, name, subclass: pickedSubclass?.name ?? "", level: 1, hitDie, hitDiceSpent: 0, spellAbility };
    addRow("multiclass", row, true);
  } else if (pickedSubclass) {
    if (rowId !== undefined) editRow("multiclass", rowId, "subclass", pickedSubclass.name);
    else write("subclass", pickedSubclass.name);
  }

  const unchecked = new Set(choices.unchecked ?? []);
  const checked = new Set(choices.checked ?? []);
  for (const ref of plan.extraAttackStacks ?? []) if (!checked.has(ref)) unchecked.add(ref);
  const onSheet = sheetRefs(data);
  const rowName = choices.optionRowName ?? ((feature: string, option: string) => `${feature}: ${option}`);
  for (const feature of offeredFeatures(plan, pickedSubclass?.ref ?? plan.subclass.known?.ref ?? null)) {
    if (unchecked.has(feature.ref) || onSheet.has(feature.ref)) continue;
    onSheet.add(feature.ref);
    const choice = feature.choice;
    const option = choice ? choices.options?.[feature.ref] : undefined;
    // A named option: of a `named` choice, or one a Fighting Style names instead of a feat (UAT F006).
    const named = choice?.kind === "named" ? choice : choice?.kind === "feat" && !option?.ref ? choice.alternatives : undefined;
    if (named && option) {
      const index = named.options.indexOf(option.name);
      if (index < 0) throw new RangeError(`Not an option of ${feature.ref}: ${option.name}`);
      // The pick also as row fields: a built-in row shows its catalog name, which would hide it in the name.
      append("features", feature.ref, rowName(feature.name, option.name), optionFields(named.ids[index] ?? option.name, option.name));
      continue;
    }
    append("features", feature.ref, feature.name);
    if (choice?.kind === "feature" && option) {
      const picked = choice.options.find((candidate) => candidate.ref === option.ref);
      if (!picked) throw new RangeError(`Not an option of ${feature.ref}: ${option.ref}`);
      if (!onSheet.has(picked.ref)) append("features", picked.ref, picked.name);
      onSheet.add(picked.ref);
    } else if (choice?.kind === "feat") {
      if (option?.ref?.startsWith("feat:")) {
        if (!onSheet.has(option.ref)) append("feats", option.ref, option.name);
        onSheet.add(option.ref);
        for (const [field, value] of Object.entries(featSheetPatch(option.ref) ?? {})) write(field, value);
      } else {
        followUp.feats ??= choice.category;
      }
    }
  }

  if (plan.asi && choices.asi?.kind === "abilities") {
    for (const [ability, score] of Object.entries(asiScores(plan.asi.abilities, choices.asi.increases))) write(ability, score);
    append("feats", plan.asi.featRef, plan.asi.featName);
    for (const [field, value] of Object.entries(featSheetPatch(plan.asi.featRef) ?? {})) write(field, value);
  } else if (plan.asi && choices.asi?.kind === "feat") {
    followUp.feats = "general";
  }
  if (plan.epicBoon) followUp.feats = "epicBoon";

  if (plan.gains) {
    const gains = plan.gains;
    const off = new Set(choices.gains?.off ?? []);
    for (const field of gains.armor) if (!off.has(field)) write(field, true);
    if (gains.weapons.length > 0 && !off.has("weapons")) {
      const current = typeof data.weaponProficiencies === "string" ? data.weaponProficiencies.trim() : "";
      write("weaponProficiencies", [current, ...gains.weapons].filter(Boolean).join(", "));
    }
    const skills = choices.gains?.skills ?? [];
    if (skills.length > 0) {
      const valid = gains.skills !== null && skills.length <= gains.skills.count && new Set(skills).size === skills.length && skills.every((id) => gains.skills!.from.includes(id));
      if (!valid) throw new RangeError(`Not a skill pick this class offers: ${skills.join(", ")}`);
      for (const id of skills) write(`${id}Prof`, "proficient");
    }
    for (const tool of gains.tools.grant) {
      if (!off.has(tool.ref)) addRow("toolProficiencies", { id: nextId("tool"), name: tool.name, ref: tool.ref, origin: "srd" });
    }
    const names = (choices.gains?.tools ?? []).map((name) => name.trim()).filter(Boolean);
    if (names.length > (gains.tools.choice?.count ?? 0)) throw new RangeError("More tools than the class's choice gives");
    for (const name of names) addRow("toolProficiencies", { id: nextId("tool"), name, ref: "", origin: "custom" });
  }
  if (plan.unarmoredDefense?.settable && choices.unarmoredDefense !== false) write("unarmoredDefense", plan.unarmoredDefense.value);

  const slots = slotsFor(plan, pickedSubclass?.ref ?? null);
  if (slots && slots.changed && (choices.slots ?? slotsDefaultOn(slots))) {
    slots.after.forEach((total, index) => {
      if (num(data[`slot${index + 1}Total`]) !== total) write(`slot${index + 1}Total`, total);
    });
    if (slots.pact) {
      if (num(data.pactSlots) !== slots.pact.after.slots) write("pactSlots", slots.pact.after.slots);
      if (num(data.pactSlotLevel) !== slots.pact.after.level) write("pactSlotLevel", slots.pact.after.level);
    }
  }

  if (target) for (const [field, value] of Object.entries(classDerivedPatch(after))) write(field, value);

  const spells = plan.spells;
  if (spells && (spells.cantrips?.after !== spells.cantrips?.before || spells.prepared?.after !== spells.prepared?.before)) {
    followUp.spells = { list: spells.list, ...(spells.castingClass !== undefined ? { castingClass: spells.castingClass } : {}) };
  }

  if (copied) {
    const bytes = packSnapshotBytes(after);
    if (bytes > PACK_LIMITS.snapshotBytes) return { ok: false, reason: "snapshot", bytes };
  }
  return { ok: true, after, undo, followUp };
}

export interface UndoResult {
  data: Record<string, unknown>;
  /**
   * What was left alone because it changed since the level up: a field edited (a row field as
   * `<list>.<id>.<field>`), a row removed or, for an added class row, edited. A kept class row keeps
   * the total `level` and `hpClassAdjust` too, so the row levels still sum to the total.
   */
  skipped: { fields: string[]; rows: Array<{ list: string; id: string }> };
}

/** Fields that follow the class rows: kept with a kept added class row. */
const CLASS_TOTALS = new Set(["level", "hpClassAdjust"]);

/**
 * Value equality that ignores object key order: a saved sheet comes back with its row keys
 * reordered (jsonb), so an untouched added row must still match the row the level up wrote.
 */
const same = (a: unknown, b: unknown) => Object.is(a, b) || canonicalJson(a) === canonicalJson(b);

/**
 * The targeted inverse of a level up: each written field goes back to its old value only while it
 * still holds the written value; each added row is removed by id while still present (an added
 * class row only while untouched); each edited row field goes back while it holds the written value.
 */
export function undoLevelUp(current: Record<string, unknown>, undo: LevelUpUndo): UndoResult {
  const data: Record<string, unknown> = { ...current };
  const skipped: UndoResult["skipped"] = { fields: [], rows: [] };
  const keptClassRow = undo.rows.some((entry) => {
    if (entry.list !== "multiclass" || entry.field !== undefined || entry.row === undefined) return false;
    const row = listRows(current.multiclass).find((candidate) => candidate.id === entry.id);
    return row !== undefined && !same(row, entry.row);
  });
  for (const { field, before, written } of undo.fields) {
    if (keptClassRow && CLASS_TOTALS.has(field)) continue;
    if (!same(current[field], written)) {
      skipped.fields.push(field);
      continue;
    }
    if (before === undefined) delete data[field];
    else data[field] = before;
  }
  for (const entry of undo.rows) {
    const { list, id } = entry;
    const rows = Array.isArray(data[list]) ? (data[list] as unknown[]) : [];
    const index = rows.findIndex((row) => typeof row === "object" && row !== null && (row as { id?: unknown }).id === id);
    const row = index >= 0 ? (rows[index] as Record<string, unknown>) : undefined;
    if (entry.field !== undefined) {
      if (!row || !same(row[entry.field], entry.written)) {
        skipped.fields.push(`${list}.${id}.${entry.field}`);
        continue;
      }
      data[list] = rows.map((candidate, at) => (at === index ? { ...row, [entry.field]: entry.before } : candidate));
      continue;
    }
    if (!row || (entry.row !== undefined && !same(row, entry.row))) {
      skipped.rows.push({ list, id });
      continue;
    }
    data[list] = rows.filter((_, at) => at !== index);
  }
  return { data, skipped };
}
