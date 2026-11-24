import {
  corpusPartCandidates,
  loadCorpusParts,
  loadEnglishCorpus,
  loadOverlay,
  type CorpusEntry,
  type CorpusOverlay,
} from "./load-corpus";
import type { PackEntry } from "../content-pack/domain/types";
import { slugId, splitRef, type DndKind } from "./tags";

/**
 * Where reference text comes from: the built-in SRD corpus, then a loaded content pack. Every
 * consumer goes through `ReferenceSources`. A loaded pack may also carry overlays: the original
 * wording of a built-in entry (plan T2b §4), shown over the SRD text with the SRD version kept for
 * a toggle. Nothing here writes to a character; without the pack the SRD text is all there is.
 */

/** One top-level block of an entry in the viewer's locale; `english` when no translation exists. */
export interface LocalizedBlock {
  block: unknown;
  english: boolean;
}

/** The book an overlay's wording comes from. */
export type TextSource = "xphb" | "xmm" | "xdmg";

/** A pack overlay on a built-in ref (pack format v2 `payload.overlays[ref]`). */
export interface ReferenceOverlay {
  source: "XPHB" | "XMM" | "XDMG";
  en: {
    name?: string;
    entries?: unknown[];
    entriesHigherLevel?: unknown[];
    material?: string;
    meta?: Record<string, unknown>;
    lore?: unknown[];
  };
  /** Sparse: a `null` block or `meta` value means the English one. */
  zhTW?: {
    name?: string;
    entries?: Array<unknown | null>;
    entriesHigherLevel?: Array<unknown | null>;
    material?: string;
    meta?: Record<string, unknown>;
    lore?: Array<unknown | null>;
  };
}

export interface ResolvedReference {
  ref: string;
  kind: DndKind;
  id: string;
  origin: "srd" | "pack";
  /** English corpus name; the caller localizes through the names catalog. */
  name: string;
  /** Localized name from the overlay, when the overlay has one. */
  localizedName?: string;
  /** The text shown: the overlay's wording while a pack overlay applies, else the entry's own. */
  blocks: LocalizedBlock[];
  higherLevel: LocalizedBlock[];
  /** Overlay `meta` over the entry's `meta` while an overlay applies (a creature's stat block header). */
  meta: Record<string, unknown>;
  /** Background blocks: pack lore, or a lore overlay on a built-in entry. Empty without. */
  lore: LocalizedBlock[];
  /** Set while a pack overlay applies: the book of the shown wording (badge and source line). */
  textSource?: TextSource;
  /** The overlay's name in the viewer's locale (English when it has no translation), the title while shown. */
  overlayName?: string;
  /**
   * The SRD version for the toggle, set when the overlay replaces anything but lore: the entry's
   * own blocks, higher-level blocks and `meta`, localized like any built-in entry.
   */
  srdBlocks?: LocalizedBlock[];
  srdHigherLevel?: LocalizedBlock[];
  srdMeta?: Record<string, unknown>;
}

export interface ReferenceSource {
  readonly origin: "srd" | "pack";
  resolve(ref: string, locale: string): Promise<ResolvedReference | null>;
}

/** `ref.<kind>.<id>` names (tier A messages plus the lazy names) — what a link can resolve to without loading. */
export type NamesCatalog = Partial<Record<DndKind, Record<string, string>>>;

function isZh(locale: string): boolean {
  return locale.toLowerCase().startsWith("zh");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Overlays the zh-TW layer on the English blocks per T3's contract: `zh?.[i] ?? en[i]`, and a block
 * is English when the overlay has no translation at that index. English viewers see no badge.
 */
export function overlayBlocks(english: unknown[], localized: Array<unknown | null> | undefined, locale: string): LocalizedBlock[] {
  return english.map((block, index) => {
    const translated = localized?.[index];
    if (translated !== undefined && translated !== null) return { block: translated, english: false };
    return { block, english: locale !== "en" };
  });
}

/**
 * `base` with the fields of `layer` over it. Objects merge per key; a `null` or missing value keeps
 * the base one. `sparse` (a zh-TW layer): arrays merge per element, `null` keeping the base
 * element; otherwise (English overlay `meta`) an array replaces the base array.
 */
export function mergeMeta(base: Record<string, unknown>, layer: Record<string, unknown> | undefined, sparse: boolean): Record<string, unknown> {
  if (!layer) return base;
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(layer)) {
    if (value === null || value === undefined) continue;
    const current = base[key];
    if (sparse && isRecord(value) && isRecord(current)) out[key] = mergeMeta(current, value, sparse);
    else if (sparse && Array.isArray(value) && Array.isArray(current)) {
      out[key] = current.map((element, index) => value[index] ?? element).concat(value.slice(current.length).filter((element) => element !== null));
    } else out[key] = value;
  }
  return out;
}

