/**
 * A sheet row's body text, the same rule in play, edit and print (plan-uat2 §3.4). Pure: print
 * imports it, so it must not import React or any sheet module.
 *
 * - `playerText`, when the player wrote one, wins.
 * - A pack row shows its `text` snapshot (design.md §231), never the corpus.
 * - Any other row shows its own `text` (a custom row's description), else the live SRD corpus
 *   text in the viewer's locale, which the caller resolves (`srdText`).
 */

/** Lists whose rows carry `playerText`. */
export const PLAYER_TEXT_LISTS = ["features", "speciesTraits", "feats", "spells", "equipment", "weapons", "toolProficiencies"] as const;

/** Per row, the same as the pack row snapshot cap (`SNAPSHOT_MAX_CHARS`). */
export const PLAYER_TEXT_MAX_CHARS = 8000;

type Row = Record<string, unknown>;

const str = (value: unknown): string => (typeof value === "string" ? value : "");

/** The player's own wording, or "" when blank. */
export function playerTextOf(row: Row): string {
  const own = str(row.playerText);
  return own.trim() ? own : "";
}

export function rowBodyText(row: Row, srdText: string | null | undefined): string {
  const own = playerTextOf(row);
  if (own) return own;
  const saved = str(row.text);
  if (str(row.origin) === "pack") return saved;
  return saved.trim() ? saved : (srdText ?? "");
}

export function capPlayerText(value: string): string {
  return value.length > PLAYER_TEXT_MAX_CHARS ? value.slice(0, PLAYER_TEXT_MAX_CHARS) : value;
}

export interface TextEditStart {
  /** The row field the editor writes: a custom row's own `text`, else `playerText`. */
  field: "text" | "playerText";
  value: string;
  /** Read-only text shown beside the editor: a pack row's snapshot. */
  beside: string;
}

/**
 * Where 「編輯文字」 starts: an SRD row with the resolved corpus text, so the player can trim it; a
 * pack row empty, with the pack text beside it (pack text is never copied into `playerText`).
 */
export function textEditStart(row: Row, srdText: string | null | undefined): TextEditStart {
  const origin = str(row.origin);
  if (origin === "custom" || (!origin && !str(row.ref))) return { field: "text", value: str(row.text), beside: "" };
  const own = playerTextOf(row);
  if (origin === "pack") return { field: "playerText", value: own, beside: str(row.text) };
  return { field: "playerText", value: own || rowBodyText(row, srdText), beside: "" };
}

/**
 * What 「儲存」 writes: nothing when the text is its start unchanged. An SRD row saved as it opened
 * keeps no copy of the corpus text, so it stays in the viewer's locale and follows corpus updates.
 */
export function textEditSave(start: TextEditStart, value: string): { field: TextEditStart["field"]; value: string } | null {
  const next = capPlayerText(value);
  return next === capPlayerText(start.value) ? null : { field: start.field, value: next };
}
