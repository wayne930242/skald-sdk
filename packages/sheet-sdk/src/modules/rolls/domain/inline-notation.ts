import type { AutocompleteTrigger } from "@skald/dice";

// Parse notation to get dice counts, e.g., "2d6+1d20" -> { 6: 2, 20: 1 }
export function parseNotation(notation: string): Map<number, number> {
  const counts = new Map<number, number>();
  const regex = /(\d*)d(\d+)/gi;
  let match;
  while ((match = regex.exec(notation)) !== null) {
    const count = parseInt(match[1] || "1", 10);
    const sides = parseInt(match[2], 10);
    counts.set(sides, (counts.get(sides) || 0) + count);
  }
  return counts;
}

// Build notation from dice counts
export function buildNotation(counts: Map<number, number>): string {
  const parts: string[] = [];
  const sortedEntries = [...counts.entries()].sort((a, b) => a[0] - b[0]);
  for (const [sides, count] of sortedEntries) {
    if (count > 0) {
      parts.push(`${count}d${sides}`);
    }
  }
  return parts.join("+");
}

export function appendExpression(prev: string, expression: string): string {
  const trimmed = prev.trim();
  if (!trimmed) return expression;
  return `${trimmed}+${expression}`;
}

/** The text and cursor after the highlighted suggestion replaces the partial identifier. */
export function applyAutocompleteSuggestion(
  text: string,
  cursor: number,
  trigger: AutocompleteTrigger,
  id: string,
): { text: string; cursor: number } {
  const next = `${text.slice(0, trigger.start)}${id}${text.slice(cursor)}`;
  return { text: next, cursor: trigger.start + id.length };
}
