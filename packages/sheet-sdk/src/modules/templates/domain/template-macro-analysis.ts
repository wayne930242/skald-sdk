import {
  analyzeMacroDefinition,
  isReservedIdentifier,
  isUnsafeMacroName,
  MACRO_RESERVED_IDENTIFIERS,
  parseDiceExpression,
  parseRollExpression,
  walkMacroExpression,
  type MacroAnalysis,
  type MacroParamDefinition,
} from "@skald/dice";
import {
  CREATION_ROLL_LOG_LIMITS,
  TEMPLATE_MACRO_LIMITS,
  type TemplateMacroIssueCode,
  type WizardMacroOwner,
} from "@skald/types/wizard";

/** What publish validation needs to know about one roll macro, whoever owns it. */
export interface AnalyzedMacro extends MacroAnalysis {
  id: string;
  owner: WizardMacroOwner;
}

export type AnalyzedMacroResult =
  | { success: true; macro: AnalyzedMacro }
  | { success: false; reason: string };

export interface MacroSourceDefinition {
  params: MacroParamDefinition[];
  body: string;
}

/**
 * Parses a macro and lists its writes, rolls and expressions. Used for
 * template-owned macros (which are then restricted further) and for the
 * System and global macros a wizard references.
 */
export function analyzeMacro(
  id: string,
  owner: WizardMacroOwner,
  definition: MacroSourceDefinition,
): AnalyzedMacroResult {
  const result = analyzeMacroDefinition(definition);
  return result.success
    ? { success: true, macro: { id, owner, ...result.analysis } }
    : result;
}

// ---------------------------------------------------------------------------
// Rules for every macro a wizard can call
// ---------------------------------------------------------------------------

/** The form a `{{#id[…]}}` reference can spell (`macro/parser.ts`), minus names a plain object cannot key. */
const MACRO_ID = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Why `id` cannot name a macro, or null. */
export const MAX_MACRO_ID_LENGTH = 64;

export function macroIdProblem(id: string): string | null {
  if (id.length > MAX_MACRO_ID_LENGTH) {
    return `a macro id is at most ${MAX_MACRO_ID_LENGTH} characters`;
  }
  if (!MACRO_ID.test(id)) {
    return "a macro id starts with a letter or _ and holds only letters, digits and _";
  }
  return isUnsafeMacroName(id) ? `"${id}" is not available as a macro id` : null;
}

export interface MacroParamProblem {
  param: string;
  reason: string;
}

/** Parameter names the interpreter cannot bind. */
export function macroParamProblems(
  params: MacroParamDefinition[],
): MacroParamProblem[] {
  const problems: MacroParamProblem[] = [];
  const seen = new Set<string>();
  for (const param of params) {
    const name = param.name.toLowerCase();
    if (isReservedIdentifier(name)) {
      problems.push({
        param: param.name,
        reason: `is a reserved identifier (${MACRO_RESERVED_IDENTIFIERS.join("/")})`,
      });
    } else if (isUnsafeMacroName(param.name)) {
      problems.push({ param: param.name, reason: "is not available as a parameter name" });
    } else if (seen.has(name)) {
      problems.push({ param: param.name, reason: "is declared more than once" });
    }
    seen.add(name);
  }
  return problems;
}

/** Longest text `String(n)` gives a number, with the sign the executor adds. */
const MAX_NUMBER_TEXT = 25;

/** An upper bound on the resolved dice expression a roll template logs. */
function resolvedExpressionBound(template: string): number | null {
  const parsed = parseRollExpression(template);
  if (!parsed) return null;
  const prefix = parsed.system ? parsed.system.length + 1 : 0;
  let length = prefix + parsed.diceExpr.length;
  for (const placeholder of parsed.diceExpr.match(/[+-]?\{\{[^}]+\}\}/g) ?? []) {
    length += MAX_NUMBER_TEXT - placeholder.length;
  }
  return length;
}

/**
 * Functions of the macro expression language a template macro may call. All
 * of them return a number.
 */
