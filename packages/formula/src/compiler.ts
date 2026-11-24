import {
  FORMULA_COMPILER_VERSION,
  FORMULA_FUNCTIONS,
  FORMULA_LANGUAGE,
  FORMULA_LIMITS,
  FORMULA_OPERATORS,
} from "./policy";
import { parseFormula, type FormulaSyntaxNode } from "./parser";
import type {
  CompiledFormula,
  FormulaCompileResult,
  FormulaDependency,
  FormulaExpression,
  FormulaExpressionCompileResult,
  FormulaIssue,
  FormulaLocation,
  FormulaReferenceCatalog,
  FormulaSetCompileResult,
  FormulaSourceDefinition,
  FormulaValueType,
} from "./types";

const allowedFunctions = new Set<string>(FORMULA_FUNCTIONS);
const fieldIdPattern = /^[A-Za-z0-9_-]+$/;

interface CompiledNode {
  expression: FormulaExpression;
  start: number;
  end: number;
}

function dependencyKey(dependency: FormulaDependency, listFieldId?: string): string {
  if (dependency.scope === "character") return `character:${dependency.fieldId}`;
  if (dependency.scope === "row") {
    return `row:${listFieldId ?? ""}:${dependency.fieldId}`;
  }
  return `list:${dependency.listFieldId ?? ""}:${dependency.fieldId}`;
}

function targetKey(definition: FormulaSourceDefinition): string {
  return definition.location.scope === "character"
    ? `character:${definition.targetFieldId}`
    : `row:${definition.location.listFieldId ?? ""}:${definition.targetFieldId}`;
}

class FormulaCompiler {
  readonly issues: FormulaIssue[] = [];
  readonly dependencies: FormulaDependency[] = [];

  constructor(
    private readonly definition: FormulaSourceDefinition,
    private readonly catalog: FormulaReferenceCatalog
  ) {}

  compile(node: FormulaSyntaxNode): FormulaExpression | null {
    const compiled = this.compileNode(node, 1);
    return compiled?.expression ?? null;
  }

  private issue(
    category: FormulaIssue["category"],
    message: string,
    node: Pick<FormulaSyntaxNode, "start" | "end">,
    extra: Partial<FormulaIssue> = {}
  ): void {
    this.issues.push({
      category,
      formulaId: this.definition.id,
      message,
      start: node.start,
      end: node.end,
      ...extra,
    });
  }

  private compileNode(node: FormulaSyntaxNode, depth: number): CompiledNode | null {
    if (depth > FORMULA_LIMITS.maxAstDepth) {
      this.issue(
        "ast_too_deep",
        `Formula exceeds AST depth ${FORMULA_LIMITS.maxAstDepth}.`,
        node
      );
      return null;
    }

    if (node.type === "literal") {
      return {
        expression: {
          op: "literal",
          value: node.value,
          valueType: typeof node.value as FormulaValueType,
        },
        start: node.start,
        end: node.end,
      };
    }
    if (node.type === "reference") return this.compileReference(node);
    if (node.type === "unary") {
      const operand = this.compileNode(node.operand, depth + 1);
      if (!operand) return null;
      if (operand.expression.valueType !== "number") {
        this.issue("type_mismatch", "Unary - requires a number.", node);
        return null;
      }
      return {
        expression: {
          op: "negate",
          operand: operand.expression,
          valueType: "number",
        },
        start: node.start,
        end: node.end,
      };
    }
    if (node.type === "binary") return this.compileBinary(node, depth);
    return this.compileCall(node, depth);
  }