export function localizeEntry(entry: CorpusEntry, overlay: CorpusOverlay | undefined, locale: string, origin: "srd" | "pack"): ResolvedReference {
  const higher = Array.isArray(entry.meta?.entriesHigherLevel) ? (entry.meta.entriesHigherLevel as unknown[]) : [];
  return {
    ref: entry.ref,
    kind: entry.kind,
    id: entry.id,
    origin,
    name: entry.name,
    ...(overlay?.name ? { localizedName: overlay.name } : {}),
    blocks: overlayBlocks(entry.entries ?? [], overlay?.entries, locale),
    higherLevel: overlayBlocks(higher, overlay?.entriesHigherLevel, locale),
    meta: mergeMeta(withLocalMaterial(entry.meta ?? {}, overlay?.material), overlay?.meta, true),
    lore: overlayBlocks(Array.isArray(entry.lore) ? entry.lore : [], overlay?.lore, locale),
  };
}

/** The spell's material component in the viewer's language, when the overlay has it. */
function withLocalMaterial(meta: Record<string, unknown>, material: string | undefined): Record<string, unknown> {
  const components = meta.components;
  if (!material || typeof components !== "object" || components === null || !("mText" in components)) return meta;
  return { ...meta, components: { ...components, mText: material } };
}

/**
 * A built-in entry with a pack overlay applied: the overlay's wording, name and `meta` shown (zh-TW
 * per block and field, English where it has none), the entry's own kept as `srd*` for the toggle,
 * and the overlay's lore. A lore-only overlay adds lore and keeps the SRD text.
 */
export function applyOverlay(resolved: ResolvedReference, overlay: ReferenceOverlay, locale: string): ResolvedReference {
  const en = overlay.en;
  const zh = isZh(locale) ? overlay.zhTW : undefined;
  const out: ResolvedReference = { ...resolved };
  const meta = mergeMeta(resolved.meta, en.meta, false);
  out.meta = withLocalMaterial(mergeMeta(meta, zh?.meta, true), zh?.material ?? en.material);
  if (Array.isArray(en.lore)) out.lore = overlayBlocks(en.lore, zh?.lore, locale);
  const replaces = en.name !== undefined || Array.isArray(en.entries) || Array.isArray(en.entriesHigherLevel)
    || en.material !== undefined || Object.keys(en.meta ?? {}).some((key) =>
      resolved.kind !== "creature" || (key !== "habitat" && key !== "treasure"),
    );
  if (!replaces) return out;
  out.textSource = overlay.source.toLowerCase() as TextSource;
  out.srdBlocks = resolved.blocks;
  out.srdHigherLevel = resolved.higherLevel;
  out.srdMeta = resolved.meta;
  const name = zh?.name ?? en.name;
  if (name) out.overlayName = name;
  if (Array.isArray(en.entries)) out.blocks = overlayBlocks(en.entries, zh?.entries, locale);
  if (Array.isArray(en.entriesHigherLevel)) out.higherLevel = overlayBlocks(en.entriesHigherLevel, zh?.entriesHigherLevel, locale);
  return out;
}

/** Resolves a link candidate against the names catalog; `*` in an id matches one path segment. */
export function createRefResolver(names: NamesCatalog, packEntries: readonly PackEntry[] = []): (candidate: string) => string | null {
  const bookTargets = new Map<string, string>();
  for (const entry of packEntries) {
    if (entry.kind !== "chapter") continue;
    const [book] = entry.id.split("/");
    if (book !== "xphb" && book !== "xdmg") continue;
    const { bookChapter, bookSection } = entry.meta;
    if (typeof bookChapter !== "number" || !Number.isInteger(bookChapter) || bookChapter < 0) continue;
    const key = `book:${book}/${bookChapter}`;
    const section = typeof bookSection === "string" ? slugId(bookSection) : "";
    if (typeof bookSection === "string" && !section) continue;
    const candidate = section ? `${key}/${section}` : key;
    if (!bookTargets.has(candidate)) bookTargets.set(candidate, entry.ref);
  }
  return (candidate) => {
    if (candidate.startsWith("book:")) return bookTargets.get(candidate) ?? null;
    const parsed = splitRef(candidate);
    if (!parsed) return null;
    const ids = names[parsed.kind];
    if (!ids) return null;
    if (!parsed.id.includes("*")) return Object.hasOwn(ids, parsed.id) ? candidate : null;
    const pattern = new RegExp(`^${parsed.id.split("*").map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[^/]+")}$`);
    const match = Object.keys(ids).find((id) => pattern.test(id));
    return match ? `${parsed.kind}:${match}` : null;
  };
}

