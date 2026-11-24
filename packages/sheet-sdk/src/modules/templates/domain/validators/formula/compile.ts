import { compileFormulaSet, FORMULA_COMPILER_VERSION, FORMULA_LANGUAGE, type FormulaKind, type FormulaLookupTables, type FormulaLocation, type FormulaSourceDefinition, type FormulaValueType } from "@skald/formula";
import { fieldsRecordSchema, FORMULA_VALUE_TYPES as valueTypes, inputDefaultsOf, listRowTemplateSchema, withSchemaInputDefaults, type JsonObject, type TemplateArtifactValidationResult, type TemplateArtifactValidator, type TemplateValidationIssue } from "@skald/sheet-sdk/modules/sheet-schema";
import type { Json } from "@skald/types";
import { isObject, formulaIssue } from "./issues";
import { isFormulaValue, validateCharacterFormulas } from "./character-trial";
import { conditionStructuralIssues, buildFormulaReferenceCatalog } from "./reference";

const formulaKinds = new Set<FormulaKind>([
  "derived",
  "default",
  "validation",
]);

function readLookupTables(source: JsonObject):
  | { success: true; lookups: FormulaLookupTables }
  | { success: false; issues: TemplateValidationIssue[] } {
  const formulaSource = isObject(source.formulas) ? source.formulas : {};
  const rawLookups = isObject(formulaSource.lookups) ? formulaSource.lookups : {};
  const lookups: FormulaLookupTables = {};
  const issues: TemplateValidationIssue[] = [];

  for (const [lookupId, rawLookup] of Object.entries(rawLookups)) {
    if (typeof rawLookup === "string") continue;
    const path = ["formulas", "lookups", lookupId];
    if (
      !isObject(rawLookup) ||
      typeof rawLookup.valueType !== "string" ||
      !valueTypes.has(rawLookup.valueType as FormulaValueType) ||
      !Array.isArray(rawLookup.entries)
    ) {
      issues.push(
        formulaIssue(
          "schema_invalid",
          "Lookup requires valueType and entries.",
          path,
        ),
      );
      continue;
    }
    const entries: FormulaLookupTables[string] = [];
    for (const [index, rawEntry] of rawLookup.entries.entries()) {
      if (
        !isObject(rawEntry) ||
        typeof rawEntry.threshold !== "number" ||
        !Number.isFinite(rawEntry.threshold) ||
        !isFormulaValue(rawEntry.value) ||
        typeof rawEntry.value !== rawLookup.valueType
      ) {
        issues.push(
          formulaIssue(
            "schema_invalid",
            "Lookup entry threshold and value must match its declared type.",
            [...path, "entries", String(index)],
          ),
        );
        continue;
      }
      entries.push({ threshold: rawEntry.threshold, value: rawEntry.value });
    }
    lookups[lookupId] = entries;
  }
  return issues.length > 0
    ? { success: false, issues }
    : { success: true, lookups };
}

function readLocation(raw: JsonObject): FormulaLocation | null {
  if (raw.scope === "character") return { scope: "character" };
  if (raw.scope === "list-row" && typeof raw.listFieldId === "string") {
    return { scope: "list-row", listFieldId: raw.listFieldId };
  }
  return null;
}

