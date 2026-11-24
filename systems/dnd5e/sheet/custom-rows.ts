import type { ListField, ListRowField, Schema } from "@skald/types/schema";
import { newEntryId, rowDefaults } from "./compendium-rows";

/**
 * Custom rows and row edits in play (plan-uat2 §3.2). Pure: the forms, the row menu and their
 * tests share it.
 */

/** Lists a player can add a custom row to, and the row fields its form shows (the list's rowTemplate). */
export const CUSTOM_FORM_FIELDS = {
  spells: ["name", "level", "castingTime", "range", "concentration", "ritual", "material", "source", "notes", "text"],
  features: ["name", "level", "text"],
  feats: ["name", "category", "text"],
  weapons: ["name", "ability", "proficient", "magic", "ranged", "damageDice", "damageType", "mastery", "notes"],
  speciesTraits: ["name", "text"],
  toolProficiencies: ["name", "text"],
  languages: ["name"],
} as const satisfies Record<string, readonly string[]>;

export type CustomList = keyof typeof CUSTOM_FORM_FIELDS;

type Row = Record<string, unknown>;

function listField(schema: Schema, list: string): ListField | undefined {
  const field = schema.fields[list];
  return field?.type === "list" ? field : undefined;
}

/**
 * The rowTemplate fields a list's form edits, in form order. A row that is not custom keeps its
 * text (編輯文字 edits that), and `locked` leaves out the fields the sheet shows from the catalog
 * instead of the row (`catalogFields`: a built-in row's name).
 */
export function formFields(schema: Schema, list: CustomList, row?: Row, locked: readonly string[] = []): ListRowField[] {
  const children = listField(schema, list)?.rowTemplate.children ?? [];
  const custom = row === undefined || row.origin === "custom" || (!row.origin && !row.ref);
  return CUSTOM_FORM_FIELDS[list]
    .filter((id) => (custom || id !== "text") && !locked.includes(id))
    .map((id) => children.find((child) => child.id === id))
    .filter((field): field is ListRowField => field !== undefined);
}

/** A form's values, the starting values for a row (its own) or a new one (the rowTemplate defaults). */
export function formValues(schema: Schema, list: CustomList, row?: Row, locked: readonly string[] = []): Row {
  const defaults = rowDefaults(listField(schema, list));
  const source = row ?? defaults;
  return Object.fromEntries(formFields(schema, list, row, locked).map((field) => [field.id, source[field.id] ?? defaults[field.id] ?? ""]));
}

/** A new custom row: the template defaults, a fresh id, the form's values and `origin: "custom"`. */
export function buildCustomRow(schema: Schema, list: CustomList, values: Row): Row {
  const field = listField(schema, list);
  const allowed = new Set(formFields(schema, list).map((child) => child.id));
  const own = Object.fromEntries(Object.entries(values).filter(([key]) => allowed.has(key)));
  return { ...rowDefaults(field), id: newEntryId(field?.idPrefix ?? list), ...own, origin: "custom" };
}

/** A built-in row picked from SRD chips (語言): `ref`, its name, `origin: "srd"`, text resolved live. */
export function buildSrdRow(schema: Schema, list: string, ref: string, name: string): Row {
  const field = listField(schema, list);
  return { ...rowDefaults(field), id: newEntryId(field?.idPrefix ?? list), name, ref, origin: "srd", text: "" };
}

/** Where a row sits in its list: the same object, else its id. */
export function rowIndex(list: unknown, row: Row): number {
  const items = Array.isArray(list) ? list : [];
  const same = items.indexOf(row);
  if (same >= 0) return same;
  const id = typeof row.id === "string" ? row.id : "";
  return id ? items.findIndex((item) => typeof item === "object" && item !== null && (item as Row).id === id) : -1;
}

export function appendRow(data: Row, list: string, row: Row): Row {
  const items = Array.isArray(data[list]) ? (data[list] as unknown[]) : [];
  return { ...data, [list]: [...items, row] };
}

/** The row at `index` with `patch` on top; the data unchanged when there is no such row. */
export function patchRow(data: Row, list: string, index: number, patch: Row): Row {
  const items = Array.isArray(data[list]) ? (data[list] as Row[]) : [];
  if (index < 0 || index >= items.length) return data;
  return { ...data, [list]: items.map((item, at) => (at === index ? { ...item, ...patch } : item)) };
}

export interface RemovedRow {
  list: string;
  index: number;
  row: Row;
}

export function removeRow(data: Row, list: string, index: number): { data: Row; removed: RemovedRow | null } {
  const items = Array.isArray(data[list]) ? (data[list] as Row[]) : [];
  if (index < 0 || index >= items.length) return { data, removed: null };
  return { data: { ...data, [list]: items.filter((_, at) => at !== index) }, removed: { list, index, row: items[index] } };
}

/** Undo of `removeRow`: the row back at its index (the end when the list has since shrunk). */
export function restoreRow(data: Row, removed: RemovedRow): Row {
  const items = Array.isArray(data[removed.list]) ? [...(data[removed.list] as Row[])] : [];
  if (rowIndex(items, removed.row) >= 0) return data;
  items.splice(Math.min(removed.index, items.length), 0, removed.row);
  return { ...data, [removed.list]: items };
}
