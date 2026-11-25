/** Value readers shared by the play model and the class model (no imports, so neither forms a cycle). */

export type CharacterValues = Record<string, unknown>;
export type CharacterPatch = Record<string, unknown>;

export function num(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return fallback;
}

export function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function rows(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((row): row is Record<string, unknown> => typeof row === "object" && row !== null)
    : [];
}

export interface HitPoints {
  current: number;
  max: number;
  temp: number;
}

/** A new character has no stored current HP yet: it is at its maximum (resource `follow: max`). */
export function hitPoints(values: CharacterValues): HitPoints {
  const max = Math.max(0, num(values.hpMax));
  const stored = (values.hp as { current?: unknown } | undefined)?.current;
  const current = typeof stored === "number" && Number.isFinite(stored) ? stored : max;
  return { current: Math.min(Math.max(current, 0), max), max, temp: Math.max(0, num(values.hpTemp)) };
}
