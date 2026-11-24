// packages/dice/src/macro/analysis.ts
//
// Static facts about a macro, read from its parsed body without running it:
// what it writes, what it rolls and which expressions it evaluates. Publish
// validation uses them to decide whether a macro may be used in a given place.

import { parseFormula, type FormulaAST } from "../formula/parser";
import { parseRollExpression } from "../roll-expression/parser";
import { MacroParseError, parseMacroBody } from "./body-parser";
import type { MacroParamDefinition, MacroStatement } from "./types";

export interface MacroAnalysis {
  paramCount: number;
  /** Arguments a call must supply: up to the last parameter that has no default. */
  requiredParamCount: number;
  /** Fields the body writes with `@field := …`. */
  staticWrites: string[];
  /** The body writes through `@(expr) := …`, whose target is unknown until it runs. */
  hasDynamicWrite: boolean;
  /** Every `roll("…")` template, statement or return. */
  rollTemplates: string[];
  /** Every expression the macro evaluates: conditions, values, parameter defaults and roll placeholders. */
  expressions: FormulaAST[];
  /** Parameter defaults (also in `expressions`). They are evaluated in the caller's context, before any parameter is bound. */
  defaultExpressions: FormulaAST[];
  /** The expression of every `return <expr>;` (also in `expressions`). */
  returnExpressions: FormulaAST[];
  /** The most `roll("…")` calls one run can make: the body has no loops, so this is its longest path. */
  maxRollsPerRun: number;
  /** The most field writes one run can make. */
  maxWritesPerRun: number;
  /**
   * `rolled`, `total`, `target` or `margin` read on a path where no roll has
   * bound it: `rolled`/`total` exist after any roll, `target`/`margin` only
   * after a roll with a comparison. Running that path fails.
   */
  unboundReads: string[];
  /** Some `if` has no `else`: the run fails when none of its branches matches. */
  hasIfWithoutElse: boolean;
}

export type MacroAnalysisResult =
  | { success: true; analysis: MacroAnalysis }
  | { success: false; reason: string };

const PLACEHOLDER = /\{\{[^}]+\}\}/g;

type BodyFacts = Pick<
  MacroAnalysis,
  | "staticWrites"
  | "hasDynamicWrite"
  | "rollTemplates"
  | "expressions"
  | "returnExpressions"
>;

function collectStatements(statements: MacroStatement[], into: BodyFacts): void {
  for (const statement of statements) {
    switch (statement.kind) {
      case "roll":
        into.rollTemplates.push(statement.template);
        break;
      case "assign":
        if (statement.target.kind === "static") {
          into.staticWrites.push(statement.target.field);
        } else {
          into.hasDynamicWrite = true;
          into.expressions.push(statement.target.expr);
        }
        into.expressions.push(statement.expr);
        break;
      case "return":
        if (statement.value.kind === "roll") {
          into.rollTemplates.push(statement.value.template);
        } else {
          into.expressions.push(statement.value.expr);
          into.returnExpressions.push(statement.value.expr);
        }
        break;
      case "if":
        for (const branch of statement.branches) {
          into.expressions.push(branch.condition);
          collectStatements(branch.body, into);
        }
        if (statement.elseBody) collectStatements(statement.elseBody, into);
        break;
    }
  }
}


// ---------------------------------------------------------------------------
// Paths through the body
// ---------------------------------------------------------------------------

/** What holds on every path that reaches a point of the body. */
interface PathState {
  /** A roll has run, so `rolled` and `total` are bound. */
  rolled: boolean;
  /** A roll with a comparison has run, so `target` and `margin` are bound. */
  compared: boolean;
  rolls: number;
  writes: number;
}

interface PathFacts {
  maxRollsPerRun: number;
  maxWritesPerRun: number;
  unboundReads: Set<string>;
  hasIfWithoutElse: boolean;
  placeholders: ReadonlyMap<string, FormulaAST[]>;
}

function checkReads(expression: FormulaAST, state: PathState, facts: PathFacts): void {
  walkMacroExpression(expression, (node) => {
    if (node.type !== "attr" || !node.name) return;
    const name = node.name.toLowerCase();
    if (
      ((name === "rolled" || name === "total") && !state.rolled) ||
      ((name === "target" || name === "margin") && !state.compared)
    ) {
      facts.unboundReads.add(name);
    }
  });
}

function afterRoll(template: string, state: PathState, facts: PathFacts): PathState {
  // Placeholders are evaluated before the roll binds its outcome.
  for (const placeholder of facts.placeholders.get(template) ?? []) {
    checkReads(placeholder, state, facts);
  }
  const parsed = parseRollExpression(template);
  return {
    rolled: true,
    compared:
      state.compared ||
      (parsed?.comparator !== undefined && parsed.targetFormula !== undefined),
    rolls: state.rolls + 1,
    writes: state.writes,
  };
}

function endOfRun(state: PathState, facts: PathFacts): void {
  facts.maxRollsPerRun = Math.max(facts.maxRollsPerRun, state.rolls);
  facts.maxWritesPerRun = Math.max(facts.maxWritesPerRun, state.writes);
}

/**
 * Walks every path through `statements`. Returns the state after them, or
 * null when every path has returned (or failed) before the end.
 */
