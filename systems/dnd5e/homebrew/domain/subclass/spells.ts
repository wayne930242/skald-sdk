/**
 * A subclass's always-prepared spells: the class levels that list them, the highest spell level the
 * class can cast at each, and the entries an editor must refuse (a cantrip, or a spell above that
 * level). The read-back of stored rows does not check these, so an old subclass still opens.
 */
import type { SubclassForm } from "./form";
import type { SubclassParent } from "./parents";
import { thirdCasterSlots } from "./slots";

/** What the editor knows of a spell: its level (0 = cantrip) and the class lists naming it. */
export interface SpellInfo {
  level: number;
  classes: readonly string[];
}

export interface SpellProblem {
  /** The class level whose row lists the spell. */
  level: number;
  ref: string;
  reason: "cantrip" | "tooHigh";
  spellLevel: number;
  max: number;
}

/** The class levels a subclass lists spells at (none for a parent that casts no spells). */
export function spellLevels(parent: SubclassParent, form: Pick<SubclassForm, "spellcasting">): number[] {
  if (form.spellcasting) return [3, 7, 13, 19];
  if (parent.caster === "half") return [3, 5, 9, 13, 17];
  return parent.caster === "none" ? [] : [3, 5, 7, 9];
}

/** The highest spell level castable at class `level`: the derived third-caster table for a third caster. */
export function maxSpellLevel(form: Pick<SubclassForm, "spellcasting">, parent: SubclassParent, level: number): number {
  if (form.spellcasting) return thirdCasterSlots(level).filter((n) => n > 0).length;
  if (parent.caster === "half") return Math.min(5, Math.ceil(level / 4));
  return Math.min(parent.caster === "pact" ? 5 : 9, Math.ceil(level / 2));
}

/** The list a subclass's spell suggestions come from: its own casting list, else the parent's. */
export function spellListOf(form: Pick<SubclassForm, "spellcasting">, parent: SubclassParent): string | undefined {
  return form.spellcasting?.list || parent.list;
}

/** Whether spell `info` fits a row at class `level`: a levelled spell no higher than castable there. */
export function spellFits(info: SpellInfo, max: number): boolean {
  return info.level >= 1 && info.level <= max;
}

/** The listed spells an editor refuses; a spell it knows nothing of passes. */
export function spellProblems(
  form: Pick<SubclassForm, "spellcasting" | "spells">,
  parent: SubclassParent,
  info: (ref: string) => SpellInfo | undefined,
): SpellProblem[] {
  return form.spells.flatMap(({ level, refs }) => {
    if (!spellLevels(parent, form).includes(level)) return [];
    const max = maxSpellLevel(form, parent, level);
    return refs.flatMap((ref): SpellProblem[] => {
      const spell = info(ref);
      if (!spell || spellFits(spell, max)) return [];
      return [{ level, ref, reason: spell.level < 1 ? "cantrip" : "tooHigh", spellLevel: spell.level, max }];
    });
  });
}
