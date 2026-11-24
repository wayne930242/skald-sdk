import { FORMULA_COMPILER_VERSION, FORMULA_LANGUAGE } from "./policy";
import type {
  CompiledFormula,
  CompiledFormulaArtifact,
  FormulaDependencyGraph,
  FormulaLookupTables,
  FormulaValue,
} from "./types";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readLookups(value: unknown): FormulaLookupTables | null {
  if (!isObject(value)) return null;
  const lookups: FormulaLookupTables = {};
  for (const [lookupId, rawEntries] of Object.entries(value)) {
    if (!Array.isArray(rawEntries)) return null;
    const entries: FormulaLookupTables[string] = [];
    for (const rawEntry of rawEntries) {
      if (
        !isObject(rawEntry) ||
        typeof rawEntry.threshold !== "number" ||
        !Number.isFinite(rawEntry.threshold) ||
        !isFormulaValue(rawEntry.value)
      ) {
        return null;
      }
      entries.push({ threshold: rawEntry.threshold, value: rawEntry.value });
    }
    lookups[lookupId] = entries;
  }
  return lookups;
}

function isFormulaValue(value: unknown): value is FormulaValue {
  return (
    typeof value === "number" ||
    typeof value === "string" ||
    typeof value === "boolean"
  );
}

function isProgram(value: unknown): value is CompiledFormula {
  if (!isObject(value) || !isObject(value.location) || !isObject(value.expression)) {
    return false;
  }
  return (
    value.language === FORMULA_LANGUAGE &&
    value.compilerVersion === FORMULA_COMPILER_VERSION &&
    typeof value.formulaId === "string" &&
    typeof value.targetFieldId === "string" &&
    (value.kind === "derived" ||
      value.kind === "default" ||
      value.kind === "validation") &&
    (value.resultType === "number" ||
      value.resultType === "string" ||
      value.resultType === "boolean") &&
    Array.isArray(value.dependencies)
  );
}

function readGraph(value: unknown): FormulaDependencyGraph | null {
  if (!isObject(value) || !Array.isArray(value.order) || !isObject(value.dependencies)) {
    return null;
  }
  if (!value.order.every((formulaId) => typeof formulaId === "string")) {
    return null;
  }
  const dependencies: Record<string, string[]> = {};
  for (const [formulaId, rawDependencies] of Object.entries(value.dependencies)) {
    if (
      !Array.isArray(rawDependencies) ||
      !rawDependencies.every((dependency) => typeof dependency === "string")
    ) {
      return null;
    }
    dependencies[formulaId] = rawDependencies;
  }
  return { order: value.order as string[], dependencies };
}

export function readCompiledFormulaArtifact(
  value: unknown,
): CompiledFormulaArtifact | null {
  if (
    !isObject(value) ||
    value.language !== FORMULA_LANGUAGE ||
    value.compilerVersion !== FORMULA_COMPILER_VERSION ||
    !Array.isArray(value.programs) ||
    !value.programs.every(isProgram)
  ) {
    return null;
  }
  const graph = readGraph(value.graph);
  if (!graph) return null;
  const lookups = value.lookups === undefined ? undefined : readLookups(value.lookups);
  if (value.lookups !== undefined && !lookups) return null;
  return {
    language: FORMULA_LANGUAGE,
    compilerVersion: FORMULA_COMPILER_VERSION,
    programs: value.programs,
    graph,
    ...(lookups ? { lookups } : {}),
  };
}

export function readDerivedOverrides(value: unknown): Record<string, FormulaValue> {
  if (!isObject(value)) return {};
  const overrides: Record<string, FormulaValue> = {};
  for (const [fieldId, override] of Object.entries(value)) {
    if (isFormulaValue(override)) overrides[fieldId] = override;
  }
  return overrides;
}
