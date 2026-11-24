import { FORMULA_LANGUAGE, type FormulaSourceDefinition } from "@skald/formula";
import type { Json } from "@skald/types";
import type { Schema, Template } from "@skald/types/schema";
import {
  conditionSuggestFormulaId,
  conditionSuggestTargetId,
  isGeneratedConditionDefinition,
  suggestingItems,
} from "@skald/sheet-sdk/modules/character/conditions";

export type TemplateDraftSource = { [key: string]: Json | undefined };

function isObject(value: Json | undefined): value is TemplateDraftSource {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFormulaDefinition(value: Json): value is Json & FormulaSourceDefinition {
  if (!isObject(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.kind === "string" &&
    typeof value.targetFieldId === "string" &&
    typeof value.source === "string" &&
    isObject(value.location)
  );
}

function formulaFieldId(path: string): string {
  return path.replace(/[^A-Za-z0-9_-]+/g, "_");
}

function firstFormulaReference(source: string): string | null {
  const match = source.match(/\[([A-Za-z0-9_-]+)\]/);
  return match?.[1] ?? null;
}

export function buildTemplateDraftSource(
  baseSource: TemplateDraftSource,
  schema: Schema,
  template: Template
): TemplateDraftSource {
  const computedFields = Object.values(schema.fields).filter(
    (field) => field.type === "computed"
  );
  const computedFieldIds = new Set(computedFields.map((field) => field.id));
  const listComputedFields = Object.values(schema.fields).flatMap((field) =>
    field.type === "list"
      ? field.rowTemplate.children
          .filter((child) => child.type === "computed")
          .map((child) => ({ listFieldId: field.id, field: child }))
      : [],
  );
  const listComputedKeys = new Set(
    listComputedFields.map(
      ({ listFieldId, field }) => `${listFieldId}:${field.id}`,
    ),
  );
  const schemaComputedDefinitions: FormulaSourceDefinition[] = Object.entries(
    schema.computed ?? {},
  ).map(([path, config]) => ({
    id: `${path.endsWith(".start") ? "default" : "derived"}:schema:${formulaFieldId(path)}`,
    kind: path.endsWith(".start") ? "default" : "derived",
    targetFieldId: formulaFieldId(path),
    source: config.formula.trim(),
    location: { scope: "character" },
  }));
  // conditions 的 items[].suggest：每個項目一條隱藏 derived 公式，不對應任何欄位
  const conditionSuggestDefinitions: FormulaSourceDefinition[] = Object.values(
    schema.fields,
  ).flatMap((field) =>
    field.type === "conditions"
      ? suggestingItems(field).map((item) => ({
          id: conditionSuggestFormulaId(field.id, item.id),
          kind: "derived" as const,
          targetFieldId: conditionSuggestTargetId(field.id, item.id),
          source: item.suggest,
          location: { scope: "character" as const },
        }))
      : [],
  );
  const validationDefinitions: FormulaSourceDefinition[] = (
    schema.validations ?? []
  ).flatMap((validation) => {
    const targetFieldId = firstFormulaReference(validation.rule);
    return targetFieldId
      ? [
          {
            id: `validation:schema:${validation.id}`,
            kind: "validation" as const,
            targetFieldId,
            source: validation.rule.trim(),
            location: { scope: "character" as const },
          },
        ]
      : [];
  });
  const generatedFormulaIds = new Set([
    ...schemaComputedDefinitions.map((definition) => definition.id),
    ...validationDefinitions.map((definition) => definition.id),
    ...conditionSuggestDefinitions.map((definition) => definition.id),
  ]);
  const existingFormulaSource = isObject(baseSource.formulas)
    ? baseSource.formulas
    : {};
  const existingDefinitions = Array.isArray(existingFormulaSource.definitions)
    ? existingFormulaSource.definitions
    : [];
  const retainedDefinitions = existingDefinitions.filter((definition) => {
    if (!isFormulaDefinition(definition)) return true;
    if (generatedFormulaIds.has(definition.id)) return false;
    // 建議公式整批由 schema 重新產生：項目或 suggest 被移除後，舊產物不能留著。
    // 保留前綴下不是產物形狀的定義是手寫的：留給 validator 以明確訊息拒絕，不默默吞掉
    if (isGeneratedConditionDefinition(definition)) return false;
    return !(
      definition.kind === "derived" &&
      ((definition.location.scope === "character" &&
        computedFieldIds.has(definition.targetFieldId)) ||
        (definition.location.scope === "list-row" &&
          typeof definition.location.listFieldId === "string" &&
          listComputedKeys.has(
            `${definition.location.listFieldId}:${definition.targetFieldId}`,
          )))
    );
  });
  const computedDefinitions: FormulaSourceDefinition[] = computedFields
    .filter((field) => field.formula.trim().length > 0)
    .map((field) => ({
      id: `derived:${field.id}`,
      kind: "derived",
      targetFieldId: field.id,
      source: field.formula.trim(),
      location: { scope: "character" },
    }));
  const listComputedDefinitions: FormulaSourceDefinition[] = listComputedFields
    .filter(({ field }) => field.formula.trim().length > 0)
    .map(({ listFieldId, field }) => ({
      id: `derived:${listFieldId}:${field.id}`,
      kind: "derived",
      targetFieldId: field.id,
      source: field.formula.trim(),
      location: { scope: "list-row", listFieldId },
    }));

  return {
    ...baseSource,
    schema: schema as unknown as Json,
    template: template as unknown as Json,
    formulas: {
      ...existingFormulaSource,
      language: FORMULA_LANGUAGE,
      definitions: [
        ...retainedDefinitions,
        ...computedDefinitions,
        ...listComputedDefinitions,
        ...conditionSuggestDefinitions,
        ...schemaComputedDefinitions,
        ...validationDefinitions,
      ] as unknown as Json,
    },
  };
}
