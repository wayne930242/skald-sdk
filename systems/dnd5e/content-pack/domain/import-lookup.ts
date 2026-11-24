/**
 * The legacy sheet import's view of a loaded pack (design §5b): spell,
 * species and background names in English or zh-TW, matched like the
 * built-in names (NFKC, case and spacing folded).
 */
import { foldName as fold } from "./identity";
import { PackTextIndex } from "./overlay";
import type { PackContent } from "./types";

/** The locales a legacy sheet is read in. */
export type ImportPackLocale = "en" | "zh-TW";

/** A content pack entry the import matched by name (design §5b), with its text to copy into the row. */
export interface ImportPackMatch {
  ref: string;
  /** Name in the import locale. */
  name: string;
  /** Snapshot text in the import locale. */
  text: string;
  spell?: { level: number; castingTime: string; range: string; concentration: boolean; ritual: boolean; material: boolean };
  darkvision?: number;
}

/**
 * The loaded content pack, consulted after the built-in data finds no match
 * for a spell, species or background name. Absent when no pack is loaded.
 */
export interface ImportPackLookup {
  find(kind: "spell" | "species" | "background", sheetText: string, locale: ImportPackLocale): ImportPackMatch | null;
}

export function createImportPackLookup(pack: PackContent): ImportPackLookup {
  const byName = new Map<string, string>();
  for (const entry of pack.entries) {
    if (entry.kind !== "spell" && entry.kind !== "species" && entry.kind !== "background") continue;
    for (const name of [entry.name, pack.zhTW[entry.ref]?.name]) {
      if (!name) continue;
      const key = `${entry.kind}|${fold(name)}`;
      if (!byName.has(key)) byName.set(key, entry.ref);
    }
  }
  const items = new Map<string, Record<string, unknown>>();
  for (const key of ["spells", "species", "backgrounds"]) {
    for (const item of pack.wizard[key] ?? []) if (typeof item.ref === "string") items.set(item.ref, item);
  }
  const indexes = { en: new PackTextIndex(pack, "en"), "zh-TW": new PackTextIndex(pack, "zh-TW") };

  return {
    find(kind, sheetText, locale) {
      const ref = byName.get(`${kind}|${fold(sheetText)}`);
      if (!ref) return null;
      const index = indexes[locale];
      const item = items.get(ref);
      const w = (item?.w ?? {}) as Record<string, unknown>;
      const match: ImportPackMatch = { ref, name: index.name(ref), text: index.text(ref) };
      if (kind === "spell" && item && typeof item.level === "number") {
        match.spell = {
          level: item.level,
          castingTime: typeof w.castingTime === "string" ? w.castingTime : "",
          range: typeof w.range === "string" ? w.range : "",
          concentration: item.concentration === true,
          ritual: item.ritual === true,
          material: item.material === true,
        };
      }
      if (kind === "species" && typeof item?.darkvision === "number") match.darkvision = item.darkvision;
      return match;
    },
  };
}
