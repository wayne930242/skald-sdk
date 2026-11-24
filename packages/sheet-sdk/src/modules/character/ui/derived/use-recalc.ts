"use client";

import { useCallback, useContext, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import type { CharacterFormulaRuntime, DerivedSnapshot, RecalcRow } from "@skald/sheet-sdk/modules/sheet-schema";
import { SchemaDataContext, SchemaStaticContext } from "../renderer/schema-context";
import { useSheetMode } from "../renderer/sheet-mode";
import type { RecalcDataChange, RecalcNoticeInput, RecalcText } from "./recalc-notice";

export type { RecalcDataChange, RecalcNoticeInput } from "./recalc-notice";

let presenter: Promise<typeof import("./recalc-notice")> | null = null;
const loadPresenter = () => (presenter ??= import("./recalc-notice"));

/** Shows the shared recalculation notice; nothing for no rows. The notice loads on first use. */
export function useRecalcNotice(): (input: RecalcNoticeInput) => void {
  const t = useTranslations("characters.derived");
  return useCallback(
    (input: RecalcNoticeInput) => {
      if (input.rows.length === 0) return;
      void loadPresenter().then((module) => module.showRecalcNotice(input, t as unknown as RecalcText));
    },
    [t],
  );
}

/**
 * The notice for a change of the stored data: the formulas run over `before` and `after` in the
 * lazily loaded notice module, so callers carry no snapshot code. Nothing when nothing moved.
 */
export function useRecalcChangeNotice(): (change: RecalcDataChange, input: Omit<RecalcNoticeInput, "rows">) => void {
  const t = useTranslations("characters.derived");
  return useCallback(
    (change: RecalcDataChange, input: Omit<RecalcNoticeInput, "rows">) => {
      void loadPresenter().then((module) => module.showRecalcChange(change, input, t as unknown as RecalcText));
    },
    [t],
  );
}

export interface RecalcOnEditExitOptions {
  /** Raw inputs whose change in edit mode prompts a recalculation (`level`, `str` …). */
  triggers: readonly string[];
  label: RecalcNoticeInput["label"];
  format?: RecalcNoticeInput["format"];
  /** A system's own derived values (Fate); default: the template's formulas over the stored data. */
  snapshot?: () => DerivedSnapshot | null;
  /** A system's own trigger inputs; default: the stored data at each trigger id. */
  triggerValues?: () => Record<string, unknown>;
  /**
   * Rows a system adds after the diff (Fate's harm kept over a new capacity, `outOfCapRow`), read
   * on leaving edit mode once a trigger changed.
   */
  extraRows?: () => readonly RecalcRow[];
  /** A system's own 恢復自動計算 (Fate's `fateV2` override); default: the host's template restore. */
  restore?: (fieldId: string) => void | Promise<void>;
}

function same(a: Record<string, unknown>, b: Record<string, unknown>, keys: readonly string[]): boolean {
  return keys.every((key) => JSON.stringify(a[key]) === JSON.stringify(b[key]));
}

/**
 * B-024 q3: one notice on leaving edit mode, only when a trigger input changed while editing.
 * Snapshots when the sheet enters edit mode and diffs on leaving it; a read-only host never
 * prompts, and a change that arrived while in play mode (another player, another tab) does not
 * count, since the snapshot is taken on entering edit mode.
 */
export function useRecalcOnEditExit(options: RecalcOnEditExitOptions): void {
  const mode = useSheetMode();
  const host = useContext(SchemaStaticContext);
  const dataContext = useContext(SchemaDataContext);
  const data = dataContext?.character ?? dataContext?.data;
  const t = useTranslations("characters.derived");
  const latest = useRef({ options, host, data, t });
  useEffect(() => {
    latest.current = { options, host, data, t };
  });
  // A system's own snapshot (Fate) is taken here; the template's formulas keep the runtime and
  // data, and run in the notice module only when a trigger changed.
  const entered = useRef<{
    snapshot?: DerivedSnapshot | null;
    template?: { runtime: CharacterFormulaRuntime; data: Record<string, unknown> };
    triggers: Record<string, unknown>;
  } | null>(null);

  useEffect(() => {
    const { options: current, host: schema, data: stored, t: text } = latest.current;
    const writable = !!schema?.editable;
    const runtime = schema?.formulaRuntime;
    const triggerValues = () =>
      current.triggerValues
        ? current.triggerValues()
        : Object.fromEntries(current.triggers.map((id) => [id, stored?.[id]]));
    if (mode === "edit") {
      entered.current = !writable
        ? null
        : current.snapshot
          ? { snapshot: current.snapshot(), triggers: triggerValues() }
          : runtime && stored
            ? { template: { runtime, data: stored }, triggers: triggerValues() }
            : null;
      return;
    }
    const before = entered.current;
    entered.current = null;
    if (!before || !writable) return;
    const now = triggerValues();
    if (same(before.triggers, now, Object.keys({ ...before.triggers, ...now }))) return;
    const restore = schema?.onRefreshDerivedOverride;
    const extraRows = current.extraRows?.();
    const input = {
      label: current.label,
      format: current.format,
      restore: current.restore ?? (restore ? (fieldId: string) => restore(fieldId) : undefined),
      ...(extraRows ? { extraRows } : {}),
    };
    // The diff runs in the notice module, loaded here on first use
    if (current.snapshot) {
      const after = current.snapshot();
      const was = before.snapshot;
      if (was && after) void loadPresenter().then((module) => module.showRecalcSnapshots(was, after, input, text as unknown as RecalcText));
      return;
    }
    const template = before.template;
    if (!template || !runtime || !stored) return;
    void loadPresenter().then((module) =>
      module.showRecalcChange({ runtime, runtimeBefore: template.runtime, before: template.data, after: stored }, input, text as unknown as RecalcText),
    );
  }, [mode]);
}
