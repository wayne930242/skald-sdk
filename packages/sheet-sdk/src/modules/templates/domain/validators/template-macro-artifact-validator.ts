import type { Json } from "@skald/types";
import {
  TEMPLATE_MACRO_LIMITS,
  TEMPLATE_MACROS_SCHEMA,
  type TemplateMacroIssueCode,
  type TemplateMacros,
} from "@skald/types/wizard";
import templateMacrosSchema from "@skald/sheet-sdk/data/schemas/template-macros.schema.json";
import { buildFormulaReferenceCatalog } from "./formula/reference";
import { createShapeChecker } from "../json-schema-shape";
import {
  analyzeMacro,
  macroIdProblem,
  templateMacroProblems,
  type AnalyzedMacro,
} from "../template-macro-analysis";
import { boundedValidationIssue as boundedWizardIssue, MAX_LISTED_ISSUES } from "./issue-bounds";
import type {
  JsonObject,
  TemplateArtifactValidationResult,
  TemplateArtifactValidator,
  TemplateValidationIssue,
} from "@skald/sheet-sdk/modules/sheet-schema";

export const TEMPLATE_MACRO_VALIDATOR_VERSION =
  "skald-template-macro-validator/v1" as const;

const checkShape = createShapeChecker(templateMacrosSchema);

export interface TemplateMacroValidation {
  issues: TemplateValidationIssue[];
  /** Every macro id the source declares, valid or not. */
  declaredIds: ReadonlySet<string>;
  /** Macros that passed every check, by id. */
  macros: ReadonlyMap<string, AnalyzedMacro>;
  /** The validated `macros` value; absent when there is none or it has errors. */
  definition?: TemplateMacros;
}

function issue(
  code: TemplateMacroIssueCode,
  message: string,
  path: string[],
  details: JsonObject = {},
): TemplateValidationIssue {
  return boundedWizardIssue({
    category: "template",
    code,
    severity: "error",
    path: ["macros", ...path],
    message,
    details,
  });
}

/** The macro ids of a `macros` value whose shape is not known to be valid. */
function declaredMacroIds(raw: unknown): ReadonlySet<string> {
  const macros =
    typeof raw === "object" && raw !== null && !Array.isArray(raw)
      ? (raw as { macros?: unknown }).macros
      : undefined;
  return new Set(
    typeof macros === "object" && macros !== null && !Array.isArray(macros)
      ? Object.keys(macros)
      : [],
  );
}

/**
 * Validates the template-owned roll macros of a source (`source.macros`).
 * A source without `macros` has none and produces no issue.
 */