  private compileReference(
    node: Extract<FormulaSyntaxNode, { type: "reference" }>
  ): CompiledNode | null {
    const raw = node.value;
    let dependency: FormulaDependency;
    let valueType: FormulaValueType | undefined;

    if (raw.startsWith("@")) {
      const fieldId = raw.slice(1);
      if (!fieldIdPattern.test(fieldId)) {
        this.issue("syntax_error", "Invalid row field reference.", node);
        return null;
      }
      const listFieldId = this.definition.location.listFieldId;
      if (this.definition.location.scope !== "list-row" || !listFieldId) {
        this.issue("reference_scope", "Row reference is only valid in a List Row formula.", node);
        return null;
      }
      dependency = { scope: "row", fieldId };
      valueType = ownGet(ownGet(this.catalog.rows, listFieldId), fieldId);
    } else if (raw.startsWith("Character.")) {
      const fieldId = raw.slice("Character.".length);
      dependency = { scope: "character", fieldId };
      valueType = fieldIdPattern.test(fieldId)
        ? ownGet(this.catalog.character, fieldId)
        : undefined;
    } else if (raw.startsWith("List.")) {
      const [, listFieldId, fieldId, ...extra] = raw.split(".");
      if (
        extra.length > 0 ||
        !fieldIdPattern.test(listFieldId ?? "") ||
        !fieldIdPattern.test(fieldId ?? "")
      ) {
        this.issue("syntax_error", "Invalid List aggregate reference.", node);
        return null;
      }
      dependency = { scope: "list", listFieldId, fieldId };
      valueType = ownGet(ownGet(this.catalog.lists, listFieldId), fieldId);
      if (valueType) {
        this.issue(
          "reference_scope",
          "List aggregate references require the V1 List Row runtime.",
          node,
          { reference: dependency }
        );
        return null;
      }
    } else {
      dependency = { scope: "character", fieldId: raw };
      valueType = fieldIdPattern.test(raw)
        ? ownGet(this.catalog.character, raw)
        : undefined;
    }

    if (!valueType) {
      this.issue("reference_not_found", `Unknown field reference [${raw}].`, node, {
        reference: dependency,
      });
      return null;
    }
    if (!this.dependencies.some((item) => dependencyKey(item) === dependencyKey(dependency))) {
      this.dependencies.push(dependency);
    }
    return {
      expression: { op: "reference", reference: dependency, valueType },
      start: node.start,
      end: node.end,
    };
  }

  private compileBinary(
    node: Extract<FormulaSyntaxNode, { type: "binary" }>,
    depth: number
  ): CompiledNode | null {
    const left = this.compileNode(node.left, depth + 1);
    const right = this.compileNode(node.right, depth + 1);
    if (!left || !right) return null;
    if (!FORMULA_OPERATORS.includes(node.operator as (typeof FORMULA_OPERATORS)[number])) {
      this.issue("syntax_error", `Operator ${node.operator} is not supported.`, node);
      return null;
    }

    let valueType: FormulaValueType;
    if (["+", "-", "*", "/"].includes(node.operator)) {
      if (left.expression.valueType !== "number" || right.expression.valueType !== "number") {
        this.issue("type_mismatch", `${node.operator} requires two numbers.`, node);
        return null;
      }
      if (
        node.operator === "/" &&
        right.expression.op === "literal" &&
        right.expression.value === 0
      ) {
        this.issue("divide_by_zero", "Formula divides by zero.", node.right);
        return null;
      }
      valueType = "number";
    } else {
      if (left.expression.valueType !== right.expression.valueType) {
        this.issue("type_mismatch", "Comparison operands must have the same type.", node);
        return null;
      }
      if (
        !["=", "<>"].includes(node.operator) &&
        left.expression.valueType !== "number"
      ) {
        this.issue("type_mismatch", `${node.operator} only compares numbers.`, node);
        return null;
      }
      valueType = "boolean";
    }

    return {
      expression: {
        op: "binary",
        operator: node.operator as (typeof FORMULA_OPERATORS)[number],
        left: left.expression,
        right: right.expression,
        valueType,
      },
      start: node.start,
      end: node.end,
    };
  }

  private compileCall(
    node: Extract<FormulaSyntaxNode, { type: "call" }>,
    depth: number
  ): CompiledNode | null {
    const args = node.arguments.map((argument) =>
      this.compileNode(argument, depth + 1)
    );
    if (!allowedFunctions.has(node.name)) {
      this.issue("function_not_allowed", `Function ${node.name} is not allowed.`, node);
      return null;
    }
    if (args.some((argument) => !argument)) return null;
    const expressions = args.map((argument) => argument!.expression);
    const resultType = this.validateCall(node, expressions);
    if (!resultType) return null;
    return {
      expression: {
        op: "call",
        function: node.name as (typeof FORMULA_FUNCTIONS)[number],
        arguments: expressions,
        valueType: resultType,
      },
      start: node.start,
      end: node.end,
    };
  }

