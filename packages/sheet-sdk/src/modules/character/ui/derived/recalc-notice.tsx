"use client";

import { toast } from "sonner";
import type { FormulaValue } from "@skald/formula";
import { diffDerived, snapshotDerived, type CharacterFormulaRuntime, type DerivedSnapshot, type RecalcRow } from "@skald/sheet-sdk/modules/sheet-schema";

/** `characters.derived` strings, resolved by the caller's hook (this module loads on first use). */
export type RecalcText = (key: "recalc.title" | "recalc.changed" | "recalc.overridden" | "recalc.keptOutOfCap" | "recalc.restore", values?: Record<string, string | number>) => string;

export interface RecalcNoticeInput {
  rows: readonly RecalcRow[];
  /** The value's name in the caller's catalog (a schema label, a system string). */
  label: (fieldId: string) => string;
  format?: (fieldId: string, value: FormulaValue | undefined) => string;
  /** A 恢復自動計算 button on each "overridden" row. */
  restore?: (fieldId: string) => void | Promise<void>;
}

const plain = (_fieldId: string, value: FormulaValue | undefined) =>
  value === undefined ? "—" : String(value);

function RecalcRows({ rows, label, format = plain, restore, text, done }: RecalcNoticeInput & { text: RecalcText; done: () => void }) {
  return (
    <ul className="mt-1 space-y-1" data-recalc-notice>
      {rows.map((row) => (
        <li key={`${row.kind}:${row.fieldId}`} className="flex flex-wrap items-center gap-x-2" data-recalc-row={row.kind}>
          <span>
            {row.kind === "changed"
              ? text("recalc.changed", { name: label(row.fieldId), before: format(row.fieldId, row.before), after: format(row.fieldId, row.after) })
              : row.kind === "overridden"
                ? text("recalc.overridden", {
                    name: label(row.fieldId),
                    value: format(row.fieldId, row.override),
                    before: format(row.fieldId, row.autoBefore),
                    after: format(row.fieldId, row.autoAfter),
                  })
                : text("recalc.keptOutOfCap", { name: label(row.fieldId), kept: row.kept, cap: row.cap })}
          </span>
          {row.kind === "overridden" && restore && (
            <button
              type="button"
              className="rounded-md border border-border px-2 py-0.5 text-xs font-medium hover:bg-muted"
              onClick={() => {
                void restore(row.fieldId);
                done();
              }}
            >
              {text("recalc.restore")}
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * The shared recalculation notice (B-024 「升級或換裝後要提示重算」): one toast listing the values
 * that changed, the overrides whose auto value moved (with 恢復自動計算), and what was kept over
 * a new capacity. Loaded on first use by `useRecalcNotice`.
 */
/** The stored data before and after a change, diffed here so the snapshot code loads with the notice. */
export interface RecalcDataChange {
  runtime: CharacterFormulaRuntime;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  /** The runtime before the change, when it differs (an override set while editing). */
  runtimeBefore?: CharacterFormulaRuntime;
}

/** A notice built from a diff, with rows the caller adds after it (Fate's harm kept over a capacity). */
export type RecalcDiffInput = Omit<RecalcNoticeInput, "rows"> & { extraRows?: readonly RecalcRow[] };

export function showRecalcChange(change: RecalcDataChange, input: RecalcDiffInput, text: RecalcText): void {
  showRecalcSnapshots(snapshotDerived(change.runtimeBefore ?? change.runtime, change.before), snapshotDerived(change.runtime, change.after), input, text);
}

/** A system's own snapshots (Fate), diffed here. */
export function showRecalcSnapshots(before: DerivedSnapshot, after: DerivedSnapshot, { extraRows, ...input }: RecalcDiffInput, text: RecalcText): void {
  const rows = diffDerived(before, after);
  showRecalcNotice({ ...input, rows: extraRows ? [...rows, ...extraRows] : rows }, text);
}

export function showRecalcNotice(input: RecalcNoticeInput, text: RecalcText): void {
  if (input.rows.length === 0) return;
  const hasRestore = !!input.restore && input.rows.some((row) => row.kind === "overridden");
  const id = toast(text("recalc.title"), {
    description: <RecalcRows {...input} text={text} done={() => toast.dismiss(id)} />,
    // A restore button stays until used or closed
    duration: hasRestore ? Infinity : 8000,
    closeButton: hasRestore,
  });
}
