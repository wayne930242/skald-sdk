/**
 * Character sheet rows from homebrew packs (IMPL §3.6, ADR 0018): a picked row becomes
 * `origin: "custom"` with its text copied in, so a table copy keeps it (`strip_pack_text` drops only
 * `origin: "pack"` text), and a stamp of the pack, item and revision it came from. The row keeps its
 * `ref`. The stamp is three flat keys so every save path keeps them.
 */
import { PACK_ORIGIN } from "@skald/sheet-sdk/modules/character/pack-text";

/** Which homebrew item, and which revision of it, a row was copied from. */
export interface HomebrewStamp {
  /** Pack uuid. */
  pack: string;
  /** Item uuid. */
  item: string;
  rev: number;
}

export const STAMP_FIELDS = { pack: "homebrewPack", item: "homebrewItem", rev: "homebrewRev" } as const;

type Row = Record<string, unknown>;

const isRow = (value: unknown): value is Row => typeof value === "object" && value !== null && !Array.isArray(value);

/** The row's stamp, or null for a row that did not come from a homebrew pack. */
export function stampOf(row: Row): HomebrewStamp | null {
  const pack = row[STAMP_FIELDS.pack];
  const item = row[STAMP_FIELDS.item];
  const rev = row[STAMP_FIELDS.rev];
  if (typeof pack !== "string" || !pack || typeof item !== "string" || !item) return null;
  if (typeof rev !== "number" || !Number.isInteger(rev) || rev < 1) return null;
  return { pack, item, rev };
}

/** A picked pack row turned into a homebrew row: `origin: "custom"`, the text snapshot, the stamp. */
export function asHomebrewRow(row: Row, text: string, stamp: HomebrewStamp): Row {
  return {
    ...row,
    origin: "custom",
    text,
    [STAMP_FIELDS.pack]: stamp.pack,
    [STAMP_FIELDS.item]: stamp.item,
    [STAMP_FIELDS.rev]: stamp.rev,
  };
}

/**
 * Every pack row of `data` (top-level lists, `origin: "pack"`) whose ref a homebrew pack supplies in
 * this view, as `asHomebrewRow`: the wizard's commit step, before pack text is stripped or
 * snapshotted. `textOf` gives the row's text (a species trait row: its trait); when it has none the
 * row's own `text` stays.
 */
export function adoptHomebrewRows(
  data: Record<string, unknown>,
  stamps: Readonly<Record<string, HomebrewStamp>>,
  textOf: (row: Row) => string,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    out[key] = Array.isArray(value)
      ? value.map((row) => {
          if (!isRow(row) || row.origin !== PACK_ORIGIN || typeof row.ref !== "string") return row;
          const stamp = Object.prototype.hasOwnProperty.call(stamps, row.ref) ? stamps[row.ref] : undefined;
          if (!stamp) return row;
          const text = textOf(row) || (typeof row.text === "string" ? row.text : "");
          return asHomebrewRow(row, text, stamp);
        })
      : value;
  }
  return out;
}

/** "Update to latest": the view supplies the row's ref from the same homebrew item at a later revision. */
export function hasNewerHomebrew(row: Row, stamps: Readonly<Record<string, HomebrewStamp>>): boolean {
  const own = stampOf(row);
  if (!own || typeof row.ref !== "string" || !Object.prototype.hasOwnProperty.call(stamps, row.ref)) return false;
  const current = stamps[row.ref];
  return current.item === own.item && current.rev > own.rev;
}
