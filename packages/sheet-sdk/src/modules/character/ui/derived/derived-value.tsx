"use client";

import { useState, type KeyboardEvent } from "react";
import { RotateCcw } from "lucide-react";
import { InfoTip } from "@skald/sheet-sdk/components/ui/info-tip";
import { useTranslations } from "next-intl";
import type { FormulaValue } from "@skald/formula";
import { cn } from "@skald/sheet-sdk/lib/utils";
import { useDerivedValue, type DerivedValueState } from "./use-derived-value";

export type { DerivedValueState } from "./use-derived-value";

/** "auto-only": a value the rules derive and nobody overrides (Fate's stress boxes). */
export type DerivedValueMode = "overridable" | "auto-only";

/** An override an editor saves on 儲存; `value` absent = restore the auto value. */
export interface StagedOverride {
  readonly value?: FormulaValue;
  readonly apply: () => void | Promise<void>;
}

/** Overrides an editor collects until its 儲存 (CoC's `useCocOverrideDraft`, shared). */
export function useStagedOverrides() {
  const [changes, setChanges] = useState<Record<string, StagedOverride>>({});
  return {
    changes,
    stage: (fieldId: string, change: StagedOverride) => setChanges((previous) => ({ ...previous, [fieldId]: change })),
    clear: () => setChanges({}),
    save: () => {
      for (const change of Object.values(changes)) void change.apply();
    },
  };
}

interface DerivedValueDisplayProps {
  label: string;
  /** Shown when the card has no formula runtime (a preview): the value without overrides. */
  fallback?: number | string;
  /** The displayed form of a value (CoC's Pulp HP × 2, D&D's signed bonus). */
  display?: (value: number | string) => number | string;
  /** Numbers only, rounded (default). An override of a text value (CoC's damage bonus) is text. */
  numeric?: boolean;
  /** Editors that save on 儲存: the change goes here instead of to the host. */
  stage?: (fieldId: string, change: StagedOverride) => void;
  staged?: StagedOverride;
  mode?: DerivedValueMode;
  /** The auto value beside an override (自動計算：15). Default true. */
  showAuto?: boolean;
}

export interface DerivedValueProps extends DerivedValueDisplayProps {
  /** The derived value's formula target (`ac`, `hp_max`). */
  fieldId: string;
}

export interface DerivedValueViewProps extends DerivedValueDisplayProps {
  fieldId: string;
  /** Null: the card has no formula runtime; the fallback shows with 這張卡不能覆寫. */
  state: DerivedValueState | null;
}

/**
 * A derived value with its override (B-024 「被覆寫的數值要標示出來」): the value, a marker when the
 * player set it, the auto value beside it, an input that overrides it and 恢復自動計算. It reads and
 * writes the template's derived overrides through the host; read-only hosts get no input.
 * Strings come from `characters.derived` only; the label is the caller's.
 */
export function DerivedValue({ fieldId, ...props }: DerivedValueProps) {
  return <DerivedValueView fieldId={fieldId} state={useDerivedValue(fieldId)} {...props} />;
}

/** The presentational half of `DerivedValue`, for a system that brings its own state (plan §8). */
export function DerivedValueView({
  fieldId,
  state,
  label,
  fallback,
  display = (value) => value,
  numeric = true,
  stage,
  staged,
  mode = "overridable",
  showAuto = true,
}: DerivedValueViewProps) {
  const t = useTranslations("characters.derived");
  const [draft, setDraft] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const shown = (raw: FormulaValue | undefined) =>
    raw === undefined || typeof raw === "boolean" ? undefined : display(raw);
  const raw = state?.value;
  const value = shown(raw) ?? (state ? undefined : fallback);
  const overridable = mode === "overridable";
  const overridden = overridable && (staged ? staged.value !== undefined : state?.overridden === true);
  const autoShown = shown(state?.auto);
  const setOverride = overridable ? state?.setOverride : undefined;
  const restore = overridable ? state?.restore : undefined;
  const canWrite = !!setOverride && !pending;

  const run = async (action: () => void | Promise<void>) => {
    setPending(true);
    try {
      await action();
    } finally {
      setPending(false);
    }
  };
  const apply = (change: StagedOverride) => {
    if (stage) stage(fieldId, change);
    else void run(change.apply);
  };
  const commit = () => {
    const text = draft?.trim() ?? "";
    setDraft(null);
    if (!setOverride || text === "") return;
    if (numeric) {
      const number = Number(text);
      if (!Number.isFinite(number) || Math.round(number) === (staged?.value ?? raw)) return;
      const next = Math.round(number);
      apply({ value: next, apply: () => setOverride(next) });
    } else if (text !== (staged?.value ?? raw)) {
      apply({ value: text, apply: () => setOverride(text) });
    }
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") commit();
    if (event.key === "Escape") setDraft(null);
  };

  const status = !overridable ? null : overridden ? t("overridden") : state ? t("auto") : t("noRuntime");

  return (
    <div
      className="flex min-h-11 items-center justify-between gap-2"
      data-derived-value={fieldId}
      data-overridden={overridden || undefined}
      data-derived-mode={mode}
    >
      <div className="min-w-0">
        <p className="font-medium">
          {label}
        </p>
        {status !== null && (
        <p className={cn("text-xs", overridden ? "font-medium text-amber-700 dark:text-amber-300" : "text-muted-foreground")}>
          {status}
          {overridden && showAuto && autoShown !== undefined && (
            <span className="ms-2 font-normal text-muted-foreground">{t("autoValue", { value: autoShown })}</span>
          )}
        </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {/* Beside the value, not the label, so a long label keeps its width. */}
        {!overridable && <InfoTip label={t("fixed")}>{t("fixed")}</InfoTip>}
        {canWrite || draft !== null ? (
          <input
            type={numeric ? "number" : "text"}
            inputMode={numeric ? "numeric" : undefined}
            aria-label={t("input", { name: label })}
            className={cn(
              "h-11 w-20 rounded-md border bg-background text-center text-lg font-semibold tabular-nums",
              overridden ? "border-amber-500/70" : "border-border",
            )}
            value={draft ?? String(staged?.value ?? (typeof raw === "boolean" ? undefined : raw) ?? value ?? "")}
            onFocus={() => setDraft(String(staged?.value ?? raw ?? value ?? ""))}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            onKeyDown={onKeyDown}
            disabled={pending}
          />
        ) : (
          <span className="min-w-12 text-center text-lg font-semibold tabular-nums">{value ?? "—"}</span>
        )}
        {restore && (
          <button
            type="button"
            className="inline-flex size-11 items-center justify-center rounded-md text-muted-foreground hover:bg-muted disabled:opacity-30"
            aria-label={t("restore", { name: label })}
            title={t("restore", { name: label })}
            disabled={!overridden || pending}
            onClick={() => apply({ apply: () => restore() })}
          >
            <RotateCcw className="size-4" aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}
