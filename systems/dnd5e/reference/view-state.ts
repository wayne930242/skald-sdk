import { useState } from "react";

/**
 * View state a parent keeps across a view's unmount (a preview over the compendium, a ref pushed in the
 * reference dialog), so Back returns to the same search, filters and chapter. `null` means "start fresh".
 */
export interface LiftedViewState<T> {
  value: T | null;
  set: (next: T | null) => void;
}

/** A parent's slot for one view's state. */
export function useLiftedViewState<T>(): LiftedViewState<T> {
  const [value, set] = useState<T | null>(null);
  return { value, set };
}

/** The view's state: the parent's when lifted, else its own; `update` merges a patch. */
export function useViewState<T extends object>(lifted: LiftedViewState<T> | undefined, initial: T): [T, (patch: Partial<T>) => void] {
  const [own, setOwn] = useState<T>(initial);
  const value = lifted ? (lifted.value ?? initial) : own;
  const set = lifted ? lifted.set : setOwn;
  return [value, (patch) => set({ ...value, ...patch })];
}

export interface MagicItemViewState { query: string; category: string; rarity: string; attunement: string }
export interface MonsterViewState { query: string; maxCr: string; type: string; size: string }
export interface BookViewState { book: "srd" | "xphb" | "xdmg"; chapter: string | null; anchor: string | null; query: string }
