/**
 * Per-class spellcasting on a multiclass sheet (CLASS-IMPL §7.5 M5). Pure functions over
 * `castingOf` (class-model.ts): each casting class has its own ability, save DC and attack bonus,
 * and a spell row casts with the class in its `castingClass` (`""` = the starting class).
 * A single-class sheet has no `multiclass` row and reads the flat `spell*` fields exactly as before,
 * unless its class casts only through its subclass (F009): then the subclass's ability.
 *
 * A class that casts nothing of its own counts as a casting class when its subclass grants
 * spellcasting (UAT: a built-in subclass with its own Spellcasting feature, a homebrew third
 * caster): the subclass's id comes from its features (`subclassIdOf`), its casting from
 * `subclassCasting` over that Spellcasting feature on the sheet and, through
 * `CastingOptions.subclassMeta`, a pack or homebrew subclass entry's meta.
 *
 * Spells a background or feat gave (`source` `magic-initiate` or `species`) belong to no class: they
 * keep `castingClass` `""` and show their source instead of a class. The sheet does not record the
 * ability their feat chose, so they cast with the starting class's numbers unless the player set
 * their `castingClass` by hand.
 */

import { NOT_A_CLASS } from "../compendium-present";
import { subclassCasting, type SubclassCasting } from "../../reference/multiclass";
import { castingOf, sheetClasses, type SheetClass } from "./class-model";
import { className, subclassIdOf, type SheetNames } from "./sheet-names";
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

export interface CastingOptions {
  /** Names in the viewer's locale (`name` of each casting class). */
  names?: SheetNames;
  /** A pack or homebrew subclass entry's `meta` by `<class>/<subclass>` id, when the view has packs. */
  subclassMeta?: (subclassId: string) => unknown;
}


/** The non-class source of a spell row (`magic-initiate`, `species`), or null when a class casts it. */
export function spellSourceOf(spell: Record<string, unknown>): string | null {
  const source = text(spell.source);
  return NOT_A_CLASS.has(source) && text(spell.castingClass) === "" ? source : null;
}

export function isMulticlass(values: CharacterValues): boolean {
  return rows(values.multiclass).length > 0;
}

/** The spellcasting a sheet class's subclass grants (its ability and list), or null. */
export function grantedCasting(values: CharacterValues, sheetClass: Pick<SheetClass, "classId" | "subclass">, options: CastingOptions = {}): SubclassCasting | null {
  const id = subclassIdOf(values, sheetClass.classId, sheetClass.subclass, options.names);
  if (!id) return null;
  return subclassCasting(id, options.subclassMeta?.(id), rows(values.features).map((row) => text(row.ref)));
}

/** The ability a sheet class's subclass casts with, or null. */
export function grantedAbility(values: CharacterValues, sheetClass: Pick<SheetClass, "classId" | "subclass">, options: CastingOptions = {}): string | null {
  return grantedCasting(values, sheetClass, options)?.ability ?? null;
}

function castingKey(sheetClass: SheetClass): string {
  return sheetClass.start ? "" : sheetClass.classId;
}

const OWN_CASTING = new Set(["int", "wis", "cha"]);

/**
 * A single-class sheet whose class casts nothing but whose subclass grants spellcasting (a third
 * caster, UAT F009): the subclass's casting, else null. A class with its own casting ability, or
 * a multiclass sheet, gives null.
 */
export function singleClassGranted(values: CharacterValues, options: CastingOptions = {}): SubclassCasting | null {
  if (isMulticlass(values) || OWN_CASTING.has(text(values.spellAbility))) return null;
  const start = sheetClasses(values)[0];
  const granted = grantedCasting(values, start, options);
  return granted && OWN_CASTING.has(granted.ability) ? granted : null;
}

/**
 * Every sheet class that casts, starting class first. Empty on a single-class sheet, except a
 * class that casts only through its subclass (F009): that one entry, with the subclass's numbers.
 */
export function castingClasses(values: CharacterValues, options: CastingOptions = {}): CastingClass[] {
  if (!isMulticlass(values)) {
    const granted = singleClassGranted(values, options);
    const casting = granted ? castingOf(values, "", granted.ability) : null;
    if (!casting) return [];
    const start = sheetClasses(values)[0];
    return [{ castingClass: "", classId: start.classId, name: className(start.classId, start.name, options.names), ...casting }];
  }
  return sheetClasses(values).flatMap((sheetClass) => {
    const key = castingKey(sheetClass);
    const casting = castingOf(values, key, grantedAbility(values, sheetClass, options));
    if (!casting) return [];
    return [{ castingClass: key, classId: sheetClass.classId, name: className(sheetClass.classId, sheetClass.name, options.names), ...casting }];
  });
}

/**
 * The casting numbers a spell row rolls with: its `castingClass`'s on a multiclass sheet, else (a
 * single-class sheet, or a class that no longer casts) the sheet's `spellMod` / `spellSaveDc` / `spellAttack`.
 */
export function spellCasting(
  values: CharacterValues,
  spell: Record<string, unknown>,
  options: CastingOptions = {},
): { mod: number; dc: number; attack: number } {
  const fallback = { mod: num(values.spellMod), dc: num(values.spellSaveDc), attack: num(values.spellAttack) };
  if (!isMulticlass(values)) {
    const granted = singleClassGranted(values, options);
    const casting = granted ? castingOf(values, "", granted.ability) : null;
    return casting ? { mod: casting.mod, dc: casting.dc, attack: casting.attack } : fallback;
  }
  const key = text(spell.castingClass);
  const sheetClass = sheetClasses(values).find((candidate) => castingKey(candidate) === key);
  const casting = castingOf(values, key, sheetClass ? grantedAbility(values, sheetClass, options) : null);
  return casting ? { mod: casting.mod, dc: casting.dc, attack: casting.attack } : fallback;
}
