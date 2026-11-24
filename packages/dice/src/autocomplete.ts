// @skald/dice autocomplete.ts
//
// Shared `{{@`/`{{#` trigger detection for roll-expression inputs. Used by
// both apps/web's inline chat dice roller (DOM cursor position) and apps/bot's
// `/sr` slash command (Discord autocomplete supplies the full current input
// string with no cursor position, so callers pass `cursor = text.length`).

export interface AutocompleteItem {
  id: string;
  label?: string;
}

export interface AutocompleteTrigger {
  kind: "field" | "macro";
  start: number;
  results: AutocompleteItem[];
}

const TRIGGER_PATTERN = /\{\{([@#])([a-zA-Z0-9_]*)$/;

/**
 * Detects an unclosed `{{@partial` / `{{#partial` immediately before `cursor`
 * and returns matching suggestions, or `null` if there is no active trigger
 * or nothing matches.
 */
export function detectAutocompleteTrigger(
  text: string,
  cursor: number,
  fields: AutocompleteItem[] | undefined,
  macros: AutocompleteItem[] | undefined,
  limit = 8,
): AutocompleteTrigger | null {
  const match = text.slice(0, cursor).match(TRIGGER_PATTERN);
  if (!match) return null;

  const kind = match[1] === "@" ? "field" : "macro";
  const query = match[2].toLowerCase();
  const source = kind === "field" ? fields : macros;
  if (!source?.length) return null;

  const results = source
    .filter((item) => item.id.toLowerCase().includes(query))
    .slice(0, limit);
  if (results.length === 0) return null;

  return { kind, start: cursor - match[2].length, results };
}
