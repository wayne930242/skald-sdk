// Keep the PostCSS processor out of the editor bundle. Only walk and stringify this root; do not call toResult().
import parseCss from "postcss/lib/parse";
import selectorParser from "postcss-selector-parser";
import type { Json } from "@skald/types";
import type { CompiledTemplateCssArtifact, ScopedTemplateCssSource, TemplateStyleVariables } from "@skald/types/schema";
import { SCOPED_CSS_COMPILER_VERSION, SCOPED_CSS_VARIABLE_PREFIX as VARIABLE_PREFIX, type JsonObject, type TemplateArtifactValidationResult, type TemplateArtifactValidator, type TemplateValidationIssue } from "@skald/sheet-sdk/modules/sheet-schema";
import { cssIssue } from "./issue";
import { validateValue, isAllowedMedia, allowedProperties } from "./allowlist";
import { validateSelector, scopeValue } from "./selector";

const MAX_SOURCE_BYTES = 32_768;

const MAX_RULES = 256;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export type ScopedCssCompileResult =
  | { success: true; artifact: CompiledTemplateCssArtifact }
  | { success: false; issues: TemplateValidationIssue[] };

export function compileScopedTemplateCss(
  source: ScopedTemplateCssSource,
  templateVersionScope: string,
): ScopedCssCompileResult {
  const issues: TemplateValidationIssue[] = [];
  const css = source.css ?? "";
  const sourceBytes = new TextEncoder().encode(
    JSON.stringify({ variables: source.variables ?? {}, css }),
  ).byteLength;
  if (sourceBytes > MAX_SOURCE_BYTES) {
    issues.push(
      cssIssue(
        "source_too_large",
        `Scoped CSS source must not exceed ${MAX_SOURCE_BYTES} bytes.`,
        ["template", "scopedStyles"],
      ),
    );
  }

  const variables: TemplateStyleVariables = {};
  for (const [name, value] of Object.entries(source.variables ?? {})) {
    const path = ["template", "scopedStyles", "variables", name];
    if (typeof value !== "string") {
      issues.push(
        cssIssue(
          "variable_value_invalid",
          `CSS variable "${name}" must have a string value.`,
          path,
        ),
      );
      continue;
    }
    if (!name.startsWith(VARIABLE_PREFIX)) {
      issues.push(
        cssIssue(
          "variable_name_forbidden",
          `CSS variable "${name}" must start with ${VARIABLE_PREFIX}.`,
          path,
        ),
      );
      continue;
    }
    const valueIssues = validateValue(value, path);
    issues.push(...valueIssues);
    if (valueIssues.length === 0) {
      variables[name as keyof TemplateStyleVariables] = value;
    }
  }

  let root;
  try {
    root = parseCss(css, { from: undefined });
  } catch (error) {
    const syntaxError = error as { reason?: string; line?: number; column?: number };
    issues.push({
      category: "css",
      code: "css_syntax_invalid",
      severity: "error",
      path: ["template", "scopedStyles", "css"],
      message: syntaxError.reason ?? "CSS syntax is invalid.",
      details: {
        ...(syntaxError.line ? { line: syntaxError.line } : {}),
        ...(syntaxError.column ? { column: syntaxError.column } : {}),
      },
    });
    return { success: false, issues };
  }

  let ruleCount = 0;
  root.walkAtRules((atRule) => {
    if (!isAllowedMedia(atRule)) {
      issues.push(
        cssIssue(
          "at_rule_forbidden",
          `At-rule "@${atRule.name} ${atRule.params}" is not allowed.`,
          ["template", "scopedStyles", "css"],
          atRule,
        ),
      );
    }
  });
  root.walkRules((rule) => {
    ruleCount += 1;
    issues.push(...validateSelector(rule));
  });
  if (ruleCount > MAX_RULES) {
    issues.push(
      cssIssue(
        "too_many_rules",
        `Scoped CSS must not exceed ${MAX_RULES} rules.`,
        ["template", "scopedStyles", "css"],
      ),
    );
  }
  root.walkDecls((declaration) => {
    const property = declaration.prop.toLowerCase();
    const path = ["template", "scopedStyles", "css"];
    if (declaration.parent?.type !== "rule") {
      issues.push(
        cssIssue(
          "declaration_unscoped",
          "Every CSS declaration must be inside an allowed selector rule.",
          path,
          declaration,
        ),
      );
    }
    if (!allowedProperties.has(property)) {
      issues.push(
        cssIssue(
          "property_forbidden",
          `CSS property "${declaration.prop}" is not allowed.`,
          path,
          declaration,
        ),
      );
    }
    if (declaration.important) {
      issues.push(
        cssIssue(
          "important_forbidden",
          "!important is not allowed in template CSS.",
          path,
          declaration,
        ),
      );
    }
    issues.push(...validateValue(declaration.value, path, declaration));
  });

  if (issues.length > 0) return { success: false, issues };

  const value = scopeValue(templateVersionScope);
  const rootSelector = `[data-skald-template-version="${value}"]`;
  root.walkRules((rule) => {
    const selectorRoot = selectorParser().astSync(rule.selector);
    rule.selector = selectorRoot.nodes
      .map((selector) => `${rootSelector} ${selector.toString()}`)
      .join(",");
  });

  return {
    success: true,
    artifact: {
      compilerVersion: SCOPED_CSS_COMPILER_VERSION,
      rootAttribute: `data-skald-template-version=${value}`,
      variables,
      css: root.toString(),
    },
  };
}

export class ScopedCssArtifactValidator implements TemplateArtifactValidator {
  validate(source: JsonObject): TemplateArtifactValidationResult {
    const template = isObject(source.template) ? source.template : null;
    if (!template || !isObject(template.scopedStyles)) return { issues: [] };
    if (typeof template.id !== "string" || typeof template.version !== "string") {
      return {
        issues: [
          cssIssue(
            "template_scope_missing",
            "Template id and version are required to scope CSS.",
            ["template"],
          ),
        ],
      };
    }

    const result = compileScopedTemplateCss(
      template.scopedStyles as ScopedTemplateCssSource,
      `${template.id}@${template.version}`,
    );
    if (!result.success) return { issues: result.issues };
    return {
      issues: [],
      compiledArtifact: { styles: result.artifact as unknown as Json },
      compilerVersions: { css: SCOPED_CSS_COMPILER_VERSION },
    };
  }
}