function followPaths(
  statements: MacroStatement[],
  start: PathState,
  facts: PathFacts,
): PathState | null {
  let state = start;
  for (const statement of statements) {
    switch (statement.kind) {
      case "roll":
        state = afterRoll(statement.template, state, facts);
        break;
      case "assign":
        if (statement.target.kind === "dynamic") {
          checkReads(statement.target.expr, state, facts);
        }
        checkReads(statement.expr, state, facts);
        state = { ...state, writes: state.writes + 1 };
        break;
      case "return":
        if (statement.value.kind === "roll") {
          endOfRun(afterRoll(statement.value.template, state, facts), facts);
        } else {
          checkReads(statement.value.expr, state, facts);
          endOfRun(state, facts);
        }
        return null;
      case "if": {
        const ends: PathState[] = [];
        for (const branch of statement.branches) {
          checkReads(branch.condition, state, facts);
          const end = followPaths(branch.body, state, facts);
          if (end) ends.push(end);
        }
        if (statement.elseBody) {
          const end = followPaths(statement.elseBody, state, facts);
          if (end) ends.push(end);
        } else {
          facts.hasIfWithoutElse = true;
        }
        if (ends.length === 0) return null;
        state = {
          rolled: ends.every((end) => end.rolled),
          compared: ends.every((end) => end.compared),
          rolls: Math.max(...ends.map((end) => end.rolls)),
          writes: Math.max(...ends.map((end) => end.writes)),
        };
        break;
      }
    }
  }
  return state;
}

/**
 * Parses a macro definition and lists its writes, rolls and expressions.
 * Fails with the parser's reason on a syntax error, an unsupported construct,
 * or an invalid parameter default or roll placeholder.
 */
export function analyzeMacroDefinition(definition: {
  params: MacroParamDefinition[];
  body: string;
}): MacroAnalysisResult {
  try {
    return analyze(definition);
  } catch (error) {
    if (error instanceof MacroParseError) {
      // The parser quotes the text it rejects, which can be the whole body.
      return { success: false, reason: excerpt(error.message, 200) };
    }
    // The parsers and the walk below recurse once per nesting level.
    if (error instanceof RangeError) {
      return { success: false, reason: "The macro is nested too deeply." };
    }
    throw error;
  }
}

function analyze(definition: {
  params: MacroParamDefinition[];
  body: string;
}): MacroAnalysisResult {
  const statements = parseMacroBody(definition.body);

  const facts: BodyFacts = {
    staticWrites: [],
    hasDynamicWrite: false,
    rollTemplates: [],
    expressions: [],
    returnExpressions: [],
  };
  collectStatements(statements, facts);

  let requiredParamCount = 0;
  const defaultExpressions: FormulaAST[] = [];
  for (const [index, param] of definition.params.entries()) {
    if (param.default === undefined) {
      requiredParamCount = index + 1;
      continue;
    }
    const defaultExpression = parseFormula(param.default);
    if (!defaultExpression) {
      return {
        success: false,
        reason: `Parameter "${param.name}" has an invalid default.`,
      };
    }
    defaultExpressions.push(defaultExpression);
    facts.expressions.push(defaultExpression);
  }

  const placeholders = new Map<string, FormulaAST[]>();
  for (const template of facts.rollTemplates) {
    if (placeholders.has(template)) {
      facts.expressions.push(...placeholders.get(template)!);
      continue;
    }
    const parsed: FormulaAST[] = [];
    for (const placeholder of template.match(PLACEHOLDER) ?? []) {
      const expression = parseFormula(placeholder);
      if (!expression) {
        return {
          success: false,
          reason: `Roll "${excerpt(template)}" has an invalid placeholder ${excerpt(placeholder)}.`,
        };
      }
      parsed.push(expression);
    }
    placeholders.set(template, parsed);
    facts.expressions.push(...parsed);
  }

  const paths: PathFacts = {
    maxRollsPerRun: 0,
    maxWritesPerRun: 0,
    unboundReads: new Set(),
    hasIfWithoutElse: false,
    placeholders,
  };
  const end = followPaths(
    statements,
    { rolled: false, compared: false, rolls: 0, writes: 0 },
    paths,
  );
  if (end) endOfRun(end, paths);

  return {
    success: true,
    analysis: {
      paramCount: definition.params.length,
      requiredParamCount,
      ...facts,
      defaultExpressions,
      maxRollsPerRun: paths.maxRollsPerRun,
      maxWritesPerRun: paths.maxWritesPerRun,
      unboundReads: [...paths.unboundReads],
      hasIfWithoutElse: paths.hasIfWithoutElse,
    },
  };
}

/** A reason names the text it is about; it does not repeat a long one in full. */
function excerpt(text: string, limit = 80): string {
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

/** Visits every node of a macro expression, depth first. */
export function walkMacroExpression(
  node: FormulaAST | undefined,
  visit: (node: FormulaAST) => void,
): void {
  if (!node) return;
  visit(node);
  walkMacroExpression(node.left, visit);
  walkMacroExpression(node.right, visit);
  walkMacroExpression(node.condition, visit);
  walkMacroExpression(node.trueExpr, visit);
  walkMacroExpression(node.falseExpr, visit);
  for (const argument of node.args ?? []) walkMacroExpression(argument, visit);
}