/** Kinds whose corpus part comes from the part manifest. */
const MANIFEST_KINDS: ReadonlySet<DndKind> = new Set(["creature", "item", "chapter"]);

/**
 * The built-in SRD corpus. `spellLevels` comes from the wizard spell list (tier B) when loaded;
 * `overlays` are the loaded pack's, keyed by built-in ref (none without a pack).
 */
export function createBuiltinSource(
  spellLevels: ReadonlyMap<string, number>,
  overlays: Readonly<Record<string, ReferenceOverlay>> = {},
): ReferenceSource {
  async function findSpellPart(id: string): Promise<string | null> {
    const level = spellLevels.get(id);
    if (level !== undefined) return `spell-${level}`;
    for (let candidate = 0; candidate <= 9; candidate += 1) {
      const part = await loadEnglishCorpus(`spell-${candidate}`);
      if (part && Object.hasOwn(part, `spell:${id}`)) return `spell-${candidate}`;
    }
    return null;
  }

  async function partsOf(kind: DndKind, id: string): Promise<string[]> {
    if (kind === "spell") {
      const part = await findSpellPart(id);
      return part ? [part] : [];
    }
    const parts = MANIFEST_KINDS.has(kind) ? await loadCorpusParts() : { creature: {}, itemMagic: {}, chapter: {} };
    return corpusPartCandidates(kind, id, parts);
  }

  return {
    origin: "srd",
    async resolve(ref, locale) {
      const parsed = splitRef(ref);
      if (!parsed) return null;
      for (const part of await partsOf(parsed.kind, parsed.id)) {
        const [english, layer] = await Promise.all([
          loadEnglishCorpus(part),
          locale === "en" ? Promise.resolve(null) : loadOverlay(locale, part),
        ]);
        const entry = english && Object.hasOwn(english, ref) ? english[ref] : undefined;
        if (!entry) continue;
        const resolved = localizeEntry(entry, layer?.[ref], locale, "srd");
        return Object.hasOwn(overlays, ref) ? applyOverlay(resolved, overlays[ref], locale) : resolved;
      }
      return null;
    },
  };
}

/** A loaded content pack (§5b); listed after the built-in source, so a built-in ref always wins. */
export function createPackSource(
  entries: readonly CorpusEntry[],
  zhTW: Readonly<Record<string, CorpusOverlay>>,
  aliases: Readonly<Record<string, string>> = {},
): ReferenceSource {
  const byRef = new Map(entries.map((entry) => [entry.ref, entry]));
  return {
    origin: "pack",
    async resolve(ref, locale) {
      const entry = byRef.get(aliases[ref] ?? ref);
      if (!entry) return null;
      return localizeEntry(entry, isZh(locale) ? zhTW[entry.ref] : undefined, locale, "pack");
    },
  };
}

/** A chapter's `{type: "include", ref}` node (plan T2b §2.5). */
export function isIncludeNode(node: unknown): node is { type: "include"; ref: string } {
  return isRecord(node) && node.type === "include" && typeof node.ref === "string";
}

/** Sources in priority order: built-in wins over a pack for the same ref (§1.8). */
export class ReferenceSources {
  constructor(private readonly sources: readonly ReferenceSource[]) {}

  async resolve(ref: string, locale: string): Promise<ResolvedReference | null> {
    for (const source of this.sources) {
      const resolved = await source.resolve(ref, locale);
      if (resolved) return resolved;
    }
    return null;
  }

  /**
   * The entry an `include` node embeds, resolved like any reference: an included built-in entry
   * with a pack overlay shows the overlay, with the toggle data. Null for any other node.
   */
  async resolveInclude(node: unknown, locale: string): Promise<ResolvedReference | null> {
    return isIncludeNode(node) ? this.resolve(node.ref, locale) : null;
  }
}

/** Spell id → level from the wizard spell list (`system.gameData.spells`). */
export function spellLevelsFrom(gameSpells: unknown): Map<string, number> {
  const levels = new Map<string, number>();
  if (!Array.isArray(gameSpells)) return levels;
  for (const item of gameSpells) {
    if (item && typeof item === "object" && typeof item.id === "string" && typeof item.level === "number") {
      levels.set(item.id, item.level);
    }
  }
  return levels;
}
