/**
 * When two entries are the same thing (B-025): the same ref (`kind:id`), or, for a kind whose name
 * is its identity, the same name key `kind|parent(id)|fold(English name)`. Chapters, tables,
 * rules and class or subclass features repeat names on purpose (an SRD chapter and a pack
 * chapter share a title; a class has several "Ability Score Improvement" features), so they
 * compare by ref only.
 */
import type { DndKind } from "../../reference/tags";

/** NFKC, lowercase, curly quotes and backticks as `'`, single spaces: how names are matched. */
export function foldName(text: string): string {
  return text.normalize("NFKC").toLowerCase().replace(/[’‘`]/g, "'").replace(/\s+/g, " ").trim();
}

export const NAME_KEY_KINDS: ReadonlySet<DndKind> = new Set<DndKind>([
  "spell", "feat", "background", "species", "lineage", "class", "subclass", "optionalFeature", "item",
  "baseItem", "creature", "condition", "language", "skill", "action", "itemMastery", "itemProperty",
  "itemGroup", "status",
]);

/** The name key of an entry, or null for a kind compared by ref only or an empty name. */
export function nameKey(kind: string, id: string, englishName: string): string | null {
  if (!NAME_KEY_KINDS.has(kind as DndKind)) return null;
  const name = foldName(englishName);
  if (!name) return null;
  const slash = id.lastIndexOf("/");
  return `${kind}|${slash >= 0 ? id.slice(0, slash) : ""}|${name}`;
}