export function validateTemplateMacros(
  source: JsonObject,
): TemplateMacroValidation {
  const empty: TemplateMacroValidation = {
    issues: [],
    declaredIds: new Set(),
    macros: new Map(),
  };
  if (source.macros === undefined) return empty;

  // Checked before the shape: the shape check's cost grows with the value.
  if (
    new TextEncoder().encode(JSON.stringify(source.macros)).byteLength >
    TEMPLATE_MACRO_LIMITS.maxMacrosBytes
  ) {
    return {
      ...empty,
      issues: [
        issue(
          "template_macro_limit_exceeded",
          `Template macros may be at most ${TEMPLATE_MACRO_LIMITS.maxMacrosBytes} bytes.`,
          [],
          { item: "size in bytes", limit: TEMPLATE_MACRO_LIMITS.maxMacrosBytes },
        ),
      ],
      declaredIds: declaredMacroIds(source.macros),
    };
  }

  const shapeProblems = checkShape(source.macros);
  if (shapeProblems.length > 0) {
    return {
      issues: shapeProblems.slice(0, MAX_LISTED_ISSUES).map((problem) =>
        issue(
          "template_macro_shape_invalid",
          `Template macros are malformed at ${["macros", ...problem.path].join(".")}: ${problem.reason}.`,
          problem.path,
          {
            path: ["macros", ...problem.path].join("."),
            reason: problem.reason,
          },
        ),
      ),
      declaredIds: declaredMacroIds(source.macros),
      macros: new Map(),
    };
  }

  const definition = source.macros as unknown as TemplateMacros;
  const entries = Object.entries(definition.macros);
  const declaredIds = new Set(entries.map(([id]) => id));
  const issues: TemplateValidationIssue[] = [];
  if (entries.length > TEMPLATE_MACRO_LIMITS.maxMacros) {
    issues.push(
      issue(
        "template_macro_limit_exceeded",
        `A template may define at most ${TEMPLATE_MACRO_LIMITS.maxMacros} macros.`,
        ["macros"],
        { item: "macros", limit: TEMPLATE_MACRO_LIMITS.maxMacros },
      ),
    );
    return { issues, declaredIds, macros: new Map() };
  }

  const numericReferences = new Set(
    Object.entries(buildFormulaReferenceCatalog(source).character)
      .filter(([, type]) => type === "number")
      .map(([fieldId]) => fieldId.toLowerCase()),
  );
  const macros = new Map<string, AnalyzedMacro>();
  for (const [id, macro] of entries) {
    const path = ["macros", id];
    const idProblem = macroIdProblem(id);
    if (idProblem) {
      issues.push(
        issue(
          "template_macro_shape_invalid",
          `Template macros are malformed at ${["macros", ...path].join(".")}: ${idProblem}.`,
          path,
          { path: ["macros", ...path].join("."), reason: idProblem },
        ),
      );
      continue;
    }
    if (macro.params.length > TEMPLATE_MACRO_LIMITS.maxParams) {
      issues.push(
        issue(
          "template_macro_limit_exceeded",
          `Macro "${id}" may declare at most ${TEMPLATE_MACRO_LIMITS.maxParams} parameters.`,
          [...path, "params"],
          { macro: id, item: "params", limit: TEMPLATE_MACRO_LIMITS.maxParams },
        ),
      );
      continue;
    }
    if (macro.body.length > TEMPLATE_MACRO_LIMITS.maxBodyLength) {
      issues.push(
        issue(
          "template_macro_limit_exceeded",
          `Macro "${id}" body may be at most ${TEMPLATE_MACRO_LIMITS.maxBodyLength} characters.`,
          [...path, "body"],
          { macro: id, item: "body", limit: TEMPLATE_MACRO_LIMITS.maxBodyLength },
        ),
      );
      continue;
    }
    const problems = templateMacroProblems(id, macro, numericReferences);
    if (problems.length > 0) {
      issues.push(
        ...problems.map((problem) =>
          issue(
            problem.code,
            problem.message,
            [
              ...path,
              problem.code === "template_macro_param_invalid" ? "params" : "body",
            ],
            problem.details,
          ),
        ),
      );
      continue;
    }
    const analysis = analyzeMacro(id, "template", macro);
    if (analysis.success) macros.set(id, analysis.macro);
  }

  if (issues.length > MAX_LISTED_ISSUES) issues.length = MAX_LISTED_ISSUES;
  return issues.length > 0
    ? { issues, declaredIds, macros }
    : { issues, declaredIds, macros, definition };
}

/**
 * Publish validation of template-owned roll macros (ADR 0011). The compiled
 * artifact carries the validated definitions under `macros`, from which the
 * wizard runtime builds its macro registry.
 */
export class TemplateMacroArtifactValidator implements TemplateArtifactValidator {
  validate(source: JsonObject): TemplateArtifactValidationResult {
    const validation = validateTemplateMacros(source);
    if (!validation.definition) return { issues: validation.issues };
    return {
      issues: [],
      compiledArtifact: {
        macros: {
          schema: TEMPLATE_MACROS_SCHEMA,
          validatorVersion: TEMPLATE_MACRO_VALIDATOR_VERSION,
          macros: validation.definition.macros as unknown as Json,
        },
      },
      compilerVersions: { templateMacros: TEMPLATE_MACRO_VALIDATOR_VERSION },
    };
  }
}
