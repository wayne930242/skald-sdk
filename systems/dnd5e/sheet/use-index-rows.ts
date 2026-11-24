"use client";

import { useEffect, useState } from "react";
import { loadEnglishIndex, loadLocalizedIndex } from "../reference/load-corpus";

/** A lazy index (plan T2b §2.6, §2.8): what the monster browser, the item tab and refLists list. */
export type IndexName = "creature" | "item-magic";

export interface IndexRow {
  id: string;
  /** Name in the viewer's locale, English where it has none. */
  name: string;
  english: string;
  row: Record<string, unknown>;
}

const loaded = new Map<string, Promise<IndexRow[]>>();

/** The rows of a lazy index in `locale`, loaded once per index and locale. */
export function loadIndexRows(index: IndexName, locale: string): Promise<IndexRow[]> {
  const key = `${index}:${locale}`;
  let found = loaded.get(key);
  if (!found) {
    const pending = Promise.all([loadEnglishIndex(index), loadLocalizedIndex(locale, index)]).then(([english, localized]) =>
      Object.entries(english ?? {}).map(([id, row]) => {
        const englishName = typeof row.name === "string" ? row.name : id;
        const local = localized?.[id]?.name;
        return { id, name: typeof local === "string" && local ? local : englishName, english: englishName, row };
      }),
    );
    found = pending;
    loaded.set(key, pending);
    pending.catch(() => {
      if (loaded.get(key) === pending) loaded.delete(key);
    });
  }
  return found;
}

/** `loadIndexRows` as a hook: null until the index has loaded (or while `enabled` is false). */
export function useIndexRows(index: IndexName, locale: string, enabled = true): IndexRow[] | null {
  const [state, setState] = useState<{ key: string; rows: IndexRow[] } | null>(null);
  const key = `${index}:${locale}`;
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    void loadIndexRows(index, locale).then((rows) => {
      if (live) setState({ key, rows });
    });
    return () => {
      live = false;
    };
  }, [enabled, index, key, locale]);
  return enabled && state?.key === key ? state.rows : null;
}

/** A creature's CR as a number for comparisons (`"1/4"` → 0.25); null for none. */
export function crValue(cr: unknown): number | null {
  if (typeof cr === "number") return cr;
  if (typeof cr !== "string" || !cr) return null;
  const [top, bottom] = cr.split("/");
  const value = bottom ? Number(top) / Number(bottom) : Number(top);
  return Number.isFinite(value) ? value : null;
}
