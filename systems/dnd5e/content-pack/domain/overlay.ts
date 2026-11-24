/**
 * The wizard overlay (design §5b): pack pick items appended to the built-in
 * game data before the wizard renders, and the snapshot that copies pack text
 * into the character at creation. Built-in ids and refs win; publish
 * validation and dry run never see the overlay; the engine is unchanged.
 */
import { PACK_ORIGIN } from "@skald/sheet-sdk/modules/character/pack-text";
import { entriesToText } from "../../reference/entries-to-text";
import { PACK_LIMITS } from "./limits";
import type { PackContent, PackEntry, PackWizardItem } from "./types";

type Item = Record<string, unknown>;

/** Origin marker of everything copied from a pack. */
export { PACK_ORIGIN };
/** Table copies hold no pack text (D9): the host's rule, shared with the JSON import. */
export { stripPackText } from "@skald/sheet-sdk/modules/character/pack-text";

function isItem(value: unknown): value is Item {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isZh(locale: string): boolean {
  return locale.toLowerCase().startsWith("zh");
}

/** Top-level named sections of an entries tree, e.g. a species' traits, in order. */
function sections(entries: unknown[]): Array<{ name: string; entries: unknown[] }> {
  const out: Array<{ name: string; entries: unknown[] }> = [];
  for (const node of entries) {
    if (isItem(node) && typeof node.name === "string" && Array.isArray(node.entries)) {
      out.push({ name: node.name, entries: node.entries });
    }
  }
  return out;
}

/** A pack creature as the monster browser lists it (plan T2b §5.2). */
interface PackBrowserRow {
  ref: string;
  id: string;
  /** In the index's locale; English where the pack has no translation. */
  name: string;
  englishName: string;
  meta: Record<string, unknown>;
}

/**
 * Names and snapshot text of pack refs in one locale. A row may name a
 * section of its entry (a species trait row names its species and the
 * trait), so text is looked up by `ref` plus English section name first.
 * Chapter entries are left out: no row comes from a chapter, and the reader
 * reads them through the reference sources. Overlay names and pack creatures
 * are listed for search and the monster browser.
 */
export class PackTextIndex {
  private readonly entries = new Map<string, PackEntry>();

  constructor(
    private readonly pack: PackContent,
    readonly locale: string,
  ) {
    for (const entry of pack.entries) if (entry.kind !== "chapter") this.entries.set(entry.ref, entry);
  }

  /** Overlay names in this locale (English where the overlay has no translation), by ref, for name search. */
  overlayNames(): Array<{ ref: string; name: string }> {
    const out: Array<{ ref: string; name: string }> = [];
    for (const [ref, overlay] of Object.entries(this.pack.overlays ?? {})) {
      const name = (isZh(this.locale) ? overlay.zhTW?.name : undefined) ?? overlay.en.name;
      if (name) out.push({ ref, name });
    }
    return out.sort((a, b) => (a.ref < b.ref ? -1 : a.ref > b.ref ? 1 : 0));
  }

  /**
   * The pack's book chapters and sections (the reader's second book, plan T2b §5.5): localized name
   * and the XPHB chapter index; read only when the reader opens.
   */
  chapters(): Array<{ ref: string; id: string; name: string; bookChapter: number }> {
    return this.pack.entries
      .filter((entry) => entry.kind === "chapter")
      .map((entry) => ({
        ref: entry.ref,
        id: entry.id,
        name: (isZh(this.locale) ? this.pack.zhTW[entry.ref]?.name : undefined) ?? entry.name,
        bookChapter: typeof entry.meta?.bookChapter === "number" ? entry.meta.bookChapter : Number.MAX_SAFE_INTEGER,
      }));
  }

  /** The pack's creatures, for the monster browser; read only when it opens. */
  creatures(): PackBrowserRow[] {
    return this.browserRows("creature");
  }

  magicItems(): PackBrowserRow[] {
    return this.browserRows("item").filter((row) => row.meta.magic === true);
  }

  private browserRows(kind: "creature" | "item"): PackBrowserRow[] {
    const out: PackBrowserRow[] = [];
    for (const entry of this.entries.values()) {
      if (entry.kind !== kind) continue;
      out.push({ ref: entry.ref, id: entry.id, name: this.localized(entry.ref).name, englishName: entry.name, meta: entry.meta });
    }
    return out;
  }

  has(ref: unknown): ref is string {
    return typeof ref === "string" && this.entries.has(ref);
  }

  private localized(ref: string): { name: string; entries: unknown[] } {
    const entry = this.entries.get(ref)!;
    const zh = isZh(this.locale) ? this.pack.zhTW[ref] : undefined;
    return zh ? { name: zh.name, entries: zh.entries } : { name: entry.name, entries: entry.entries };
  }

  /** The entry's name in this locale, or the localized name of the section named `englishSection`. */
  name(ref: string, englishSection?: string): string {
    const localized = this.localized(ref);
    if (englishSection === undefined) return localized.name;
    const index = sections(this.entries.get(ref)!.entries).findIndex((section) => section.name === englishSection);
    return (index >= 0 ? sections(localized.entries)[index]?.name : undefined) ?? englishSection;
  }

  /**
   * A pack row's text from this pack: the section its name names (English or localized) when the
   * name is not the entry's own, else the whole entry; "" when the pack lacks the ref. The text a
   * snapshot copies in, and what a viewer shows for a table copy's row that holds none (D9).
   */
  rowText(row: { ref?: unknown; name?: unknown }): string {
    if (!this.has(row.ref)) return "";
    const name = typeof row.name === "string" ? row.name : undefined;
    const section = name !== undefined && name !== this.name(row.ref) ? name : undefined;
    return this.text(row.ref, section);
  }

  /** Plain snapshot text: the section named `section` (English or localized) when found, else the whole entry. */
  text(ref: string, section?: string): string {
    const localized = this.localized(ref);
    if (section !== undefined) {
      const english = sections(this.entries.get(ref)!.entries);
      const local = sections(localized.entries);
      const index = english.findIndex((part) => part.name === section);
      const found = (index >= 0 ? local[index] ?? english[index] : undefined) ?? local.find((part) => part.name === section);
      if (found) return entriesToText(found.entries);
    }
    return entriesToText(localized.entries);
  }
}

function localizeLabel(label: unknown, locale: string): string | undefined {
  if (typeof label === "string") return label;
  if (!isItem(label)) return undefined;
  const pick = isZh(locale) ? (label["zh-TW"] ?? label.en) : label.en;
  return typeof pick === "string" ? pick : undefined;
}

/** A pack row inside an item's `w` block: localized label and the snapshot text of its ref. */
function localizeRow(row: unknown, index: PackTextIndex): unknown {
  if (!isItem(row) || row.origin !== PACK_ORIGIN || !index.has(row.ref)) return row;
  const englishLabel = typeof row.label === "string" ? row.label : undefined;
  const section = typeof row.id === "string" && row.id.includes("#") ? englishLabel : undefined;
  return {
    ...row,
    label: section !== undefined ? index.name(row.ref, section) : index.name(row.ref),
    text: index.text(row.ref, section),
  };
}

function localizeW(w: unknown, index: PackTextIndex, label: string | undefined): unknown {
  if (!isItem(w)) return w;
  const out: Item = {};
  for (const [key, value] of Object.entries(w)) {
    out[key] = Array.isArray(value) ? value.map((row) => localizeRow(row, index)) : value;
  }
  if (label !== undefined && typeof w.label === "string") out.label = label;
  return out;
}

/** One pack pick item as the wizard sees it: plain label in `locale`, `origin: "pack"`, snapshot `text`. */
export function localizeItem(item: PackWizardItem, index: PackTextIndex): Item {
  const ref = index.has(item.ref) ? item.ref : undefined;
  const label = ref ? index.name(ref) : localizeLabel(item.label, index.locale);
  return {
    ...item,
    ...(label !== undefined ? { label } : {}),
    origin: PACK_ORIGIN,
    ...(ref ? { text: index.text(ref) } : {}),
    ...(item.w !== undefined ? { w: localizeW(item.w, index, label) } : {}),
  };
}

/** `gameData` with the pack's wizard items appended; an item whose id or ref is built-in is left out. */
export function overlayGameData(
  gameData: Record<string, unknown> | undefined,
  pack: PackContent,
  locale: string,
): Record<string, unknown> {
  const index = new PackTextIndex(pack, locale);
  const out: Record<string, unknown> = { ...gameData };
  for (const [key, items] of Object.entries(pack.wizard)) {
    const builtin = Array.isArray(gameData?.[key]) ? (gameData[key] as unknown[]) : [];
    if (!Array.isArray(gameData?.[key]) && items.length === 0) continue;
    const ids = new Set<unknown>();
    const refs = new Set<unknown>();
    for (const item of builtin) {
      if (isItem(item)) {
        ids.add(item.id);
        if (item.ref !== undefined) refs.add(item.ref);
      }
    }
    const added = items.filter((item) => !ids.has(item.id) && (item.ref === undefined || !refs.has(item.ref)));
    out[key] = [...builtin, ...added.map((item) => localizeItem(item, index))];
  }
  return out;
}

/** UTF-8 bytes of the names and texts of every pack row in `data`, the quantity the 200 KB cap bounds. */
export function packSnapshotBytes(data: Record<string, unknown>): number {
  let bytes = 0;
  for (const value of Object.values(data)) {
    if (!Array.isArray(value)) continue;
    for (const row of value) {
      if (!isItem(row) || row.origin !== PACK_ORIGIN) continue;
      bytes += utf8Length(String(row.name ?? "")) + utf8Length(typeof row.text === "string" ? row.text : "");
    }
  }
  return bytes;
}

export type SnapshotResult = { ok: true; data: Record<string, unknown>; bytes: number } | { ok: false; bytes: number };

function utf8Length(text: string): number {
  return new TextEncoder().encode(text).byteLength;
}

/**
 * Copies pack text into every row of `data` that came from the pack and has
 * no text yet, so any viewer renders it without the pack (§1.8). Refuses when
 * the pack names and texts of the character pass 200 KB.
 */
export function snapshotPackRows(
  data: Record<string, unknown>,
  index: PackTextIndex,
  /** List fields whose rows have a `text` field. */
  textLists: ReadonlySet<string>,
): SnapshotResult {
  let bytes = 0;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (!Array.isArray(value)) {
      out[key] = value;
      continue;
    }
    out[key] = value.map((row) => {
      if (!isItem(row) || row.origin !== PACK_ORIGIN) return row;
      let next = row;
      if ((typeof row.text !== "string" || row.text === "") && index.has(row.ref) && textLists.has(key)) {
        next = { ...row, text: index.rowText(row) };
      }
      bytes += utf8Length(String(next.name ?? "")) + utf8Length(typeof next.text === "string" ? next.text : "");
      return next;
    });
  }
  return bytes > PACK_LIMITS.snapshotBytes ? { ok: false, bytes } : { ok: true, data: out, bytes };
}

