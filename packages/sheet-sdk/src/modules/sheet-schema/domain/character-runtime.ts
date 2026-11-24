import {
  evaluateFormula,
  evaluateFormulaLifecycle,
  readCompiledFormulaArtifact,
  readDerivedOverrides,
  type CompiledFormulaArtifact,
  type FormulaLifecyclePhase,
  type FormulaEvaluationContext,
  type FormulaLifecycleResult,
  type FormulaValue,
} from "@skald/formula";
import type { CompiledTemplateCssArtifact } from "@skald/types/schema";
import { readCompiledTemplateCssArtifact } from "./compiled-template-css-artifact";
import { withInputDefaults } from "./input-defaults";

export interface CharacterFormulaRuntime {
  templateVersionId: string;
  artifact: CompiledFormulaArtifact;
  derivedOverrides: Record<string, FormulaValue>;
  styleArtifact?: CompiledTemplateCssArtifact;
  /**
   * The schema's character input defaults (`withSchemaInputDefaults`): an input absent from the
   * data reads its default, so a character saved before the field existed still computes.
   */
  inputDefaults?: Record<string, unknown>;
}

export function buildListRowDerivedOverrideKey(
  listFieldId: string,
  entryId: string,
  fieldId: string,
): string {
  return `list:${listFieldId}:${entryId}:${fieldId}`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFormulaValue(value: unknown): value is FormulaValue {
  return (
    typeof value === "number" ||
    typeof value === "string" ||
    typeof value === "boolean"
  );
}

export function readCharacterFormulaRuntime(
  value: unknown,
): CharacterFormulaRuntime | null {
  if (
    !isObject(value) ||
    typeof value.templateVersionId !== "string" ||
    !isObject(value.compiledArtifact)
  ) {
    return null;
  }
  const artifact = readCompiledFormulaArtifact(value.compiledArtifact.formulas);
  if (!artifact) return null;
  const styleArtifact = readCompiledTemplateCssArtifact(
    value.compiledArtifact.styles,
  );
  return {
    templateVersionId: value.templateVersionId,
    artifact,
    derivedOverrides: readDerivedOverrides(value.derivedOverrides),
    ...(styleArtifact ? { styleArtifact } : {}),
  };
}

export function buildCharacterFormulaValues(
  data: Record<string, unknown>,
): Record<string, FormulaValue | undefined> {
  const values: Record<string, FormulaValue | undefined> = {};
  for (const [fieldId, value] of Object.entries(data)) {
    if (
      typeof value === "number" ||
      typeof value === "string" ||
      typeof value === "boolean"
    ) {
      values[fieldId] = value;
      continue;
    }
    if (isObject(value)) {
      if (isFormulaValue(value.value)) values[fieldId] = value.value;
      for (const nestedFieldId of ["current", "max", "start"] as const) {
        const nestedValue = value[nestedFieldId];
        if (isFormulaValue(nestedValue)) {
          values[`${fieldId}_${nestedFieldId}`] = nestedValue;
        }
      }
    }
  }

  const skills = data.skills;
  if (Array.isArray(skills)) {
    const mythos = skills.find((skill) => {
      if (!isObject(skill)) return false;
      return skill.id === "cthulhu_mythos" || skill.id === "cthulhuMythos";
    });
    if (isObject(mythos) && typeof mythos.value === "number") {
      values.cthulhuMythos = mythos.value;
    }
  }
  // Legacy characters may omit untouched skills; Mythos starts at zero.
  values.cthulhuMythos ??= 0;
  return values;
}

export function evaluateCharacterFormulaRuntime(
  runtime: CharacterFormulaRuntime,
  data: Record<string, unknown>,
  phase: FormulaLifecyclePhase = "runtime",
): FormulaLifecycleResult {
  const characterPrograms = runtime.artifact.programs.filter(
    (program) => program.location.scope === "character",
  );
  return evaluateFormulaLifecycle(
    characterPrograms,
    runtime.artifact.graph,
    {
      character: buildCharacterFormulaValues(withInputDefaults(data, runtime.inputDefaults)),
      lookups: runtime.artifact.lookups,
    },
    runtime.derivedOverrides,
    phase,
  );
}

/**
 * 目前角色值下所有角色層「預設」公式的結果（例如 SAN 的 `san_start` = POW）。
 *
 * 預設公式只在建立角色時（initialize）填入尚未設定的欄位，所以 `derivedValues`
 * 不含它。需要「現在的預設值是多少」的讀取端（例如 `resource.follow` 的起始值）用這個；
 * 算不出來（執行期版本不符、公式錯誤）的公式不出現在結果裡，不補 0。
 */
export function evaluateCharacterDefaultFormulas(
  runtime: CharacterFormulaRuntime,
  context: FormulaEvaluationContext,
): Record<string, FormulaValue> {
  const defaults: Record<string, FormulaValue> = {};
  for (const program of runtime.artifact.programs) {
    if (program.kind !== "default" || program.location.scope !== "character") {
      continue;
    }
    const result = evaluateFormula(program, context);
    if (result.status === "value") defaults[program.targetFieldId] = result.value;
  }
  return defaults;
}
