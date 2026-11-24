import type { NamesCatalog } from "./sources";
import { DND_KINDS, splitRef, type DndKind } from "./tags";

export const SEARCH_FILTERS = ["all", "rules", "spells", "items", "creatures", "options"] as const;
type FilterGroup = (typeof SEARCH_FILTERS)[number];
export type ReferenceFilter = FilterGroup | DndKind;

const GROUP_BY_KIND: Record<DndKind, Exclude<FilterGroup, "all">> = {
  spell: "spells",
  baseItem: "items", item: "items", itemGroup: "items", itemProperty: "items", itemMastery: "items",
  creature: "creatures",
  rule: "rules", action: "rules", condition: "rules", status: "rules", skill: "rules", table: "rules", chapter: "rules",
  class: "options", classFeature: "options", subclass: "options", subclassFeature: "options", species: "options",
  lineage: "options", background: "options", feat: "options", optionalFeature: "options", language: "options",
};

export interface ReferenceSearchSource {
  names: NamesCatalog;
  englishNames: NamesCatalog;
  overlayNames: readonly { ref: string; name: string }[];
}

export interface ReferenceHit { ref: string; name: string; matchedName?: string }
export interface ReferenceResultGroup { kind: DndKind; hits: ReferenceHit[] }
interface RankedHit extends ReferenceHit { rank: number; kind: DndKind }

function normalize(name: string): string {
  return name.normalize("NFKC").trim().toLowerCase();
}

function rankName(name: string, needle: string): number {
  const haystack = normalize(name);
  if (!needle || haystack === needle) return 0;
  if (haystack.startsWith(needle)) return 1;
  for (let at = haystack.indexOf(needle); at !== -1; at = haystack.indexOf(needle, at + 1)) {
    if (!/[\p{L}\p{N}\p{M}]$/u.test(haystack.slice(0, at))) return 2;
  }
  return haystack.includes(needle) ? 3 : Infinity;
}

/** Rank by the best alias for each ref. Group order follows each group's strongest hit. */
export function groupedReferenceSearch(
  source: ReferenceSearchSource, query: string, filter: ReferenceFilter, locale: string,
): ReferenceResultGroup[] {
  const needle = normalize(query);
  if (!needle && filter === "all") return [];

  const overlays = new Map<DndKind, Map<string, string[]>>();
  for (const { ref, name } of source.overlayNames) {
    const parsed = splitRef(ref);
    if (!parsed || !name) continue;
    const byId = overlays.get(parsed.kind) ?? new Map<string, string[]>();
    const aliases = byId.get(parsed.id) ?? [];
    aliases.push(name);
    byId.set(parsed.id, aliases);
    overlays.set(parsed.kind, byId);
  }

  const ranked: RankedHit[] = [];
  for (const kind of DND_KINDS) {
    if (filter !== "all" && filter !== kind && filter !== GROUP_BY_KIND[kind]) continue;
    const local = source.names[kind] ?? {};
    const english = source.englishNames[kind] ?? {};
    const byId = overlays.get(kind);
    const ids = new Set([...Object.keys(local), ...Object.keys(english), ...byId?.keys() ?? []]);
    for (const id of ids) {
      const overlay = byId?.get(id) ?? [];
      const names = [...new Set([...overlay, local[id], english[id]].filter(Boolean))];
      const [name] = names;
      let rank = Infinity;
      let bestName = name;
      for (const alias of names) {
        const score = rankName(alias, needle);
        if (score < rank) {
          rank = score;
          bestName = alias;
        }
        if (rank === 0) break;
      }
      if (rank === Infinity) continue;
      ranked.push({ kind, rank, ref: `${kind}:${id}`, name, ...(bestName !== name ? { matchedName: bestName } : {}) });
    }
  }

  const compare = new Intl.Collator(locale).compare;
  ranked.sort((a, b) => a.rank - b.rank || compare(a.matchedName ?? a.name, b.matchedName ?? b.name) || compare(a.ref, b.ref));
  const groups = new Map<DndKind, ReferenceResultGroup>();
  for (const { kind, ref, name, matchedName } of ranked) {
    const group = groups.get(kind) ?? { kind, hits: [] };
    group.hits.push({ ref, name, matchedName });
    groups.set(kind, group);
  }
  return [...groups.values()];
}