  private validateCall(
    node: Extract<FormulaSyntaxNode, { type: "call" }>,
    args: FormulaExpression[]
  ): FormulaValueType | null {
    const requireCount = (minimum: number, maximum = minimum): boolean => {
      if (args.length >= minimum && args.length <= maximum) return true;
      this.issue(
        "argument_count",
        `${node.name} requires ${minimum === maximum ? minimum : `${minimum}-${maximum}`} arguments.`,
        node
      );
      return false;
    };
    const requireTypes = (types: FormulaValueType[]): boolean => {
      const mismatch = args.findIndex(
        (argument, index) => argument.valueType !== types[index]
      );
      if (mismatch < 0) return true;
      this.issue(
        "type_mismatch",
        `${node.name} argument ${mismatch + 1} must be ${types[mismatch]}.`,
        node.arguments[mismatch]
      );
      return false;
    };
    const requireAll = (type: FormulaValueType): boolean => {
      const mismatch = args.findIndex((argument) => argument.valueType !== type);
      if (mismatch < 0) return true;
      this.issue(
        "type_mismatch",
        `${node.name} argument ${mismatch + 1} must be ${type}.`,
        node.arguments[mismatch]
      );
      return false;
    };

    switch (node.name) {
      case "IF":
        if (!requireCount(3)) return null;
        if (args[0].valueType !== "boolean") {
          this.issue("type_mismatch", "IF condition must be boolean.", node.arguments[0]);
          return null;
        }
        if (args[1].valueType !== args[2].valueType) {
          this.issue("type_mismatch", "IF result branches must have the same type.", node);
          return null;
        }
        return args[1].valueType;
      case "LOOKUP": {
        if (!requireCount(2) || !requireTypes(["number", "string"])) return null;
        const tableArgument = args[1];
        if (tableArgument.op !== "literal" || typeof tableArgument.value !== "string") {
          this.issue("type_mismatch", "LOOKUP table name must be a string literal.", node.arguments[1]);
          return null;
        }
        const lookupType = ownGet(this.catalog.lookups, tableArgument.value);
        if (!lookupType) {
          this.issue("lookup_not_found", `Unknown lookup table ${tableArgument.value}.`, node.arguments[1]);
          return null;
        }
        return lookupType;
      }
      case "AND":
      case "OR":
        return requireCount(1, FORMULA_LIMITS.maxFunctionArguments) &&
          requireAll("boolean")
          ? "boolean"
          : null;
      case "NOT":
        return requireCount(1) && requireAll("boolean") ? "boolean" : null;
      case "ABS":
        return requireCount(1) && requireAll("number") ? "number" : null;
      case "CEILING":
      case "FLOOR":
      case "ROUND":
      case "ROUNDDOWN":
      case "ROUNDUP":
        return requireCount(1, 2) && requireAll("number") ? "number" : null;
      case "AVERAGE":
      case "COUNT":
      case "MAX":
      case "MIN":
      case "SUM":
        return requireCount(1, FORMULA_LIMITS.maxFunctionArguments) &&
          requireAll("number")
          ? "number"
          : null;
      default:
        return null;
    }
  }
}

/** Own-property read: catalog names such as `constructor` must not reach Object.prototype. */
function ownGet<T>(
  record: Record<string, T> | undefined,
  key: string
): T | undefined {
  return record && Object.hasOwn(record, key) ? record[key] : undefined;
}

function targetType(
  definition: FormulaSourceDefinition,
  catalog: FormulaReferenceCatalog
): FormulaValueType | undefined {
  if (definition.location.scope === "character") {
    return ownGet(catalog.character, definition.targetFieldId);
  }
  const listFieldId = definition.location.listFieldId;
  return listFieldId
    ? ownGet(ownGet(catalog.rows, listFieldId), definition.targetFieldId)
    : undefined;
}

function compileExpression(
  definition: FormulaSourceDefinition,
  catalog: FormulaReferenceCatalog
):
  | { success: true; expression: FormulaExpression; dependencies: FormulaDependency[] }
  | { success: false; issues: FormulaIssue[] } {
  const parsed = parseFormula(definition.id, definition.source);
  if (!parsed.success) return parsed;
  const compiler = new FormulaCompiler(definition, catalog);
  const expression = compiler.compile(parsed.expression);
  if (!expression || compiler.issues.length > 0) {
    return { success: false, issues: compiler.issues };
  }
  return { success: true, expression, dependencies: compiler.dependencies };
}

/**
 * Compiles a formula that has no target field. Grammar, functions, reference
 * resolution and IR are exactly those of `compileFormula`; only the target
 * and output-type checks are left to the caller, which reads `resultType`.
 */
