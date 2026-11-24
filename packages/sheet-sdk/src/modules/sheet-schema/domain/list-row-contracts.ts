import type { FormulaValueType } from "@skald/formula";
import { fieldFormulaValueType } from "./field-formula-value-type";
import type { JsonObject } from "./validation-types";

/**
 * Row contracts of the List field types whose entries carry a stable string
 * `id`, so a wizard can address, add and rename them. Shared by publish
 * validation and the wizard engine; one place knows each type's row shape,
 * where its default entry keys live and how it spells an unnamed slot.
 */

export interface ListRowField {
  /** The scalar type the row field holds. */
  valueType?: FormulaValueType;
  /** A computed row field is read only. */
  computed: boolean;
}

export interface ListRowContract {
  /** Field type name of the List. */
  fieldType: string;
  /** Row fields by id; `id`, the stable key, is always one of them. */
  rows: ReadonlyMap<string, ListRowField>;
  /**
   * Row field values that mark a row a wizard appended (not a filled slot or
   * an existing row), so the sheet treats it like a row the user added.
   */
  appendedRowMarks: Readonly<Record<string, boolean | string | number>>;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Skill row marker: the wizard replaced the row's base, so the sheet keeps it. */
export const BASE_DERIVED = "baseDerived";

const KEY_ROW: [string, ListRowField] = ["id", { valueType: "string", computed: false }];

/**
 * `coc-skill-list`: the rows the skill list renderer stores (one per skill),
 * keyed by skill id. Its default keys are `defaultSkills`; an unnamed slot
 * of a specialization group is `<group>[<n>]`.
 */
const SKILL_LIST_ROWS = new Map<string, ListRowField>([
  KEY_ROW,
  ["name", { valueType: "string", computed: false }],
  ["specializationName", { valueType: "string", computed: false }],
  ["baseValue", { valueType: "number", computed: false }],
  ["value", { valueType: "number", computed: false }],
  ["category", { valueType: "string", computed: false }],
  ["improved", { valueType: "boolean", computed: false }],
  ["isSpecialization", { valueType: "boolean", computed: false }],
  ["canImprove", { valueType: "boolean", computed: false }],
  ["hiddenByEra", { valueType: "boolean", computed: false }],
  ["occupational", { valueType: "boolean", computed: false }],
  /** The row is one of the skills of the character's archetype; the sheet marks it. */
  ["archetypal", { valueType: "boolean", computed: false }],
  ["isUserAdded", { valueType: "boolean", computed: false }],
  [BASE_DERIVED, { valueType: "boolean", computed: false }],
]);

/** A skill row the wizard appends is removable on the sheet, like one the skill picker adds. */
const SKILL_LIST_APPENDED_MARKS = Object.freeze({ isUserAdded: true });
const NO_MARKS = Object.freeze({});

const SKILL_LIST_TYPE = "coc-skill-list";

/**
 * The row contract of a keyed List field, or null when the field is not one:
 * a `list` with a Row Template, or a `coc-skill-list`.
 */
export function listRowContract(field: unknown): ListRowContract | null {
  if (!isObject(field)) return null;
  if (field.type === SKILL_LIST_TYPE) {
    return {
      fieldType: SKILL_LIST_TYPE,
      rows: SKILL_LIST_ROWS,
      appendedRowMarks: SKILL_LIST_APPENDED_MARKS,
    };
  }
  if (
    field.type !== "list" ||
    !isObject(field.rowTemplate) ||
    !Array.isArray(field.rowTemplate.children)
  ) {
    return null;
  }
  const rows = new Map<string, ListRowField>([KEY_ROW]);
  for (const child of field.rowTemplate.children) {
    if (!isObject(child) || typeof child.id !== "string") continue;
    rows.set(child.id, {
      valueType: fieldFormulaValueType(child as JsonObject),
      computed: child.type === "computed",
    });
  }
  return { fieldType: "list", rows, appendedRowMarks: NO_MARKS };
}

/**
 * The schema's default entries of a keyed List, as raw values: `defaultValue`
 * entries of a `list` (objects with `id`), `defaultSkills` ids of a
 * `coc-skill-list`. The caller bounds the walk over them.
 */
export function defaultEntrySources(field: unknown): unknown[] {
  if (!isObject(field)) return [];
  const entries = field.type === SKILL_LIST_TYPE ? field.defaultSkills : field.defaultValue;
  return Array.isArray(entries) ? entries : [];
}

/** The stable key of one default entry source; undefined when it has none. */
export function defaultEntryKey(field: unknown, entry: unknown): string | undefined {
  if (isObject(field) && field.type === SKILL_LIST_TYPE && typeof entry === "string") {
    return entry;
  }
  return isObject(entry) && typeof entry.id === "string" ? entry.id : undefined;
}

/**
 * Whether `key` is an unnamed slot of specialization group `group` in the
 * List: `<group>[<n>]` in a `coc-skill-list`, `<group>#<n>` in a `list`.
 */
export function isEmptySlotKey(field: unknown, group: string, key: string): boolean {
  if (isObject(field) && field.type === SKILL_LIST_TYPE) {
    const prefix = `${group}[`;
    return (
      key.startsWith(prefix) &&
      key.endsWith("]") &&
      /^\d+$/.test(key.slice(prefix.length, -1))
    );
  }
  const prefix = `${group}#`;
  return key.startsWith(prefix) && /^\d+$/.test(key.slice(prefix.length));
}
