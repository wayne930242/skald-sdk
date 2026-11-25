/**
 * The save plan of an entry stored as several rows (a subclass or a class with its features): only
 * rows whose payload changed (canonical JSON) are written, so an unchanged feature keeps its revision
 * and no sheet row is offered a spurious update. Writes keep the order of `rows` (the main row, then
 * generated rows, then authored ones); stored rows no longer generated are deleted.
 */
import { canonicalJson } from "../../content-pack/domain/canonical-json";
import type { HomebrewItemSave } from "../store-port";
import type { HomebrewItemInput, HomebrewItemRecord } from "./types";

export interface MultiRowPlan {
  writes: HomebrewItemSave[];
  /** Row uuids. */
  deletes: string[];
  /** Rows the writes create (for the row limit pre-check). */
  addedRows: number;
  /** Payload bytes the plan adds (negative when it frees some). */
  bytesDelta: number;
}

const bytesOf = (row: HomebrewItemInput) => new TextEncoder().encode(JSON.stringify(row.payload)).length;

/** `rows`: what the form generates now; `stored`: the entry's rows as saved (main row and its children). */
export function planRows(rows: readonly HomebrewItemInput[], stored: readonly HomebrewItemRecord[]): MultiRowPlan {
  const writes: HomebrewItemSave[] = [];
  let bytesDelta = 0;
  let addedRows = 0;
  for (const row of rows) {
    const prev = stored.find((p) => p.key === row.key && p.kind === row.kind);
    if (prev && canonicalJson(prev.payload) === canonicalJson(row.payload)) continue;
    writes.push({ ...row, ...(prev ? { id: prev.id, expectedRevision: prev.revision } : {}) });
    if (!prev) addedRows++;
    bytesDelta += bytesOf(row) - (prev?.bytes ?? 0);
  }
  const removed = stored.filter((old) => !rows.some((row) => row.key === old.key && row.kind === old.kind));
  return {
    writes,
    deletes: removed.map((row) => row.id),
    addedRows,
    bytesDelta: bytesDelta - removed.reduce((sum, row) => sum + row.bytes, 0),
  };
}
