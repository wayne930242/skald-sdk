import { FORMULA_LANGUAGE, type FormulaValueType } from "@skald/formula";
import type { Json } from "@skald/types";
import { isCoc7eFamilySlug } from "@skald/types/system";
import { buildTemplateDraftSource, type TemplateDraftSource } from "@skald/sheet-sdk/modules/templates/domain/formula-source";
import type { BuiltinLocalSystemData } from "@skald/sheet-sdk/modules/systems";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function lookupValueType(value: unknown): FormulaValueType | null {
  if (typeof value === "number") return "number";
  if (typeof value === "string") return "string";
  if (typeof value === "boolean") return "boolean";
  return null;
}

function buildLookupSources(
  lookupConfig: unknown,
): Record<string, Json> {
  if (!isObject(lookupConfig) || !isObject(lookupConfig.tables)) return {};
  const lookups: Record<string, Json> = {};
  for (const [lookupId, rawTable] of Object.entries(lookupConfig.tables)) {
    if (!isObject(rawTable) || !Array.isArray(rawTable.entries)) continue;
    const entries = rawTable.entries.flatMap((rawEntry) => {
      if (
        !isObject(rawEntry) ||
        typeof rawEntry.threshold !== "number" ||
        !Number.isFinite(rawEntry.threshold) ||
        lookupValueType(rawEntry.value) === null
      ) {
        return [];
      }
      return [{ threshold: rawEntry.threshold, value: rawEntry.value as Json }];
    });
    const valueType = lookupValueType(entries[0]?.value);
    if (!valueType || entries.some((entry) => lookupValueType(entry.value) !== valueType)) {
      continue;
    }
    lookups[lookupId] = {
      valueType,
      entries,
    } as Json;
  }
  return lookups;
}

/** Builds the exact source envelope consumed by validation and the importer. */
export function buildBuiltinTemplateSource(
  systemId: string,
  data: BuiltinLocalSystemData,
): TemplateDraftSource {
  return {
    ...buildSource(data, isCoc7eFamilySlug(systemId) ? { cthulhuMythos: "number" } : {}),
    // Absent unless the System's built-in template has macros of its own, so other sources keep their hash.
    ...(data.macros === undefined ? {} : { macros: data.macros as Json }),
  };
}

export function buildBuiltinOrganizationSource(
  data: NonNullable<BuiltinLocalSystemData["organization"]>,
): TemplateDraftSource {
  return {
    ...buildSource(data, {}),
    ...(data.macros === undefined ? {} : { macros: data.macros as Json }),
  };
}

function buildSource(
  data: BuiltinLocalSystemData,
  referenceTypes: Record<string, FormulaValueType>,
): TemplateDraftSource {
  const schema = {
    ...data.schema,
    $schema: "skald/schema/v1" as const,
  };
  const template = {
    ...data.template,
    $schema: "skald/template/v1" as const,
    schemaId: data.template.schemaId || data.schema.id,
    schemaVersion: data.template.schemaVersion || data.schema.version,
  };
  return buildTemplateDraftSource(
    {
      formulas: {
        language: FORMULA_LANGUAGE,
        definitions: [],
        referenceTypes,
        lookups: buildLookupSources(data.dsl?.lookupTables),
      },
      ...(data.fieldMigration === undefined
        ? {}
        : { fieldMigration: data.fieldMigration as Json }),
      // Absent unless the System defines one, so other sources keep their hash.
      ...(data.wizard === undefined ? {} : { wizard: data.wizard as Json }),
    },
    schema,
    template,
  );
}
