import { splitRef } from "./tags";

export const REFERENCE_HISTORY_KEY = "skald:dnd5e-2024:reference-history";
const LIMIT = 10;

export interface ReferenceHistory { recent: string[]; pinned: string[] }

function readRefs(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const refs = new Set<string>();
  for (const ref of value) {
    if (typeof ref !== "string" || !splitRef(ref)) continue;
    refs.add(ref);
    if (refs.size === LIMIT) break;
  }
  return [...refs];
}

export function parseReferenceHistory(raw: string | null): ReferenceHistory {
  try {
    const data: unknown = raw ? JSON.parse(raw) : null;
    if (data && typeof data === "object") {
      return {
        recent: readRefs("recent" in data ? data.recent : null),
        pinned: readRefs("pinned" in data ? data.pinned : null),
      };
    }
  } catch {
    // A corrupt or obsolete value should never stop the reference dialog from opening.
  }
  return { recent: [], pinned: [] };
}

function moveToFront(refs: readonly string[], ref: string): string[] {
  return [ref, ...refs.filter((entry) => entry !== ref)].slice(0, LIMIT);
}

export function recordReferenceVisit(history: ReferenceHistory, ref: string): ReferenceHistory {
  return history.recent[0] === ref ? history : { ...history, recent: moveToFront(history.recent, ref) };
}

export function toggleReferencePin(history: ReferenceHistory, ref: string): ReferenceHistory {
  return { ...history, pinned: history.pinned.includes(ref) ? history.pinned.filter((pin) => pin !== ref) : moveToFront(history.pinned, ref) };
}
