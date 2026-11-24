import type { JsonObject, TemplateValidationIssue } from "@skald/sheet-sdk/modules/sheet-schema";

export function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function formulaIssue(
  code: string,
  message: string,
  path: string[],
  details: JsonObject = {}
): TemplateValidationIssue {
  return {
    category: "formula",
    code,
    severity: "error",
    path,
    message,
    details,
  };
}