export function compileFormulaExpression(
  formulaId: string,
  source: string,
  catalog: FormulaReferenceCatalog,
  location: FormulaLocation = { scope: "character" }
): FormulaExpressionCompileResult {
  const compiled = compileExpression(
    { id: formulaId, kind: "derived", targetFieldId: "", source, location },
    catalog
  );
  if (!compiled.success) return compiled;
  return {
    success: true,
    formula: {
      language: FORMULA_LANGUAGE,
      compilerVersion: FORMULA_COMPILER_VERSION,
      formulaId,
      resultType: compiled.expression.valueType,
      dependencies: compiled.dependencies,
      expression: compiled.expression,
    },
  };
}

export function compileFormula(
  definition: FormulaSourceDefinition,
  catalog: FormulaReferenceCatalog
): FormulaCompileResult {
  const compiled = compileExpression(definition, catalog);
  if (!compiled.success) return compiled;
  const { expression } = compiled;

  const expectedType = targetType(definition, catalog);
  if (!expectedType) {
    return {
      success: false,
      issues: [
        {
          category: "reference_not_found",
          formulaId: definition.id,
          message: `Unknown target field ${definition.targetFieldId}.`,
          start: 0,
          end: definition.source.length,
        },
      ],
    };
  }
  const requiredType = definition.kind === "validation" ? "boolean" : expectedType;
  if (expression.valueType !== requiredType) {
    return {
      success: false,
      issues: [
        {
          category: "output_type",
          formulaId: definition.id,
          message: `${definition.kind} formula must return ${requiredType}, not ${expression.valueType}.`,
          start: 0,
          end: definition.source.length,
        },
      ],
    };
  }

  return {
    success: true,
    formula: {
      language: FORMULA_LANGUAGE,
      compilerVersion: FORMULA_COMPILER_VERSION,
      formulaId: definition.id,
      kind: definition.kind,
      targetFieldId: definition.targetFieldId,
      location: definition.location,
      resultType: expression.valueType,
      dependencies: compiled.dependencies,
      expression,
    },
  };
}

export function compileFormulaSet(
  definitions: FormulaSourceDefinition[],
  catalog: FormulaReferenceCatalog
): FormulaSetCompileResult {
  const formulas: CompiledFormula[] = [];
  const issues: FormulaIssue[] = [];
  for (const definition of definitions) {
    const result = compileFormula(definition, catalog);
    if (result.success) formulas.push(result.formula);
    else issues.push(...result.issues);
  }
  if (issues.length > 0) return { success: false, issues };

  const targets = new Map<string, CompiledFormula>();
  for (const formula of formulas) {
    if (formula.kind === "validation") continue;
    const definition = definitions.find((item) => item.id === formula.formulaId)!;
    const key = targetKey(definition);
    const previous = targets.get(key);
    if (previous) {
      issues.push({
        category: "reference_ambiguous",
        formulaId: formula.formulaId,
        message: `Multiple formulas target ${formula.targetFieldId}.`,
        start: 0,
        end: definition.source.length,
      });
    } else {
      targets.set(key, formula);
    }
  }
  if (issues.length > 0) return { success: false, issues };

  const dependencies: Record<string, string[]> = {};
  for (const formula of formulas) {
    dependencies[formula.formulaId] = formula.dependencies.flatMap((dependency) => {
      const target = targets.get(
        dependencyKey(dependency, formula.location.listFieldId)
      );
      return target ? [target.formulaId] : [];
    });
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const order: string[] = [];
  const stack: string[] = [];
  const reportedCycles = new Set<string>();
  const visit = (formulaId: string): void => {
    if (visited.has(formulaId)) return;
    visiting.add(formulaId);
    stack.push(formulaId);
    for (const dependency of dependencies[formulaId] ?? []) {
      if (visiting.has(dependency)) {
        const start = stack.indexOf(dependency);
        const cycle = [...stack.slice(start), dependency];
        const cycleKey = cycle.join(" -> ");
        if (!reportedCycles.has(cycleKey)) {
          reportedCycles.add(cycleKey);
          issues.push({
            category: "cycle",
            formulaId: dependency,
            message: `Formula cycle: ${cycleKey}.`,
            start: 0,
            end:
              definitions.find((item) => item.id === dependency)?.source.length ?? 0,
            cycle,
          });
        }
      } else {
        visit(dependency);
      }
    }
    stack.pop();
    visiting.delete(formulaId);
    visited.add(formulaId);
    order.push(formulaId);
  };

  for (const formula of formulas) {
    visit(formula.formulaId);
  }
  return issues.length > 0
    ? { success: false, issues }
    : { success: true, formulas, graph: { order, dependencies } };
}
