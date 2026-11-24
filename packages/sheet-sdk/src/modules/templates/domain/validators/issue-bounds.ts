import type { TemplateValidationIssue, JsonObject } from "@skald/sheet-sdk/modules/sheet-schema";

/**
 * Issues listed per severity: one broken data set must not flood the author.
 * Every issue past the limit is still counted, and the count is reported.
 */
export const MAX_LISTED_ISSUES = 200;

/**
 * Bounds of one issue's text. Game data and the wizard's own ids can hold
 * strings of any length, and one such string can be quoted by every issue;
 * with these bounds the issues of a validation serialize to under a megabyte.
 */
const MAX_MESSAGE_LENGTH = 500;
export const MAX_DETAIL_LENGTH = 200;
const MAX_PATH_SEGMENT_LENGTH = 100;

export function cut(text: string, limit: number): string {
  if (text.length <= limit) return text;
  let end = limit;
  // Never leave the high half of a surrogate pair at the cut.
  const last = text.charCodeAt(end - 1);
  if (last >= 0xd800 && last <= 0xdbff) end -= 1;
  return `${text.slice(0, end)}…`;
}

/** A validation issue with its message, details and path cut to their bounds. */
export function boundedValidationIssue(
  issue: TemplateValidationIssue,
): TemplateValidationIssue {
  const details: JsonObject = {};
  for (const [key, value] of Object.entries(issue.details ?? {})) {
    details[key] = typeof value === "string" ? cut(value, MAX_DETAIL_LENGTH) : value;
  }
  return {
    ...issue,
    path: issue.path.map((segment) => cut(segment, MAX_PATH_SEGMENT_LENGTH)),
    message: cut(issue.message, MAX_MESSAGE_LENGTH),
    details,
  };
}
