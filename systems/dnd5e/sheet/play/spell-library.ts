import type { LoadedSystem } from "@skald/types/system";
import type { CompendiumStart } from "../compendium-rows";
import type { ReferenceContextValue } from "../use-reference-context";
import { grantedCasting, isMulticlass, singleClassGranted, type CastingOptions } from "./casting-classes";
import { sheetClasses } from "./class-model";
import { className } from "./sheet-names";
import { text } from "./values";

/**
 * The spell list the class casts from (phase 2b §3): a class that borrows another's list (`w.spellList`
 * on its wizard item, or `meta.spellcasting.list` on a Drive-pack or homebrew class entry) presets the
 * library to that list, else to its own id.
 */
export function classSpellList(system: LoadedSystem, classId: string, reference?: Pick<ReferenceContextValue, "packSpellListOf">): string {
  const fromPack = reference?.packSpellListOf?.(classId);
  if (fromPack) return fromPack;
  const classes = Array.isArray(system.gameData?.classes) ? (system.gameData.classes as Array<Record<string, unknown>>) : [];
  const borrowed = (classes.find((item) => item.id === classId)?.w as { spellList?: unknown } | undefined)?.spellList;
  return typeof borrowed === "string" && borrowed ? borrowed : classId;
}


/**
 * The 法術 library preset. Single class: that class's list, as before. Multiclass: 「我的職業」, the
 * union of every sheet class's list (borrowed lists respected; a class that casts only through its
 * subclass, the subclass's list). A spell added from it records the class
 * that casts it (`castingClass`, CLASS-IMPL §7.5 M5): the one class whose list holds it, or the class
 * the player picks in the row when several do (`spellClasses`).
 */
export function spellLibrary(
  system: LoadedSystem,
  values: Record<string, unknown>,
  reference?: Pick<ReferenceContextValue, "packSpellListOf">,
  casting: CastingOptions = {},
): CompendiumStart {
  if (!isMulticlass(values)) {
    const classId = text(values.classId);
    // A class that casts only through its subclass (F009) presets the subclass's list.
    const list = singleClassGranted(values, casting)?.list;
    if (list) return { tab: "spells", classId: list };
    return { tab: "spells", ...(classId ? { classId: classSpellList(system, classId, reference) } : {}) };
  }
  const castingClassOf: Record<string, string> = {};
  const spellClasses: NonNullable<CompendiumStart["spellClasses"]> = [];
  const classes = Array.isArray(system.gameData?.classes) ? system.gameData.classes : [];
  for (const sheetClass of sheetClasses(values)) {
    if (!sheetClass.classId) continue;
    const ownAbility = sheetClass.start ? text(values.spellAbility) : sheetClass.spellAbility;
    const granted = CASTING_ABILITIES.has(ownAbility) ? null : grantedCasting(values, sheetClass, casting);
    const builtinAbility = classes.find((entry) => entry.id === sheetClass.classId)?.w?.spellAbility;
    if (!CASTING_ABILITIES.has(ownAbility) && !granted && !CASTING_ABILITIES.has(builtinAbility)) continue;
    const list = granted?.list ?? classSpellList(system, sheetClass.classId, reference);
    const key = sheetClass.start ? "" : sheetClass.classId;
    if (!(list in castingClassOf)) castingClassOf[list] = key;
    spellClasses.push({ castingClass: key, list, name: className(sheetClass.classId, sheetClass.name, casting.names) || sheetClass.classId });
  }
  return { tab: "spells", classIds: Object.keys(castingClassOf), castingClassOf, spellClasses };
}

const CASTING_ABILITIES = new Set(["int", "wis", "cha"]);
