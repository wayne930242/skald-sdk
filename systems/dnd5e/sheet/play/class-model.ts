/**
 * A D&D 2024 character's classes (multiclass data contract, CLASS-IMPL §7.2). Pure functions.
 *
 * Stored shape: the starting class keeps the flat fields (`className`, `classId`, `subclass`,
 * `hitDieFaces`, `hitDiceSpent`, `spellAbility`); every further class is a row of the list
 * `multiclass` (`{ classId, ref, origin, name, subclass, level, hitDie, hitDiceSpent, spellAbility }`,
 * in the order taken; `ref`/`origin` as on every reference row, so 開啟參考 resolves the class).
 * `level` stays the stored total character level, so the starting class's level is derived: `level − Σ multiclass.level`. A sheet without `multiclass` is single-class and reads
 * exactly as before.
 *
 * `hpClassAdjust` (hidden number, added by the `hpMax` formula) holds the HP difference of the
 * other classes' dice, because the formula engine cannot sum a list. Writers keep it current with
 * `classDerivedPatch`; `hpMaxMisc` stays the player's own bonus plus rolled-HP differences.
 *
 * Invariants (reported by `classIssues`, never fixed silently): every row level ≥ 1; Σ row levels
 * ≤ `level − 1`; one row per class id; no row repeats the starting `classId`.
 */

import { hitPoints, num, rows, text, type CharacterPatch, type CharacterValues } from "./values";

export interface SheetClass {
  classId: string;
  ref: string;
  name: string;
  subclass: string;
  level: number;
  hitDie: number;
  hitDiceSpent: number;
  spellAbility: string;
  start: boolean;
  /** The `multiclass` row's id; absent on the starting class. */
  rowId?: string;
}

export type ClassIssue = "overflow" | "duplicate" | "startClass" | "rowLevel";

const SPELL_ABILITIES = new Set(["int", "wis", "cha"]);

function multiclassRows(values: CharacterValues): Record<string, unknown>[] {
  return rows(values.multiclass);
}

function rowLevel(row: Record<string, unknown>): number {
  return Math.trunc(num(row.level, 0));
}

function totalLevel(values: CharacterValues): number {
  return Math.trunc(num(values.level, 1));
}

/** Average Hit Point Die roll as the sheet's formula counts it (FLOOR(d/2)+1). */
function average(faces: number): number {
  return Math.floor(faces / 2) + 1;
}

/** The starting class first, then each `multiclass` row in the order taken. */
export function sheetClasses(values: CharacterValues): SheetClass[] {
  const extra = multiclassRows(values);
  const taken = extra.reduce((sum, row) => sum + Math.max(0, rowLevel(row)), 0);
  const classId = text(values.classId);
  const start: SheetClass = {
    classId,
    ref: classId ? `class:${classId}` : "",
    name: text(values.className),
    subclass: text(values.subclass),
    level: Math.max(1, totalLevel(values) - taken),
    hitDie: num(values.hitDieFaces, 8),
    hitDiceSpent: Math.max(0, num(values.hitDiceSpent)),
    spellAbility: text(values.spellAbility) || "none",
    start: true,
  };
  return [
    start,
    ...extra.map((row): SheetClass => ({
      classId: text(row.classId),
      ref: text(row.ref),
      name: text(row.name),
      subclass: text(row.subclass),
      level: rowLevel(row),
      hitDie: num(row.hitDie, 8),
      hitDiceSpent: Math.max(0, num(row.hitDiceSpent)),
      spellAbility: text(row.spellAbility) || "none",
      start: false,
      ...(typeof row.id === "string" ? { rowId: row.id } : {}),
    })),
  ];
}

export function classIssues(values: CharacterValues): ClassIssue[] {
  const extra = multiclassRows(values);
  const issues: ClassIssue[] = [];
  const sum = extra.reduce((total, row) => total + Math.max(0, rowLevel(row)), 0);
  if (extra.length > 0 && sum > totalLevel(values) - 1) issues.push("overflow");
  const ids = extra.map((row) => text(row.classId)).filter(Boolean);
  if (new Set(ids).size !== ids.length) issues.push("duplicate");
  const startId = text(values.classId);
  if (startId && ids.includes(startId)) issues.push("startClass");
  if (extra.some((row) => rowLevel(row) < 1 || rowLevel(row) !== num(row.level, 0))) issues.push("rowLevel");
  return issues;
}

/** Σ row level × (average of the row's die − average of the starting die). */
export function hpClassAdjust(values: CharacterValues): number {
  const startAverage = average(num(values.hitDieFaces, 8));
  return multiclassRows(values).reduce(
    (sum, row) => sum + Math.max(0, rowLevel(row)) * (average(num(row.hitDie, 8)) - startAverage),
    0,
  );
}

/** `{ hpClassAdjust }` when the stored value differs from the classes, else `{}`. */
export function classDerivedPatch(values: CharacterValues): CharacterPatch {
  const next = hpClassAdjust(values);
  return num(values.hpClassAdjust) === next ? {} : { hpClassAdjust: next };
}

