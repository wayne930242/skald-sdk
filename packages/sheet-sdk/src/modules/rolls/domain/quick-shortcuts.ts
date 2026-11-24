import { normalizeRollInput, validateDiceExpression } from "@skald/dice";

interface ShortcutImportParseResult {
  valid: string[];
  invalid: string[];
}

function normalizeShortcutExpression(input: string): string | null {
  const normalized = normalizeRollInput(input);
  if (!normalized) return null;
  const validation = validateDiceExpression(normalized);
  if (!validation.valid) return null;
  return normalized;
}

export function dedupeShortcutExpressions(expressions: string[]): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const expression of expressions) {
    const normalized = normalizeShortcutExpression(expression);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(normalized);
  }

  return deduped;
}

export function mergeShortcutExpressions(
  current: string[],
  incoming: string[],
): string[] {
  return dedupeShortcutExpressions([...incoming, ...current]);
}

function extractImportItems(payload: string): string[] {
  const trimmed = payload.trim();
  if (!trimmed) return [];

  const looksLikeJson =
    (trimmed.startsWith("[") && trimmed.endsWith("]")) ||
    (trimmed.startsWith("{") && trimmed.endsWith("}"));

  if (looksLikeJson) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.filter((item): item is string => typeof item === "string");
      }
      if (
        parsed &&
        typeof parsed === "object" &&
        "shortcuts" in parsed &&
        Array.isArray((parsed as { shortcuts: unknown }).shortcuts)
      ) {
        return (parsed as { shortcuts: unknown[] }).shortcuts.filter(
          (item): item is string => typeof item === "string",
        );
      }
    } catch {
      // Fallback to text parsing.
    }
  }

  return trimmed
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function parseShortcutImportPayload(
  payload: string,
): ShortcutImportParseResult {
  const items = extractImportItems(payload);
  const valid: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    const normalized = normalizeShortcutExpression(item);
    if (!normalized) {
      invalid.push(item);
      continue;
    }
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    valid.push(normalized);
  }

  return { valid, invalid };
}
