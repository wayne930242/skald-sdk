/**
 * Blank versus filled, the same way in every print: with 「保留手寫空白」 a print keeps its empty
 * fields to write in by hand; without it, it leaves them out.
 */

/** No value: nullish, a string of whitespace, or an empty list. Numbers and booleans are values. */
export function isBlankValue(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === "string") return value.trim() === "";
  return Array.isArray(value) && value.length === 0;
}

/** Print it: the blanks are kept, or it has a value. */
export const keepWhen = (blanks: boolean, value: unknown): boolean => blanks || !isBlankValue(value);

/** Empty lines to rule under `filled` ones: what is left of `lines`, but at least `extra`. */
export function ruledLines(filled: number, room: { lines: number; extra: number }): number {
  return Math.max(room.extra, room.lines - filled);
}

/** The rows, padded with empty ones to at least `min`, with at least `extra` empty ones. */
export function padRows<T>(rows: readonly T[], min: number, extra: number): (T | undefined)[] {
  const total = Math.max(min, rows.length + extra);
  return [...rows, ...Array.from({ length: total - rows.length }, () => undefined)];
}
