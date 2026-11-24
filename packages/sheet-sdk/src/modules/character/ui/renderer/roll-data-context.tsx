"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

/**
 * The data a roll reads its `@` references from: the schema data it was built on plus the
 * values the formula runtime derived from it (character computed fields; in a List row, the
 * character's values, the row's own and the row's derived values).
 *
 * `source` is the schema data object the value was built from. A roll uses `value` only while
 * its own schema data is that same object, so a nested data scope that does not provide roll
 * data (a stat-list row, a wizard field) keeps rolling against its own data.
 */
interface RollDataValue {
  source: Record<string, unknown>;
  value: Record<string, unknown>;
}

const RollDataContext = createContext<RollDataValue | null>(null);

export function RollDataProvider({
  source,
  value,
  children,
}: RollDataValue & { children: ReactNode }) {
  const context = useMemo(() => ({ source, value }), [source, value]);
  return <RollDataContext.Provider value={context}>{children}</RollDataContext.Provider>;
}

/** Roll data for the given schema data: the provided roll data when it was built on it, else the data. */
export function useRollData(data: Record<string, unknown>): Record<string, unknown> {
  const provided = useContext(RollDataContext);
  return provided && provided.source === data ? provided.value : data;
}

/** The roll data of the enclosing scope, whatever data it was built on (List rows extend it). */
export function useEnclosingRollData(): Record<string, unknown> | null {
  return useContext(RollDataContext)?.value ?? null;
}