export const TEMPLATE_MACRO_FUNCTIONS = [
  "abs",
  "ceil",
  "fifth",
  "floor",
  "half",
  "max",
  "min",
  "round",
] as const;

const allowedFunctions = new Set<string>(TEMPLATE_MACRO_FUNCTIONS);

type MacroExpression = MacroAnalysis["expressions"][number];

export interface MacroRunProblem {
  /**
   * `limit`: a call can exceed a Creation Roll Log limit. `outcome`: a
   * `return` yields text of unknown length (a function outside
   * `TEMPLATE_MACRO_FUNCTIONS`). `roll`: a `roll(…)` holds no roll
   * expression. `unbound`: a roll result is read before a roll bound it.
   * `branch`: an `if` has no final `else`, so a call fails when no branch
   * matches.
   */
  kind: "limit" | "outcome" | "roll" | "unbound" | "branch";
  reason: string;
}

/**
 * Why the string a `return` can yield does not fit the log's `outcome`, or
 * null. Strings do not concatenate in the macro language, so a result is a
 * literal, a branch of a conditional, or what a function returns.
 */
function outcomeProblem(
  expression: MacroExpression | undefined,
): MacroRunProblem | null {
  if (!expression) return null;
  switch (expression.type) {
    case "string":
      return String(expression.value ?? "").length >
        CREATION_ROLL_LOG_LIMITS.maxOutcomeLength
        ? {
            kind: "limit",
            reason: `a returned text is longer than ${CREATION_ROLL_LOG_LIMITS.maxOutcomeLength} characters`,
          }
        : null;
    case "conditional":
      return (
        outcomeProblem(expression.trueExpr) ?? outcomeProblem(expression.falseExpr)
      );
    case "excel":
      return {
        kind: "outcome",
        reason: "it returns an excel: result, whose length is unknown",
      };
    case "func":
      return allowedFunctions.has(expression.name ?? "")
        ? null
        : {
            kind: "outcome",
            reason: `it returns the result of ${expression.name}(), whose length is unknown`,
          };
    default:
      return null;
  }
}

/**
 * Why a call of this macro could yield a Creation Roll Log entry the log
 * schema rejects, or could not run at all. Applies to template, System and
 * global macros alike; an empty list means every call fits.
 */
export function macroRunProblems(macro: MacroAnalysis): MacroRunProblem[] {
  const limits = CREATION_ROLL_LOG_LIMITS;
  const problems: MacroRunProblem[] = [];
  const limit = (reason: string) => problems.push({ kind: "limit", reason });
  if (macro.paramCount > limits.maxArgs) {
    limit(`it declares more than ${limits.maxArgs} parameters`);
  }
  if (macro.maxRollsPerRun > limits.maxRollsPerCall) {
    limit(`one call can roll more than ${limits.maxRollsPerCall} times`);
  }
  if (macro.maxWritesPerRun > limits.maxWritesPerCall) {
    limit(`one call can write more than ${limits.maxWritesPerCall} fields`);
  }
  if (macro.staticWrites.some((field) => field.length > limits.maxWriteFieldLength)) {
    limit(`a written field name is longer than ${limits.maxWriteFieldLength} characters`);
  }
  for (const template of new Set(macro.rollTemplates)) {
    const bound = resolvedExpressionBound(template);
    if (bound === null) {
      problems.push({ kind: "roll", reason: "a roll(…) holds no roll expression" });
      break;
    }
    if (bound > limits.maxExpressionLength) {
      limit(`a roll(…) can resolve to more than ${limits.maxExpressionLength} characters`);
      break;
    }
  }
  for (const expression of macro.returnExpressions) {
    const problem = outcomeProblem(expression);
    if (problem) {
      problems.push(problem);
      break;
    }
  }
  for (const name of macro.unboundReads) {
    problems.push({
      kind: "unbound",
      reason:
        name === "rolled" || name === "total"
          ? `it reads @${name} before any roll(…) has run`
          : `it reads @${name} before a roll(…) with a comparison has run`,
    });
  }
  if (macro.hasIfWithoutElse) {
    problems.push({
      kind: "branch",
      reason: "every if needs a final else, or the macro fails when no branch matches",
    });
  }
  return problems;
}

