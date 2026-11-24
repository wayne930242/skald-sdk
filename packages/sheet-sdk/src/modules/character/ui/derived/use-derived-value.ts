"use client";

import { useContext, useMemo } from "react";
import type { FormulaLifecycleIssue, FormulaValue, FormulaValueType } from "@skald/formula";
import {
  autoOf,
  snapshotDerived,
  type CharacterFormulaRuntime,
  type DerivedSnapshot,
} from "@skald/sheet-sdk/modules/sheet-schema";
import { SchemaDataContext, SchemaStaticContext } from "../renderer/schema-context";

/**
 * A derived value as the shared `DerivedValue` shows it (B-024). A system whose derived values
 * come from its own engine (Fate) builds this itself; then only the first four are needed.
 */
export interface DerivedValueState {
  /** Shown: the override where there is one, else the auto value. */
  value: FormulaValue | undefined;
  /** This field's formula with its own override removed (others kept). */
  auto: FormulaValue | undefined;
  overridden: boolean;
  /** Absent on read-only hosts. */
  setOverride?: (value: FormulaValue) => void | Promise<void>;
  restore?: () => void | Promise<void>;
  fieldId?: string;
  resultType?: FormulaValueType;
  issues?: readonly FormulaLifecycleIssue[];
}

/** A derived value read from the template's formulas. */
export type ResolvedDerivedValue = DerivedValueState & {
  fieldId: string;
  resultType: FormulaValueType;
  issues: readonly FormulaLifecycleIssue[];
};

const snapshots = new WeakMap<CharacterFormulaRuntime, WeakMap<object, DerivedSnapshot>>();

/** One snapshot per (runtime, data), shared by every hook that reads it. */
function cachedSnapshot(runtime: CharacterFormulaRuntime, data: Record<string, unknown>): DerivedSnapshot {
  let byData = snapshots.get(runtime);
  if (!byData) {
    byData = new WeakMap();
    snapshots.set(runtime, byData);
  }
  let snapshot = byData.get(data);
  if (!snapshot) {
    snapshot = snapshotDerived(runtime, data);
    byData.set(data, snapshot);
  }
  return snapshot;
}

/** The character's data: a list row's whole character, not the row. */
function useCharacterData(): Record<string, unknown> | undefined {
  const context = useContext(SchemaDataContext);
  return context?.character ?? context?.data;
}

/** The character's derived values now; null without a formula runtime. */
export function useDerivedSnapshot(): DerivedSnapshot | null {
  const runtime = useContext(SchemaStaticContext)?.formulaRuntime;
  const data = useCharacterData();
  return runtime && data ? cachedSnapshot(runtime, data) : null;
}

/** One derived value with its auto value and override; null without a runtime or a derived program for it. */
export function useDerivedValue(fieldId: string): ResolvedDerivedValue | null {
  const host = useContext(SchemaStaticContext);
  const snapshot = useDerivedSnapshot();
  const runtime = host?.formulaRuntime;
  const onSet = host?.onSetDerivedOverride;
  const onRefresh = host?.onRefreshDerivedOverride;
  return useMemo(() => {
    const program = runtime?.artifact.programs.find(
      (candidate) => candidate.kind === "derived" && candidate.targetFieldId === fieldId,
    );
    if (!runtime || !program || !snapshot) return null;
    return {
      fieldId,
      value: snapshot.values[fieldId],
      auto: autoOf(snapshot, fieldId),
      overridden: Object.hasOwn(runtime.derivedOverrides, fieldId),
      resultType: program.resultType,
      issues: (snapshot.issues ?? []).filter((issue) => issue.targetFieldId === fieldId),
      setOverride: onSet ? (value: FormulaValue) => onSet(fieldId, value) : undefined,
      restore: onRefresh ? () => onRefresh(fieldId) : undefined,
    };
  }, [fieldId, runtime, snapshot, onSet, onRefresh]);
}

export { useIsOverridden } from "./use-is-overridden";
