/**
 * Roll effects on a character's data
 *
 * What a roll changes on the sheet, as pure functions of the character `data`:
 * the rules that decide *whether* it changes live in `post-roll-actions.ts`
 * (`decideAutoImprove`, `evaluatePostRollActions`); this file is the *how*.
 *
 * The web applies the same effects through its live Yjs sheet (`setField`);
 * the Discord bot applies them on the server inside `mutateCharacterState`
 * (`@skald/db`), which re-reads the character and calls these on the fresh
 * data. Both end up with the same data, which the tests pin.
 *
 * Nothing here mutates its input, and every value written is JSON-clean (no
 * `undefined`-valued keys): Yjs would store such a key but jsonb drops it, and
 * the server-side reconcile then mistakes the difference for an edit.
 */

import type { SpendPostRollAction } from "./post-roll-actions";

export type CharacterData = Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

/** A JSON round trip: drops `undefined`-valued keys the way jsonb does. */
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** Where a dotted path points: the object that holds the last step, and that step's key. */
function locate(
  data: CharacterData,
  path: string,
): { holder: Record<string, unknown>; key: string } | undefined {
  const parts = path.split(".");
  const key = parts[parts.length - 1];
  let holder: Record<string, unknown> = data;
  for (const part of parts.slice(0, -1)) {
    const next = holder[part];
    if (!isRecord(next)) return undefined;
    holder = next;
  }
  return { holder, key };
}

/** The finite number at a dotted path (`luck.current`); undefined when a step is missing, not an object, or not a finite number. */
export function numberAtPath(data: CharacterData, path: string): number | undefined {
  const at = locate(data, path);
  const value = at?.holder[at.key];
  return isFiniteNumber(value) ? value : undefined;
}

/**
 * A copy of `data` with `value` at the dotted path. Every object on the way is
 * copied, and a step that is missing or not an object becomes one (the web's
 * `setValueByPath` does the same).
 */
export function setAtPath(data: CharacterData, path: string, value: unknown): CharacterData {
  return setAtParts(data, path.split("."), value);
}

function setAtParts(data: CharacterData, parts: readonly string[], value: unknown): CharacterData {
  const [head, ...rest] = parts;
  if (rest.length === 0) return { ...data, [head]: value };
  const child = data[head];
  return { ...data, [head]: setAtParts(isRecord(child) ? child : {}, rest, value) };
}

/**
 * The spendable resource's current value: the declared path, else the fallback
 * for a character that never stored it (a new character shows its start value).
 * A stored 0 is 0, not missing.
 */
export function readResourceValue(
  data: CharacterData,
  rule: Pick<SpendPostRollAction, "resource" | "fallback">,
): number | undefined {
  return numberAtPath(data, rule.resource) ??
    (rule.fallback ? numberAtPath(data, rule.fallback) : undefined);
}

export type SpendOutcome =
  | { ok: true; data: CharacterData; before: number; after: number }
  | { ok: false; reason: "unreadable" | "bad-cost" }
  | { ok: false; reason: "insufficient"; available: number };

/**
 * Spend `cost` points of the resource: read it (declared path, else fallback),
 * subtract, write the declared path. Refuses to go below zero.
 */
export function spendResource(
  data: CharacterData,
  rule: Pick<SpendPostRollAction, "resource" | "fallback">,
  cost: number,
): SpendOutcome {
  if (!Number.isInteger(cost) || cost < 1) return { ok: false, reason: "bad-cost" };
  const before = readResourceValue(data, rule);
  if (before === undefined) return { ok: false, reason: "unreadable" };
  if (before < cost) return { ok: false, reason: "insufficient", available: before };
  const after = before - cost;
  return { ok: true, data: setAtPath(data, rule.resource, after), before, after };
}

export interface SkillTickTarget {
  /** The list field holding the skills (`skills`) */
  fieldId: string;
  /** The skill item's `id` in that list */
  itemId: string;
}

export type TickOutcome =
  | { ok: true; data: CharacterData }
  | { ok: false; reason: "missing" | "already" | "not-improvable" };

/**
 * Tick the improvement mark of one stored skill. Only that item changes (the
 * web's tick rewrites the list too, but with every item as it was); an item
 * that cannot improve or is already ticked is left alone, so a repeated call
 * is a no-op.
 */
export function tickSkillImproved(data: CharacterData, target: SkillTickTarget): TickOutcome {
  const list = data[target.fieldId];
  if (!Array.isArray(list)) return { ok: false, reason: "missing" };
  const index = list.findIndex((item) => isRecord(item) && item.id === target.itemId);
  if (index < 0) return { ok: false, reason: "missing" };
  const item = list[index] as Record<string, unknown>;
  if (item.canImprove === false) return { ok: false, reason: "not-improvable" };
  if (item.improved === true) return { ok: false, reason: "already" };
  const next = list.map((entry, at) => (at === index ? plain({ ...item, improved: true }) : entry));
  return { ok: true, data: { ...data, [target.fieldId]: next } };
}

/** One macro write whose field name has already been resolved to a place in the data. */
export interface ResolvedFieldWrite {
  path: readonly string[];
  value: number | string;
}

export type FieldWritesOutcome =
  | { ok: true; data: CharacterData }
  | { ok: false; reason: "missing" | "type-mismatch"; path: readonly string[] };

/**
 * Apply macro writes in order, all or nothing. A target must already exist and
 * hold the same kind of value (a number into a number, a string into a string);
 * a macro cannot invent fields or change a field's type.
 */
export function applyFieldWrites(
  data: CharacterData,
  writes: readonly ResolvedFieldWrite[],
): FieldWritesOutcome {
  let next = data;
  for (const write of writes) {
    let current: unknown = next;
    for (const part of write.path) {
      current = isRecord(current) ? current[part] : undefined;
    }
    if (current === undefined) return { ok: false, reason: "missing", path: write.path };
    const sameKind =
      (isFiniteNumber(current) && isFiniteNumber(write.value)) ||
      (typeof current === "string" && typeof write.value === "string");
    if (!sameKind) return { ok: false, reason: "type-mismatch", path: write.path };
    next = setAtParts(next, write.path, write.value);
  }
  return { ok: true, data: next };
}
