import { compileFormula } from "./compiler";
import { evaluateFormula } from "./evaluator";
import type {
  FormulaEvaluationContext,
  FormulaEvaluationResult,
  FormulaValue,
  FormulaValueType,
} from "./types";

export interface FormulaSourceEvaluationInput {
  formulaId: string;
  source: string;
  resultType: FormulaValueType;
  character: Record<string, FormulaValue | undefined>;
  lookups?: FormulaEvaluationContext["lookups"];
}

function valueType(value: FormulaValue | undefined): FormulaValueType | null {
  if (typeof value === "number") return "number";
  if (typeof value === "string") return "string";
  if (typeof value === "boolean") return "boolean";
  return null;
}

/**
 * Transitional adapter for built-in game-data formulas that are not yet loaded
 * from an immutable Template Version. It intentionally delegates parsing,
 * typing and evaluation to the one shared formula engine.
 */
export function evaluateFormulaSource(
  input: FormulaSourceEvaluationInput,
): FormulaEvaluationResult {
  const targetFieldId = "__formula_result__";
  const character: Record<string, FormulaValueType> = {
    [targetFieldId]: input.resultType,
  };
  for (const [fieldId, value] of Object.entries(input.character)) {
    const type = valueType(value);
    if (type) character[fieldId] = type;
  }

  const lookups: Record<string, FormulaValueType> = {};
  for (const [lookupId, entries] of Object.entries(input.lookups ?? {})) {
    const type = valueType(entries[0]?.value);
    if (type) lookups[lookupId] = type;
  }

  const compiled = compileFormula(
    {
      id: input.formulaId,
      kind: "derived",
      targetFieldId,
      source: input.source,
      location: { scope: "character" },
    },
    { character, lookups },
  );
  if (!compiled.success) {
    const issue = compiled.issues[0];
    return {
      status: "error",
      error: {
        category: issue.category,
        formulaId: input.formulaId,
        message: issue.message,
      },
    };
  }

  return evaluateFormula(compiled.formula, {
    character: input.character,
    lookups: input.lookups,
  });
}