// ---------------------------------------------------------------------------
// Template-owned macro restrictions
// ---------------------------------------------------------------------------

export interface TemplateMacroProblem {
  code: TemplateMacroIssueCode;
  message: string;
  details: Record<string, string | number>;
}


/** Characters a template macro body may contain; the expression tokenizer silently skips anything else. */
const BODY_CHARACTERS = /^[A-Za-z0-9_\s@(){};:,.+\-*/<>=!&|'"]*$/;

/** One dice group or constant: `NdS`, `NdF`, keep/drop modifiers, or an integer. */
const DICE_GROUP = "\\d{0,3}d(?:\\d{1,4}|f)(?:k[hl]?\\d{1,3}|d[hl]\\d{1,3})?";
const ALLOWED_DICE = new RegExp(
  `^${DICE_GROUP}(?:[+-](?:${DICE_GROUP}|\\d{1,6}))*$`,
  "i",
);

/**
 * Checks one `roll("…")` template of a template macro against the allow-list:
 * plain `NdS` groups with keep/drop modifiers and integer modifiers, formula
 * placeholders only as additive modifiers, an optional comparison target, and
 * no System roll prefix, exploding dice, multiplier or grouping.
 */
export function rollTemplateProblem(template: string): string | null {
  const parsed = parseRollExpression(template);
  if (!parsed) return "it is not a roll expression";
  if (parsed.system) {
    return `the "${parsed.system}:" System roll prefix is not available to a template macro`;
  }
  const dice = parsed.diceExpr.replace(/\s+/g, "");
  if (dice.startsWith("{{")) {
    return "a placeholder cannot supply the number of dice";
  }
  // The executor turns a placeholder into a signed modifier (`+N` or `-N`).
  const resolved = dice.replace(/[+-]?\{\{[^}]+\}\}/g, "+1");
  if (!ALLOWED_DICE.test(resolved)) {
    return "only NdS dice with keep/drop modifiers and integer modifiers are allowed";
  }
  const groups = parseDiceExpression(resolved);
  if (!groups) return "the dice notation is invalid";
  for (const die of groups.dice) {
    if (die.count > TEMPLATE_MACRO_LIMITS.maxDiceCount) {
      return `at most ${TEMPLATE_MACRO_LIMITS.maxDiceCount} dice per group are allowed`;
    }
    if (
      typeof die.sides === "number" &&
      (die.sides < 2 || die.sides > TEMPLATE_MACRO_LIMITS.maxDiceSides)
    ) {
      return `dice must have 2 to ${TEMPLATE_MACRO_LIMITS.maxDiceSides} sides`;
    }
  }
  if (
    parsed.targetFormula !== undefined &&
    !/^\d+$/.test(parsed.targetFormula) &&
    !/^\{\{[^}]+\}\}$/.test(parsed.targetFormula)
  ) {
    return "the comparison target must be a number or one {{…}} placeholder";
  }
  return null;
}

/**
 * Restrictions that apply only to a macro the Template Version owns:
 * no field writes, allow-listed dice and functions, resolved references, and
 * at least one roll. `numericReferences` holds the lowercased ids a body may
 * read: the template's numeric fields.
 */
