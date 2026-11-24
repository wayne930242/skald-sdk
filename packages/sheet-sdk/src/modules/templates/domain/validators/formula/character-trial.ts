import { evaluateFormulaLifecycle, type CompiledFormula, type FormulaDependencyGraph, type FormulaLifecycleResult, type FormulaLookupTables, type FormulaValue } from "@skald/formula";
import { buildCharacterFormulaValues, buildListRowDerivedOverrideKey, withInputDefaults, type TemplateArtifactCharacterState, type TemplateValidationIssue } from "@skald/sheet-sdk/modules/sheet-schema";
import { CONDITION_FORMULA_ID_PREFIX } from "@skald/sheet-sdk/modules/character/conditions";
import { formulaIssue, isObject } from "./issues";

export function isFormulaValue(value: unknown): value is FormulaValue {
  return (
    typeof value === "number" ||
    typeof value === "string" ||
    typeof value === "boolean"
  );
}

export function evaluateValidatedCharacterFormulas(
  programs: CompiledFormula[],
  graph: FormulaDependencyGraph,
  character: TemplateArtifactCharacterState,
  lookups?: FormulaLookupTables,
  inputDefaults?: Readonly<Record<string, unknown>>,
): FormulaLifecycleResult {
  const values = buildCharacterFormulaValues(withInputDefaults(character.data, inputDefaults));
  const characterPrograms = programs.filter(
    (program) => program.location.scope === "character",
  );
  const characterFormulaIds = new Set(
    characterPrograms.map((program) => program.formulaId),
  );
  return evaluateFormulaLifecycle(
    characterPrograms,
    {
      order: graph.order.filter((formulaId) => characterFormulaIds.has(formulaId)),
      dependencies: graph.dependencies,
    },
    { character: values, lookups },
    character.derivedOverrides,
    "validate"
  );
}

interface TrialInputDefaults {
  character: Readonly<Record<string, unknown>>;
  rows: ReadonlyMap<string, Readonly<Record<string, unknown>>>;
}

export function validateCharacterFormulas(
  programs: CompiledFormula[],
  graph: FormulaDependencyGraph,
  character: TemplateArtifactCharacterState,
  lookups: FormulaLookupTables,
  defaults: TrialInputDefaults,
): TemplateValidationIssue[] {
  const evaluated = evaluateValidatedCharacterFormulas(
    programs,
    graph,
    character,
    lookups,
    defaults.character,
  );
  const issues = evaluated.issues.map((issue) => {
    const mapped = formulaIssue(issue.category, issue.message, [
      "formulas",
      issue.formulaId,
    ]);
    // 建議公式只是提示：某隻角色算不出來不該擋住整個範本重新發布
    return issue.formulaId.startsWith(CONDITION_FORMULA_ID_PREFIX)
      ? { ...mapped, severity: "warning" as const }
      : mapped;
  });

  const rowProgramsByList = new Map<string, CompiledFormula[]>();
  for (const program of programs) {
    if (program.location.scope !== "list-row" || !program.location.listFieldId) {
      continue;
    }
    const existing = rowProgramsByList.get(program.location.listFieldId) ?? [];
    existing.push(program);
    rowProgramsByList.set(program.location.listFieldId, existing);
  }

  for (const [listFieldId, rowPrograms] of rowProgramsByList) {
    const rawEntries = character.data[listFieldId];
    if (!Array.isArray(rawEntries)) continue;
    const rowFormulaIds = new Set(rowPrograms.map((program) => program.formulaId));
    const rowDefaults = defaults.rows.get(listFieldId);
    for (const [entryIndex, rawEntry] of rawEntries.entries()) {
      if (!isObject(rawEntry)) continue;
      const row: Record<string, FormulaValue | undefined> = {};
      for (const [fieldId, value] of Object.entries(withInputDefaults(rawEntry, rowDefaults))) {
        if (isFormulaValue(value)) row[fieldId] = value;
      }
      const entryId =
        typeof rawEntry.id === "string" ? rawEntry.id : String(entryIndex);
      const rowOverrides: Record<string, FormulaValue> = {};
      for (const program of rowPrograms) {
        const value =
          character.derivedOverrides[
            buildListRowDerivedOverrideKey(
              listFieldId,
              entryId,
              program.targetFieldId,
            )
          ];
        if (isFormulaValue(value)) rowOverrides[program.targetFieldId] = value;
      }
      const rowResult = evaluateFormulaLifecycle(
        rowPrograms,
        {
          order: graph.order.filter((formulaId) => rowFormulaIds.has(formulaId)),
          dependencies: graph.dependencies,
        },
        {
          character: evaluated.context.character,
          row,
          lookups,
        },
        rowOverrides,
        "validate",
      );
      issues.push(
        ...rowResult.issues.map((issue) =>
          formulaIssue(issue.category, issue.message, [
            "formulas",
            listFieldId,
            entryId,
            issue.formulaId,
          ]),
        ),
      );
    }
  }

  return issues;
}
