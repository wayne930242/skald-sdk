/**
 * Per-class spellcasting on a multiclass sheet (CLASS-IMPL §7.5 M5). Pure functions over
 * `castingOf` (class-model.ts): each casting class has its own ability, save DC and attack bonus,
 * and a spell row casts with the class in its `castingClass` (`""` = the starting class).
 * A single-class sheet has no `multiclass` row and reads the flat `spell*` fields exactly as before.
 */

import { castingOf, sheetClasses } from "./class-model";
import { num, rows, text, type CharacterValues } from "./values";

export interface CastingClass {
  /** The value a spell row's `castingClass` holds: `""` for the starting class, else the row's `classId`. */
  castingClass: string;
  classId: string;
  name: string;
  ability: string;
  mod: number;
  dc: number;
  attack: number;
}

export function isMulticlass(values: CharacterValues): boolean {
  return rows(values.multiclass).length > 0;
}

/** Every sheet class that casts, starting class first. Empty on a single-class sheet. */
export function castingClasses(values: CharacterValues): CastingClass[] {
  if (!isMulticlass(values)) return [];
  return sheetClasses(values).flatMap((sheetClass) => {
    const key = sheetClass.start ? "" : sheetClass.classId;
    const casting = castingOf(values, key);
    return casting ? [{ castingClass: key, classId: sheetClass.classId, name: sheetClass.name, ...casting }] : [];
  });
}

/**
 * The casting numbers a spell row rolls with: its `castingClass`'s on a multiclass sheet, else (a
 * single-class sheet, or a class that no longer casts) the sheet's `spellMod` / `spellSaveDc` / `spellAttack`.
 */
export function spellCasting(values: CharacterValues, spell: Record<string, unknown>): { mod: number; dc: number; attack: number } {
  const fallback = { mod: num(values.spellMod), dc: num(values.spellSaveDc), attack: num(values.spellAttack) };
  if (!isMulticlass(values)) return fallback;
  const casting = castingOf(values, text(spell.castingClass));
  return casting ? { mod: casting.mod, dc: casting.dc, attack: casting.attack } : fallback;
}

