/**
 * Display names of a sheet's built-in choices in the viewer's locale (UAT M10). The sheet stores
 * the class, subclass, species and background as the text written when they were picked, in the
 * locale of that moment; it also keeps their ids (`classId`, a `multiclass` row's `classId`,
 * `speciesId`, `backgroundId`) and, for a subclass, the refs of the features it gave. Names
 * resolve from those at render time; the stored text is only the fallback for custom or free text,
 * and nothing is rewritten. Pure.
 */
import { rows, text, type CharacterValues } from "./values";

export type NamedKind = "class" | "subclass" | "species" | "background";

/** A name the catalog knows in the viewer's locale, or undefined (the caller keeps its stored text). */
export type SheetNames = (kind: NamedKind, id: string) => string | undefined;

/** A `NamesCatalog` (kind → id → name) as `SheetNames`. */
export function sheetNamesFrom(catalog: Partial<Record<string, Record<string, string> | undefined>> | null | undefined): SheetNames {
  return (kind, id) => {
    const name = id ? catalog?.[kind]?.[id] : undefined;
    return typeof name === "string" && name.trim() ? name : undefined;
  };
}

const SUBCLASS_REF = /^(?:subclassFeature|subclass):([^/]+)\/([^/#]+)/;

/**
 * The `<class>/<subclass>` id of the subclass a sheet class took, or null. The level-up and the
 * wizard store the subclass as text only, so its id comes from the features it gave (their refs
 * name it). Several subclasses' features under one class (a swapped subclass) resolve by the
 * stored name; when none matches, or the player removed every subclass feature, null (the stored
 * text shows, and a subclass-granted casting is not counted).
 */
export function subclassIdOf(values: CharacterValues, classId: string, stored: string, names?: SheetNames): string | null {
  const saved = stored.trim();
  if (!classId || !saved) return null;
  const ids = new Set<string>();
  for (const row of rows(values.features)) {
    const match = SUBCLASS_REF.exec(text(row.ref));
    if (match && match[1] === classId) ids.add(`${match[1]}/${match[2]}`);
  }
  if (ids.size === 1) return [...ids][0];
  const named = [...ids].find((id) => names?.("subclass", id) === saved);
  return named ?? null;
}

/** A class's name: the catalog's for its id, else the stored text. */
export function className(classId: string, stored: string, names?: SheetNames): string {
  return names?.("class", classId) ?? stored;
}

/** A subclass's name: the catalog's for the id its features give, else the stored text. */
export function subclassName(values: CharacterValues, classId: string, stored: string, names?: SheetNames): string {
  const id = subclassIdOf(values, classId, stored, names);
  return (id ? names?.("subclass", id) : undefined) ?? stored;
}

/** Species and background: the catalog's name for the stored id, else the stored text. */
export function originName(values: CharacterValues, kind: "species" | "background", names?: SheetNames): string {
  const stored = text(values[kind]).trim();
  const id = text(values[`${kind}Id`]).trim();
  return (id ? names?.(kind, id) : undefined) ?? stored;
}
