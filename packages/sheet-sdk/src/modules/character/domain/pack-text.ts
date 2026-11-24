// Content-pack text in a table copy (D9): a table copy keeps each pack row's ref, name and
// origin but never its text, which only the owner's pack may supply. Pure, system-agnostic.

/** Origin marker of every row copied from a content pack. */
export const PACK_ORIGIN = "pack";

type Row = Record<string, unknown>;
const isRow = (value: unknown): value is Row =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Drops the text of every pack row in the top-level lists of `data`, keeping its ref, name and
 * origin: what a table copy holds (the same rule as `public.strip_pack_text` in migration 165).
 */
export function stripPackText(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    out[key] = Array.isArray(value)
      ? value.map((row) => {
          if (!isRow(row) || row.origin !== PACK_ORIGIN || !("text" in row)) return row;
          const { text: _text, ...rest } = row;
          return rest;
        })
      : value;
  }
  return out;
}

/**
 * The data a whole-sheet JSON import writes: an exported vault sheet carries its pack text,
 * so an import into a table copy drops it (D9); a vault sheet takes the file as it is.
 */
export function importedSheetData(
  data: Record<string, unknown>,
  { inTable }: { inTable: boolean },
): Record<string, unknown> {
  return inTable ? stripPackText(data) : data;
}

/**
 * One pack row's text the saving device's pack supplies for a new vault sheet (save as new,
 * D9 §1.8): the row's place and identity in the saved data, and its snapshot text.
 */
export interface PackTextFill {
  list: string;
  index: number;
  id?: string;
  ref: string;
  name: string;
  text: string;
}

/** A pack row with no text yet: what a snapshot fills (the vault wizard's rule). */
function lacksPackText(row: unknown): row is Row {
  return isRow(row) && row.origin === PACK_ORIGIN && (typeof row.text !== "string" || row.text === "");
}

function sameRow(row: Row, fill: Pick<PackTextFill, "id" | "ref" | "name">): boolean {
  return row.ref === fill.ref && row.name === fill.name && (fill.id === undefined || row.id === fill.id);
}

/**
 * The pack rows `snapshot` gave text that lacked it in `saved`, list by list: what a device
 * snapshot adds to a saved sheet. Rows are compared at the same index (a snapshot keeps the order).
 */
export function packTextFills(saved: Record<string, unknown>, snapshot: Record<string, unknown>): PackTextFill[] {
  const fills: PackTextFill[] = [];
  for (const [list, rows] of Object.entries(snapshot)) {
    const before = saved[list];
    if (!Array.isArray(rows) || !Array.isArray(before)) continue;
    rows.forEach((row, index) => {
      const old = before[index];
      if (!isRow(row) || typeof row.text !== "string" || row.text === "" || !lacksPackText(old)) return;
      if (typeof old.ref !== "string" || typeof old.name !== "string" || old.ref !== row.ref || old.name !== row.name) return;
      fills.push({ list, index, ...(typeof old.id === "string" ? { id: old.id } : {}), ref: old.ref, name: old.name, text: row.text });
    });
  }
  return fills;
}

/**
 * Puts each fill's text on its pack row in `data`: the row at its index when it is still that
 * row, else the row with its id. Only a pack row with no text takes one; a row renamed or removed
 * since, a custom row and a row with text are left as they are.
 */
export function applyPackTextFills(data: Record<string, unknown>, fills: readonly PackTextFill[]): Record<string, unknown> {
  const out: Record<string, unknown> = { ...data };
  for (const fill of fills) {
    const rows = out[fill.list];
    if (!Array.isArray(rows)) continue;
    const atIndex = rows[fill.index];
    const index = lacksPackText(atIndex) && sameRow(atIndex, fill)
      ? fill.index
      : fill.id === undefined ? -1 : rows.findIndex((row) => lacksPackText(row) && sameRow(row, fill));
    if (index < 0) continue;
    const next = [...rows];
    next[index] = { ...(rows[index] as Row), text: fill.text };
    out[fill.list] = next;
  }
  return out;
}

/** What a System's content pack makes of a saved sheet on this device (save as new, D9 §1.8). */
export type DevicePackTextSnapshot =
  /** This device has no pack of the System: the sheet keeps names only. */
  | { status: "none" }
  /** The pack names and texts would pass the snapshot cap: the sheet keeps names only. */
  | { status: "too_large"; bytes: number }
  /** `data` with the device pack's text on pack rows that had none. */
  | { status: "ok"; data: Record<string, unknown> };

/**
 * The port a content-pack plugin fills: snapshot this device's pack text into a sheet's pack rows
 * that lack it, in `locale`, the way its vault wizard snapshots a new card.
 */
export type SnapshotDevicePackText = (input: {
  systemSlug: string;
  locale: string;
  data: Record<string, unknown>;
}) => Promise<DevicePackTextSnapshot>;
