import type { AtRule, Declaration } from "postcss";
import { SCOPED_CSS_VARIABLE_PREFIX as VARIABLE_PREFIX, type TemplateValidationIssue } from "@skald/sheet-sdk/modules/sheet-schema";
import { cssIssue } from "./issue";

export const MAX_SELECTOR_DEPTH = 4;

export const CUSTOM_CLASS_PREFIX = "skald-user-";

export const SCOPED_CSS_ALLOWED_PROPERTIES = [
  "align-items",
  "background-color",
  "border",
  "border-color",
  "border-radius",
  "border-style",
  "border-width",
  "color",
  "column-gap",
  "display",
  "font-family",
  "font-size",
  "font-style",
  "font-weight",
  "gap",
  "grid-template-columns",
  "height",
  "justify-content",
  "line-height",
  "margin",
  "margin-bottom",
  "margin-left",
  "margin-right",
  "margin-top",
  "max-height",
  "max-width",
  "min-height",
  "min-width",
  "opacity",
  "padding",
  "padding-bottom",
  "padding-left",
  "padding-right",
  "padding-top",
  "row-gap",
  "text-align",
  "text-decoration",
  "width",
] as const;

export const allowedProperties = new Set<string>(SCOPED_CSS_ALLOWED_PROPERTIES);

export const SCOPED_CSS_ALLOWED_PSEUDO_CLASSES = [
  ":checked",
  ":disabled",
  ":first-child",
  ":focus-visible",
  ":hover",
  ":last-child",
] as const;

export const SCOPED_CSS_ALLOWED_AT_RULES = [
  "@media (max-width)",
  "@media (min-width)",
  "@media print",
] as const;

export const allowedPseudoClasses = new Set<string>(
  SCOPED_CSS_ALLOWED_PSEUDO_CLASSES,
);

export const allowedTags = new Set([
  "button",
  "div",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "img",
  "input",
  "label",
  "p",
  "select",
  "span",
  "textarea",
]);

const allowedValueFunctions = new Set([
  "calc",
  "clamp",
  "hsl",
  "hsla",
  "linear-gradient",
  "max",
  "min",
  "minmax",
  "repeat",
  "rgb",
  "rgba",
  "var",
]);

export function validateValue(
  value: string,
  path: string[],
  node?: Declaration,
): TemplateValidationIssue[] {
  const issues: TemplateValidationIssue[] = [];
  const normalized = value.replace(/\/\*[\s\S]*?\*\//g, "").toLowerCase();

  if (/\\/.test(value)) {
    issues.push(
      cssIssue(
        "value_escape_forbidden",
        "CSS escape sequences are not allowed in template values.",
        path,
        node,
      ),
    );
  }
  if (/u\s*r\s*l\s*\(/i.test(normalized)) {
    issues.push(
      cssIssue(
        "external_url_forbidden",
        "url() is not allowed in template CSS.",
        path,
        node,
      ),
    );
  }
  if (/expression\s*\(|javascript\s*:/i.test(normalized)) {
    issues.push(
      cssIssue(
        "script_value_forbidden",
        "Script-like CSS values are not allowed.",
        path,
        node,
      ),
    );
  }
  if (!/^[a-z0-9\s.,#%()/'"+*\-_:]+$/i.test(value)) {
    issues.push(
      cssIssue(
        "value_token_forbidden",
        "CSS value contains a token that is not in the allowlist.",
        path,
        node,
      ),
    );
  }

  for (const match of value.matchAll(/([a-z-]+)\s*\(/gi)) {
    const functionName = match[1].toLowerCase();
    if (!allowedValueFunctions.has(functionName)) {
      issues.push(
        cssIssue(
          "value_function_forbidden",
          `CSS function "${functionName}()" is not allowed.`,
          path,
          node,
        ),
      );
    }
  }
  for (const match of value.matchAll(/var\(\s*(--[a-z0-9-]+)/gi)) {
    if (!match[1].startsWith(VARIABLE_PREFIX)) {
      issues.push(
        cssIssue(
          "variable_reference_forbidden",
          `CSS variable "${match[1]}" must start with ${VARIABLE_PREFIX}.`,
          path,
          node,
        ),
      );
    }
  }
  return issues;
}

export function isAllowedMedia(atRule: AtRule): boolean {
  if (atRule.name.toLowerCase() !== "media") return false;
  const params = atRule.params.trim().toLowerCase();
  if (params === "print") return true;
  return /^\((?:min|max)-width:\s*(?:\d+(?:\.\d+)?)(?:px|rem|em)\)$/.test(
    params,
  );
}
