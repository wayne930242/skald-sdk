import type { FormulaValueType } from "@skald/formula";
import type { JsonObject } from "./validation-types";

export const FORMULA_VALUE_TYPES: ReadonlySet<FormulaValueType> = new Set<FormulaValueType>([
  "number",
  "string",
  "boolean",
]);
const numberFieldTypes = new Set([
  "number",
  "computed",
  "simple-stat",
  "progress",
  "rating",
  "coc-tracked-resource",
  "attribute",
  "fate-refresh",
]);
const stringFieldTypes = new Set(["text", "textarea", "select"]);
const booleanFieldTypes = new Set(["checkbox", "toggle"]);

/** The formula value type a field (or List row field) holds, if it holds one. */
export function fieldFormulaValueType(field: JsonObject): FormulaValueType | undefined {
  if (
    typeof field.formulaValueType === "string" &&
    FORMULA_VALUE_TYPES.has(field.formulaValueType as FormulaValueType)
  ) {
    return field.formulaValueType as FormulaValueType;
  }
  if (field.type === "computed" && field.format === "text") return "string";
  if (typeof field.type !== "string") return undefined;
  if (numberFieldTypes.has(field.type)) return "number";
  if (stringFieldTypes.has(field.type)) return "string";
  if (booleanFieldTypes.has(field.type)) return "boolean";
  return undefined;
}