export function templateMacroProblems(
  id: string,
  definition: MacroSourceDefinition,
  numericReferences: ReadonlySet<string>,
): TemplateMacroProblem[] {
  const problems: TemplateMacroProblem[] = [];
  const problem = (
    code: TemplateMacroIssueCode,
    message: string,
    details: Record<string, string | number> = {},
  ) => problems.push({ code, message, details: { macro: id, ...details } });

  const paramNames = new Set(
    definition.params.map((param) => param.name.toLowerCase()),
  );
  for (const { param, reason } of macroParamProblems(definition.params)) {
    problem(
      "template_macro_param_invalid",
      `Macro "${id}" parameter "${param}" ${reason}.`,
      { param },
    );
  }

  if (!BODY_CHARACTERS.test(definition.body)) {
    problem(
      "template_macro_syntax",
      `Macro "${id}" body contains characters outside the macro language.`,
    );
    return problems;
  }
  const analysis = analyzeMacro(id, "template", definition);
  if (!analysis.success) {
    problem("template_macro_syntax", `Macro "${id}": ${analysis.reason}`, {
      reason: analysis.reason,
    });
    return problems;
  }
  const { macro } = analysis;

  for (const field of macro.staticWrites) {
    problem(
      "template_macro_side_effect",
      `Macro "${id}" writes "${field}". A template macro cannot write fields.`,
      { field },
    );
  }
  if (macro.hasDynamicWrite) {
    problem(
      "template_macro_side_effect",
      `Macro "${id}" writes a computed field name. A template macro cannot write fields.`,
      { field: "@(…)" },
    );
  }

  if (macro.rollTemplates.length === 0) {
    problem(
      "template_macro_no_roll",
      `Macro "${id}" never rolls dice.`,
    );
  }
  for (const { kind, reason } of macroRunProblems(macro)) {
    // Reported as dice, or as a function, that a template macro cannot use.
    if (kind === "roll" || kind === "outcome") continue;
    if (kind === "branch") {
      problem("template_macro_syntax", `Macro "${id}": ${reason}.`, { reason });
      continue;
    }
    problem(
      kind === "unbound"
        ? "template_macro_reference_not_found"
        : "template_macro_limit_exceeded",
      `Macro "${id}" cannot be published: ${reason}.`,
      { reason },
    );
  }
  for (const template of macro.rollTemplates) {
    const reason = rollTemplateProblem(template);
    if (reason) {
      problem(
        "template_macro_dice_not_allowed",
        `Macro "${id}" roll "${template}" is not allowed: ${reason}.`,
        { expression: template, reason },
      );
    }
  }

  // A default is evaluated in the caller's context, before any parameter is
  // bound and before any roll: it can read numeric template fields only.
  const defaults = new Set(macro.defaultExpressions);
  const reportedDefaults = new Set<string>();
  for (const expression of macro.defaultExpressions) {
    walkMacroExpression(expression, (node) => {
      if (node.type !== "attr") return;
      const name = (node.name ?? "").toLowerCase();
      if (
        numericReferences.has(name) ||
        numericReferences.has(name.replace(".", "_")) ||
        reportedDefaults.has(name)
      ) {
        return;
      }
      reportedDefaults.add(name);
      problem(
        "template_macro_param_invalid",
        `Macro "${id}" has a parameter default that reads @${name}. A default can read numeric template fields only, not parameters or roll results.`,
        { reference: name },
      );
    });
  }

  const reportedFunctions = new Set<string>();
  const reportedReferences = new Set<string>();
  for (const expression of macro.expressions) {
    const isDefault = defaults.has(expression);
    walkMacroExpression(expression, (node) => {
      if (node.type === "excel") {
        if (!reportedFunctions.has("excel:")) {
          reportedFunctions.add("excel:");
          problem(
            "template_macro_function_not_allowed",
            `Macro "${id}" uses an excel: expression, which a template macro cannot use.`,
            { function: "excel:" },
          );
        }
        return;
      }
      if (node.type === "func") {
        const name = node.name ?? "";
        if (!allowedFunctions.has(name) && !reportedFunctions.has(name)) {
          reportedFunctions.add(name);
          problem(
            "template_macro_function_not_allowed",
            `Macro "${id}" calls ${name}(), which a template macro cannot use.`,
            { function: name },
          );
        }
        return;
      }
      if (node.type === "attr" && !isDefault) {
        const name = (node.name ?? "").toLowerCase();
        const flat = name.replace(".", "_");
        if (
          paramNames.has(name) ||
          isReservedIdentifier(name) ||
          numericReferences.has(name) ||
          numericReferences.has(flat) ||
          reportedReferences.has(name)
        ) {
          return;
        }
        reportedReferences.add(name);
        problem(
          "template_macro_reference_not_found",
          `Macro "${id}" reads @${name}, which is not a parameter or a numeric template field.`,
          { reference: name },
        );
      }
    });
  }

  return problems;
}
