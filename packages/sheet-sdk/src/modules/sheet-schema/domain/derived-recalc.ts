import type { FormulaLifecycleIssue, FormulaValue } from "@skald/formula";
import { evaluateCharacterFormulaRuntime, type CharacterFormulaRuntime } from "./character-runtime";

/**
 * B-024: what the derived values are at one moment, so a change (level, equipment, an ability
 * score) can be shown as a recalculation. Plain records: a system whose derived values come from
 * its own engine (Fate's stress boxes) builds one itself.
 */
export interface DerivedSnapshot {
  /** Every derived value as shown: the override where there is one. */
  readonly values: Readonly<Record<string, FormulaValue>>;
  /** The auto value of each overridden id: its formula with only its own override removed. */
  readonly auto: Readonly<Record<string, FormulaValue>>;
  readonly overrides: Readonly<Record<string, FormulaValue>>;
  /** The evaluation's issues (a formula that failed), when the snapshot came from formulas. */
  readonly issues?: readonly FormulaLifecycleIssue[];
}

/**
 * One evaluation of the character's formulas, plus one per overridden id with that id's override
 * dropped (the others kept, so a value derived from another override stays as shown).
 */
export function snapshotDerived(runtime: CharacterFormulaRuntime, data: Record<string, unknown>): DerivedSnapshot {
  const { derivedValues: values, issues } = evaluateCharacterFormulaRuntime(runtime, data);
  const overrides = runtime.derivedOverrides;
  const auto: Record<string, FormulaValue> = {};
  for (const fieldId of Object.keys(overrides)) {
    const rest = { ...overrides };
    delete rest[fieldId];
    const value = evaluateCharacterFormulaRuntime({ ...runtime, derivedOverrides: rest }, data).derivedValues[fieldId];
    if (value !== undefined) auto[fieldId] = value;
  }
  return { values, auto, overrides: { ...overrides }, issues };
}

/** The value a field would have without its override. */
export function autoOf(snapshot: DerivedSnapshot, fieldId: string): FormulaValue | undefined {
  return Object.hasOwn(snapshot.auto, fieldId) ? snapshot.auto[fieldId] : snapshot.values[fieldId];
}

export type RecalcRow =
  | { kind: "changed"; fieldId: string; before: FormulaValue | undefined; after: FormulaValue | undefined }
  | {
      kind: "overridden";
      fieldId: string;
      override: FormulaValue;
      autoBefore: FormulaValue | undefined;
      autoAfter: FormulaValue | undefined;
    }
  /** Marked beyond a new capacity, and kept (Fate's stress or consequences). */
  | { kind: "keptOutOfCap"; fieldId: string; kept: number; cap: number };

/**
 * What a recalculation changed (B-024, q4 moved-only). An id overridden after the change is
 * listed only when its auto value moved; any other id when its shown value moved. Order is
 * `only`, else the derived values' order after the change.
 */
export function diffDerived(
  before: DerivedSnapshot,
  after: DerivedSnapshot,
  options: { only?: readonly string[] } = {},
): RecalcRow[] {
  const ids = options.only ?? [...new Set([...Object.keys(after.values), ...Object.keys(before.values)])];
  const rows: RecalcRow[] = [];
  for (const fieldId of ids) {
    if (Object.hasOwn(after.overrides, fieldId)) {
      const autoBefore = autoOf(before, fieldId);
      const autoAfter = autoOf(after, fieldId);
      if (autoBefore !== autoAfter) {
        rows.push({ kind: "overridden", fieldId, override: after.overrides[fieldId], autoBefore, autoAfter });
      }
      continue;
    }
    const was = before.values[fieldId];
    const now = after.values[fieldId];
    if (was !== now) rows.push({ kind: "changed", fieldId, before: was, after: now });
  }
  return rows;
}

/** A "kept, out of cap" row when more is marked than the new capacity holds; null otherwise. */
export function outOfCapRow(fieldId: string, kept: number, cap: number): RecalcRow | null {
  return kept > cap ? { kind: "keptOutOfCap", fieldId, kept, cap } : null;
}