export interface HitDicePool {
  faces: number;
  max: number;
  left: number;
  /** Classes feeding this pool, in sheet order; `rowId` absent = the starting class. */
  sources: Array<{ rowId?: string; max: number; spent: number }>;
}

/**
 * Hit Point Dice grouped by die size, the starting class's die first. One pool exactly as a
 * single-class sheet had when there is no `multiclass` row or `hitDiceMax` is overridden (its
 * value no longer equals `level`, the formula's result).
 */
export function hitDicePools(values: CharacterValues): HitDicePool[] {
  const level = num(values.level, 1);
  const overridden = num(values.hitDiceMax, level) !== level;
  if (multiclassRows(values).length === 0 || overridden) {
    const max = Math.max(0, num(values.hitDiceMax, level));
    const spent = Math.min(max, Math.max(0, num(values.hitDiceSpent)));
    return [{ faces: num(values.hitDieFaces, 8), max, left: max - spent, sources: [{ max, spent }] }];
  }
  const pools: HitDicePool[] = [];
  for (const sheetClass of sheetClasses(values)) {
    const max = Math.max(0, sheetClass.level);
    const spent = Math.min(max, sheetClass.hitDiceSpent);
    let pool = pools.find((candidate) => candidate.faces === sheetClass.hitDie);
    if (!pool) {
      pool = { faces: sheetClass.hitDie, max: 0, left: 0, sources: [] };
      pools.push(pool);
    }
    pool.max += max;
    pool.left += max - spent;
    pool.sources.push({ ...(sheetClass.rowId !== undefined ? { rowId: sheetClass.rowId } : {}), max, spent });
  }
  return pools;
}

/**
 * Spending one die of size `faces`: the starting class's dice first, then the rows in order; the
 * roll heals at least 1 HP. Null when that pool has no die left.
 */
export function spendHitDie(values: CharacterValues, faces: number, rolled: number): CharacterPatch | null {
  const pool = hitDicePools(values).find((candidate) => candidate.faces === faces);
  const source = pool?.sources.find((candidate) => candidate.spent < candidate.max);
  if (!source) return null;
  const hp = hitPoints(values);
  const heal = { hp: { ...(values.hp as object), current: Math.min(hp.max, hp.current + Math.max(1, rolled)) } };
  if (source.rowId === undefined) return { hitDiceSpent: source.spent + 1, ...heal };
  const multiclass = multiclassRows(values).map((row) =>
    row.id === source.rowId ? { ...row, hitDiceSpent: source.spent + 1 } : row,
  );
  return { multiclass, ...heal };
}

/** Long rest: every row's spent dice back (the starting class's `hitDiceSpent` is the caller's). */
export function longRestClassPatch(values: CharacterValues): CharacterPatch {
  const extra = multiclassRows(values);
  if (!extra.some((row) => num(row.hitDiceSpent) !== 0)) return {};
  return { multiclass: extra.map((row) => ({ ...row, hitDiceSpent: 0 })) };
}

/**
 * The identity class line. Single class: "<className> · <subclass>" as before. Several:
 * "Fighter 5 · Champion / Wizard 2" (`labels.level` formats the class level).
 */
export function classLine(values: CharacterValues, labels: { separator: string; level(n: number): string }): string {
  const join = (name: string, subclass: string) =>
    [name, subclass].map((part) => part.trim()).filter(Boolean).join(" · ");
  if (multiclassRows(values).length === 0) return join(text(values.className), text(values.subclass));
  return sheetClasses(values)
    .map((sheetClass) => join(`${sheetClass.name.trim()} ${labels.level(sheetClass.level)}`.trim(), sheetClass.subclass))
    .filter(Boolean)
    .join(labels.separator);
}

/**
 * Spellcasting numbers of one class. `""` = the starting class: the sheet's `spellMod`,
 * `spellSaveDc` and `spellAttack` (overrides kept). A row's `classId`: its own ability, DC
 * 8 + mod + proficiency, attack mod + proficiency. Null when that class casts nothing or no row
 * has that class.
 */
export function castingOf(
  values: CharacterValues,
  castingClass: string,
): { ability: string; mod: number; dc: number; attack: number } | null {
  if (castingClass === "") {
    const ability = text(values.spellAbility);
    if (!SPELL_ABILITIES.has(ability)) return null;
    return { ability, mod: num(values.spellMod), dc: num(values.spellSaveDc), attack: num(values.spellAttack) };
  }
  const row = multiclassRows(values).find((candidate) => text(candidate.classId) === castingClass);
  const ability = text(row?.spellAbility);
  if (!row || !SPELL_ABILITIES.has(ability)) return null;
  const mod = num(values[`${ability}Mod`], Math.floor((num(values[ability], 10) - 10) / 2));
  const prof = num(values.profBonus, 2 + Math.floor((Math.max(1, totalLevel(values)) - 1) / 4));
  return { ability, mod, dc: 8 + mod + prof, attack: mod + prof };
}
