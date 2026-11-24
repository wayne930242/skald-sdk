import { evaluateFormula } from "./evaluator";
import type {
  CompiledFormula,
  FormulaDependencyGraph,
  FormulaEvaluationContext,
  FormulaLifecycleIssue,
  FormulaLifecyclePhase,
  FormulaLifecycleResult,
  FormulaValue,
} from "./types";

function isFormulaValue(value: unknown): value is FormulaValue {
  return (
    typeof value === "number" ||
    typeof value === "string" ||
    typeof value === "boolean"
  );
}

function targetValues(
  formula: CompiledFormula,
  context: FormulaEvaluationContext
): Record<string, FormulaValue | undefined> {
  if (formula.location.scope === "list-row") {
    context.row ??= {};
    return context.row;
  }
  return context.character;
}

export function evaluateFormulaLifecycle(
  formulas: CompiledFormula[],
  graph: FormulaDependencyGraph,
  inputContext: FormulaEvaluationContext,
  derivedOverrides: Record<string, unknown> = {},
  phase: FormulaLifecyclePhase = "runtime"
): FormulaLifecycleResult {
  const context: FormulaEvaluationContext = {
    ...inputContext,
    character: { ...inputContext.character },
    row: inputContext.row ? { ...inputContext.row } : undefined,
  };
  const issues: FormulaLifecycleIssue[] = [];
  const defaultValues: Record<string, FormulaValue> = {};
  const derivedValues: Record<string, FormulaValue> = {};
  const formulaById = new Map(formulas.map((formula) => [formula.formulaId, formula]));
  const derivedByTarget = new Map(
    formulas
      .filter((formula) => formula.kind === "derived")
      .map((formula) => [formula.targetFieldId, formula])
  );

  for (const [fieldId, override] of Object.entries(derivedOverrides)) {
    const formula = derivedByTarget.get(fieldId);
    if (!formula || !isFormulaValue(override) || typeof override !== formula.resultType) {
      issues.push({
        category: "override_incompatible",
        formulaId: formula?.formulaId ?? "derived-overrides",
        targetFieldId: fieldId,
        message: `Derived override ${fieldId} is not compatible with the formula set.`,
      });
    }
  }

  for (const formulaId of graph.order) {
    const formula = formulaById.get(formulaId);
    if (!formula) continue;
    const values = targetValues(formula, context);

    if (formula.kind === "default") {
      if (
        phase !== "initialize" ||
        (Object.hasOwn(values, formula.targetFieldId) &&
          values[formula.targetFieldId] !== undefined)
      ) {
        continue;
      }
    }

    const override = derivedOverrides[formula.targetFieldId];
    if (formula.kind === "derived" && isFormulaValue(override)) {
      if (typeof override === formula.resultType) {
        values[formula.targetFieldId] = override;
        derivedValues[formula.targetFieldId] = override;
      }
      continue;
    }

    const result = evaluateFormula(formula, context);
    if (result.status === "error") {
      issues.push({
        category: result.error.category,
        formulaId,
        targetFieldId: formula.targetFieldId,
        message: result.error.message,
      });
      continue;
    }
    if (formula.kind === "validation") {
      if (result.value !== true) {
        issues.push({
          category: "validation_failed",
          formulaId,
          targetFieldId: formula.targetFieldId,
          message: `Validation formula ${formulaId} returned false.`,
        });
      }
      continue;
    }

    values[formula.targetFieldId] = result.value;
    if (formula.kind === "default") {
      defaultValues[formula.targetFieldId] = result.value;
    } else {
      derivedValues[formula.targetFieldId] = result.value;
    }
  }

  return {
    status: issues.length > 0 ? "error" : "value",
    context,
    defaultValues,
    derivedValues,
    issues,
  };
}
