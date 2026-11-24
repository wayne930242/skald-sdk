import type { FormulaValueType } from "@skald/formula";

/**
 * Write contracts of the pure-data `object` field type (state the sheet's
 * handlers read, never rendered). Shared by publish validation and the
 * wizard engine, so both read a field's shape from the same place: its
 * `defaultValue`.
 *
 * - An object `defaultValue` declares the members a wizard may write one at
 *   a time (`{ field, member }`); each holds a number, string or boolean,
 *   whose type is the type the member accepts.
 * - An array-of-strings `defaultValue` declares an id list: a pick's `store`
 *   writes every picked id into it.
 */

const OBJECT_FIELD_TYPE = "object";

export type ObjectMemberContract =
  | {
      ok: true;
      valueType: FormulaValueType;
      /** The field's `defaultValue`: what a write starts from while the Character has no object. */
      defaults: Readonly<Record<string, unknown>>;
    }
  /**
   * `not_object`: the field is not an `object` field with an object default
   * (`actual` names its type, or its default's shape). `no_member`: the
   * default has no such member. `not_scalar`: the member holds an object, an
   * array or null.
   */
  | { ok: false; problem: "not_object" | "no_member" | "not_scalar"; actual: string };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function shapeOf(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

/** The contract of one member of a schema field. */
export function objectMemberContract(field: unknown, member: string): ObjectMemberContract {
  if (!isObject(field) || field.type !== OBJECT_FIELD_TYPE) {
    return {
      ok: false,
      problem: "not_object",
      actual: isObject(field) ? String(field.type) : "missing",
    };
  }
  const defaults = field.defaultValue;
  if (!isObject(defaults)) {
    return { ok: false, problem: "not_object", actual: shapeOf(defaults) };
  }
  if (!Object.prototype.hasOwnProperty.call(defaults, member)) {
    return { ok: false, problem: "no_member", actual: "undefined" };
  }
  const value = defaults[member];
  if (typeof value === "number" || typeof value === "string" || typeof value === "boolean") {
    return { ok: true, valueType: typeof value as FormulaValueType, defaults };
  }
  return { ok: false, problem: "not_scalar", actual: shapeOf(value) };
}

/** Whether a schema field is an id list: an `object` field whose `defaultValue` is an array of strings. */
export function isIdListField(field: unknown): boolean {
  return (
    isObject(field) &&
    field.type === OBJECT_FIELD_TYPE &&
    Array.isArray(field.defaultValue) &&
    field.defaultValue.every((id) => typeof id === "string")
  );
}
