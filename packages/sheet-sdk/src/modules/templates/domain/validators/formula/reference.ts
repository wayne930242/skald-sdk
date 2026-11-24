import type { FormulaReferenceCatalog, FormulaSourceDefinition, FormulaValueType } from "@skald/formula";
import { fieldFormulaValueType, FORMULA_VALUE_TYPES as valueTypes, type JsonObject, type TemplateValidationIssue } from "@skald/sheet-sdk/modules/sheet-schema";
import { CONDITION_FORMULA_ID_PREFIX, conditionItemIdIssues, conditionSuggestTargetId, isGeneratedConditionDefinition, suggestingItems } from "@skald/sheet-sdk/modules/character/conditions";
import type { ConditionsField } from "@skald/types/schema";
import { isObject, formulaIssue } from "./issues";

/**
 * Reference catalog of a template source: Character field ids (including
 * derived ids such as `hp_current`), List row fields and lookup tables.
 */
export function buildFormulaReferenceCatalog(source: JsonObject): FormulaReferenceCatalog {
  const character: Record<string, FormulaValueType> = {};
  const rows: Record<string, Record<string, FormulaValueType>> = {};
  const schema = isObject(source.schema) ? source.schema : {};
  const fields = isObject(schema.fields) ? schema.fields : {};
  for (const [fieldId, rawField] of Object.entries(fields)) {
    if (!isObject(rawField)) continue;
    const valueType = fieldFormulaValueType(rawField);
    if (valueType) character[fieldId] = valueType;
    if (rawField.type === "coc-tracked-resource") {
      character[`${fieldId}_current`] = "number";
      character[`${fieldId}_max`] = "number";
      character[`${fieldId}_start`] = "number";
    }
    if (rawField.type === "resource") {
      // CS-4 resource：目前值固定可參照；上限與起始值有設定才有
      character[`${fieldId}_current`] = "number";
      if (rawField.max !== undefined && rawField.max !== null) {
        character[`${fieldId}_max`] = "number";
      }
      if (rawField.start !== undefined && rawField.start !== null) {
        character[`${fieldId}_start`] = "number";
      }
    }
    if (rawField.type === "conditions" && Array.isArray(rawField.items)) {
      // 建議公式的隱藏 derived 目標一律是布林
      for (const item of suggestingItems(rawField as unknown as ConditionsField)) {
        character[conditionSuggestTargetId(
          typeof rawField.id === "string" ? rawField.id : fieldId,
          item.id,
        )] = "boolean";
      }
    }
    if (
      rawField.type === "list" &&
      isObject(rawField.rowTemplate) &&
      Array.isArray(rawField.rowTemplate.children)
    ) {
      const row: Record<string, FormulaValueType> = {};
      for (const rawChild of rawField.rowTemplate.children) {
        if (!isObject(rawChild) || typeof rawChild.id !== "string") continue;
        const childType = fieldFormulaValueType(rawChild);
        if (childType) row[rawChild.id] = childType;
      }
      rows[fieldId] = row;
    }
  }

  const computed = isObject(schema.computed) ? schema.computed : {};
  for (const path of Object.keys(computed)) {
    character[path.replace(/[^A-Za-z0-9_-]+/g, "_")] = "number";
  }

  const lookups: Record<string, FormulaValueType> = {};
  const formulaSource = isObject(source.formulas) ? source.formulas : {};
  const rawLookups = isObject(formulaSource.lookups) ? formulaSource.lookups : {};
  const rawReferenceTypes = isObject(formulaSource.referenceTypes)
    ? formulaSource.referenceTypes
    : {};
  for (const [fieldId, rawType] of Object.entries(rawReferenceTypes)) {
    if (
      typeof rawType === "string" &&
      valueTypes.has(rawType as FormulaValueType)
    ) {
      character[fieldId] = rawType as FormulaValueType;
    }
  }
  for (const [lookupId, rawType] of Object.entries(rawLookups)) {
    const valueType = isObject(rawType) ? rawType.valueType : rawType;
    if (
      typeof valueType === "string" &&
      valueTypes.has(valueType as FormulaValueType)
    ) {
      lookups[lookupId] = valueType as FormulaValueType;
    }
  }
  return { character, rows, lookups };
}

/** conditions 項目 id 與保留前綴的結構檢查；任何一項都會擋下發布 */
export function conditionStructuralIssues(
  source: JsonObject,
  definitions: FormulaSourceDefinition[],
): TemplateValidationIssue[] {
  const issues: TemplateValidationIssue[] = [];
  const schema = isObject(source.schema) ? source.schema : {};
  const fields = isObject(schema.fields) ? schema.fields : {};
  const list = Object.entries(fields).flatMap(([key, raw]) =>
    isObject(raw) && typeof raw.type === "string"
      ? [{ id: key, type: raw.type, items: raw.items }]
      : [],
  );
  for (const issue of conditionItemIdIssues(list)) {
    issues.push({
      category: "formula",
      code: "condition_item_id_invalid",
      severity: "error",
      path: ["schema", "fields", issue.fieldId, "items", String(issue.index), "id"],
      message: `Conditions item id "${issue.itemId}" is invalid (${issue.problem}). Item ids must be non-empty, use only letters, digits, "_" and "-", contain no "__", and be unique and different from every field id.`,
      details: { fieldId: issue.fieldId, problem: issue.problem },
    });
  }
  for (const definition of definitions) {
    if (
      definition.id.startsWith(CONDITION_FORMULA_ID_PREFIX) &&
      !isGeneratedConditionDefinition(definition)
    ) {
      issues.push(
        formulaIssue(
          "reserved_formula_id",
          `Formula id "${definition.id}" uses the reserved prefix "${CONDITION_FORMULA_ID_PREFIX}", which is generated from conditions item suggestions. Rename the formula.`,
          ["formulas", definition.id],
        ),
      );
    }
  }
  return issues;
}
