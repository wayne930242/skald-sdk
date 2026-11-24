import type { ChildNode } from "postcss";
import type { TemplateValidationIssue } from "@skald/sheet-sdk/modules/sheet-schema";

export function cssIssue(
  code: string,
  message: string,
  path: string[],
  node?: ChildNode,
): TemplateValidationIssue {
  const start = node?.source?.start;
  return {
    category: "css",
    code,
    severity: "error",
    path,
    message,
    ...(start
      ? { details: { line: start.line, column: start.column } }
      : {}),
  };
}
