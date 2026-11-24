import type {
  FormulaFunction,
  FormulaOperator,
} from "./policy";
import type {
  FORMULA_COMPILER_VERSION,
  FORMULA_LANGUAGE,
} from "./policy";

export type FormulaKind = "derived" | "default" | "validation";
export type FormulaValue = number | string | boolean;
export type FormulaValueType = "number" | "string" | "boolean";
export type FormulaReferenceScope = "character" | "row" | "list";

export interface FormulaLocation {
  scope: "character" | "list-row";
  listFieldId?: string;
}

export interface FormulaSourceDefinition {
  id: string;
  kind: FormulaKind;
  targetFieldId: string;
  source: string;
  location: FormulaLocation;
}

export interface FormulaDependency {
  scope: FormulaReferenceScope;
  fieldId: string;
  listFieldId?: string;
}

interface FormulaExpressionBase {
  valueType: FormulaValueType;
}

export type FormulaExpression =
  | (FormulaExpressionBase & {
      op: "literal";
      value: FormulaValue;
    })
  | (FormulaExpressionBase & {
      op: "reference";
      reference: FormulaDependency;
    })
  | (FormulaExpressionBase & {
      op: "negate";
      operand: FormulaExpression;
    })
  | (FormulaExpressionBase & {
      op: "binary";
      operator: FormulaOperator;
      left: FormulaExpression;
      right: FormulaExpression;
    })
  | (FormulaExpressionBase & {
      op: "call";
      function: FormulaFunction;
      arguments: FormulaExpression[];
    });

/**
 * A compiled expression without a write target: same language, IR and
 * evaluator as a Template Formula, for callers that own the result themselves
 * (for example Character Creation Wizard conditions and point pools).
 */
export interface CompiledFormulaExpression {
  language: typeof FORMULA_LANGUAGE;
  compilerVersion: typeof FORMULA_COMPILER_VERSION;
  formulaId: string;
  resultType: FormulaValueType;
  dependencies: FormulaDependency[];
  expression: FormulaExpression;
}

export interface CompiledFormula extends CompiledFormulaExpression {
  kind: FormulaKind;
  targetFieldId: string;
  location: FormulaLocation;
}

export type FormulaErrorCategory =
  | "source_too_long"
  | "syntax_error"
  | "ast_too_deep"
  | "function_not_allowed"
  | "argument_count"
  | "reference_not_found"
  | "reference_ambiguous"
  | "reference_scope"
  | "type_mismatch"
  | "cycle"
  | "divide_by_zero"
  | "lookup_not_found"
  | "runtime_version"
  | "evaluation_error"
  | "output_type"
  | "override_incompatible"
  | "validation_failed";

export interface FormulaIssue {
  category: FormulaErrorCategory;
  formulaId: string;
  message: string;
  start: number;
  end: number;
  reference?: FormulaDependency;
  cycle?: string[];
}

export type FormulaCompileResult =
  | { success: true; formula: CompiledFormula }
  | { success: false; issues: FormulaIssue[] };

export type FormulaExpressionCompileResult =
  | { success: true; formula: CompiledFormulaExpression }
  | { success: false; issues: FormulaIssue[] };

export type FormulaEvaluationResult =
  | { status: "value"; value: FormulaValue }
  | {
      status: "error";
      error: {
        category: FormulaErrorCategory;
        formulaId: string;
        message: string;
      };
    };

export interface FormulaDependencyGraph {
  order: string[];
  dependencies: Record<string, string[]>;
}

export interface CompiledFormulaArtifact {
  language: typeof FORMULA_LANGUAGE;
  compilerVersion: typeof FORMULA_COMPILER_VERSION;
  programs: CompiledFormula[];
  graph: FormulaDependencyGraph;
  lookups?: FormulaLookupTables;
}

export type FormulaLookupTables = Record<
  string,
  Array<{ threshold: number; value: FormulaValue }>
>;

export interface FormulaReferenceCatalog {
  character: Record<string, FormulaValueType>;
  rows?: Record<string, Record<string, FormulaValueType>>;
  lists?: Record<string, Record<string, FormulaValueType>>;
  lookups?: Record<string, FormulaValueType>;
}

export interface FormulaEvaluationContext {
  character: Record<string, FormulaValue | undefined>;
  row?: Record<string, FormulaValue | undefined>;
  lists?: Record<string, Array<Record<string, FormulaValue | undefined>>>;
  lookups?: FormulaLookupTables;
}

export type FormulaSetCompileResult =
  | {
      success: true;
      formulas: CompiledFormula[];
      graph: FormulaDependencyGraph;
    }
  | { success: false; issues: FormulaIssue[] };

export type FormulaLifecyclePhase = "initialize" | "runtime" | "validate";

export interface FormulaLifecycleIssue {
  category: FormulaErrorCategory;
  formulaId: string;
  targetFieldId: string;
  message: string;
}

export interface FormulaLifecycleResult {
  status: "value" | "error";
  context: FormulaEvaluationContext;
  defaultValues: Record<string, FormulaValue>;
  derivedValues: Record<string, FormulaValue>;
  issues: FormulaLifecycleIssue[];
}