function readDefinitions(source: JsonObject):
  | { success: true; definitions: FormulaSourceDefinition[] }
  | { success: false; issues: TemplateValidationIssue[] } {
  const formulas = source.formulas;
  if (formulas === undefined) return { success: true, definitions: [] };
  if (!isObject(formulas)) {
    return {
      success: false,
      issues: [
        formulaIssue("schema_invalid", "formulas must be an object.", [
          "formulas",
        ]),
      ],
    };
  }
  if (formulas.language !== FORMULA_LANGUAGE) {
    return {
      success: false,
      issues: [
        formulaIssue(
          "runtime_version",
          `Formula language must be ${FORMULA_LANGUAGE}.`,
          ["formulas", "language"]
        ),
      ],
    };
  }
  if (!Array.isArray(formulas.definitions)) {
    return {
      success: false,
      issues: [
        formulaIssue(
          "schema_invalid",
          "Formula definitions must be an array.",
          ["formulas", "definitions"]
        ),
      ],
    };
  }

  const definitions: FormulaSourceDefinition[] = [];
  const issues: TemplateValidationIssue[] = [];
  formulas.definitions.forEach((rawDefinition, index) => {
    const path = ["formulas", "definitions", String(index)];
    if (!isObject(rawDefinition)) {
      issues.push(
        formulaIssue("schema_invalid", "Formula must be an object.", path)
      );
      return;
    }
    const location = isObject(rawDefinition.location)
      ? readLocation(rawDefinition.location)
      : null;
    if (
      typeof rawDefinition.id !== "string" ||
      typeof rawDefinition.targetFieldId !== "string" ||
      typeof rawDefinition.source !== "string" ||
      typeof rawDefinition.kind !== "string" ||
      !formulaKinds.has(rawDefinition.kind as FormulaKind) ||
      !location
    ) {
      issues.push(
        formulaIssue(
          "schema_invalid",
          "Formula requires id, kind, targetFieldId, source, and a valid location.",
          path
        )
      );
      return;
    }
    definitions.push({
      id: rawDefinition.id,
      kind: rawDefinition.kind as FormulaKind,
      targetFieldId: rawDefinition.targetFieldId,
      source: rawDefinition.source,
      location,
    });
  });
  return issues.length > 0
    ? { success: false, issues }
    : { success: true, definitions };
}

export class FormulaArtifactValidator implements TemplateArtifactValidator {
  validate(source: JsonObject): TemplateArtifactValidationResult {
    const parsed = readDefinitions(source);
    const structural = conditionStructuralIssues(
      source,
      parsed.success ? parsed.definitions : [],
    );
    if (structural.length > 0) return { issues: structural };
    if (!parsed.success) return { issues: parsed.issues };
    if (source.formulas === undefined) return { issues: [] };
    const parsedLookups = readLookupTables(source);
    if (!parsedLookups.success) return { issues: parsedLookups.issues };

    const compiled = compileFormulaSet(parsed.definitions, buildFormulaReferenceCatalog(source));
    if (!compiled.success) {
      return {
        issues: compiled.issues.map((issue) =>
          formulaIssue(issue.category, issue.message, ["formulas", issue.formulaId], {
            start: issue.start,
            end: issue.end,
            ...(issue.cycle ? { cycle: issue.cycle } : {}),
          })
        ),
      };
    }
    const schema = isObject(source.schema) ? source.schema : {};
    const parsedFields = fieldsRecordSchema.safeParse(schema.fields);
    const fields = parsedFields.success ? parsedFields.data : {};
    const { inputDefaults } = withSchemaInputDefaults(
      { artifact: { programs: compiled.formulas } },
      { fields },
    );
    const rowDefaults = new Map<string, Record<string, unknown>>();
    for (const [fieldId, field] of Object.entries(fields)) {
      if (field.type !== "list") continue;
      const row = listRowTemplateSchema.safeParse(field.rowTemplate);
      if (row.success) rowDefaults.set(fieldId, inputDefaultsOf(row.data.children));
    }
    return {
      issues: [],
      compiledArtifact: {
        formulas: {
          language: FORMULA_LANGUAGE,
          compilerVersion: FORMULA_COMPILER_VERSION,
          programs: compiled.formulas as unknown as Json,
          graph: compiled.graph as unknown as Json,
          lookups: parsedLookups.lookups as unknown as Json,
        },
      },
      compilerVersions: { formula: FORMULA_COMPILER_VERSION },
      validateCharacter: (character) =>
        validateCharacterFormulas(
          compiled.formulas,
          compiled.graph,
          character,
          parsedLookups.lookups,
          { character: inputDefaults, rows: rowDefaults },
        ).map((issue) => {
          // Failed advisory rules remain warnings; evaluation failures still block Publish.
          if (issue.code !== "validation_failed" || issue.path.length !== 2) return issue;
          const validations = Array.isArray(schema.validations) ? schema.validations : [];
          const rule = validations.find((entry) =>
            isObject(entry) && `validation:schema:${entry.id}` === issue.path[1],
          );
          return isObject(rule) && rule.severity === "warning"
            ? { ...issue, severity: "warning" as const }
            : issue;
        }),
    };
  }
}
