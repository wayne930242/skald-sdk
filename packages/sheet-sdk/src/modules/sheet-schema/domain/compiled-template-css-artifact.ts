import type { CompiledTemplateCssArtifact } from "@skald/types/schema";
import type { JsonObject } from "./validation-types";

export const SCOPED_CSS_COMPILER_VERSION = "skald-css-compiler/v1";
export const SCOPED_CSS_VARIABLE_PREFIX = "--skald-";

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readCompiledTemplateCssArtifact(
  value: unknown,
): CompiledTemplateCssArtifact | null {
  if (
    !isObject(value) ||
    value.compilerVersion !== SCOPED_CSS_COMPILER_VERSION ||
    typeof value.rootAttribute !== "string" ||
    !value.rootAttribute.startsWith("data-skald-template-version=") ||
    !isObject(value.variables) ||
    typeof value.css !== "string"
  ) {
    return null;
  }
  if (
    Object.entries(value.variables).some(
      ([name, variableValue]) =>
        !name.startsWith(SCOPED_CSS_VARIABLE_PREFIX) || typeof variableValue !== "string",
    )
  ) {
    return null;
  }
  return value as unknown as CompiledTemplateCssArtifact;
}
