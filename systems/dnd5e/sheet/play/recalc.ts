"use client";

import { useCallback } from "react";
import { useTranslations } from "next-intl";
import type { FormulaValue } from "@skald/formula";
import { useSchemaI18n } from "@skald/sheet-sdk/lib/i18n/use-schema-i18n";
import { usePlay } from "./play-context";
import { signed } from "./play-model";

/** Derived values that read as a plain number, not a bonus (+3). */
export const NOT_SIGNED: ReadonlySet<string> = new Set(["ac", "hpMax", "hitDiceMax", "passivePerception", "spellSaveDc", "currentSpeed", "d20Penalty"]);

/** The edit triggers of a recalculation (B-024 q3): level and the ability scores. */
export const RECALC_TRIGGERS = ["level", "str", "dex", "con", "int", "wis", "cha"] as const;

/** A derived value's name (the schema's label) and its shown form, for the recalc notice. */
export function useDndRecalcText() {
  const tPlay = useTranslations("play");
  const { schema } = usePlay();
  const { resolveI18n } = useSchemaI18n();
  const label = useCallback((fieldId: string) => resolveI18n(schema.fields[fieldId]?.label ?? fieldId), [resolveI18n, schema]);
  const format = useCallback(
    (fieldId: string, value: FormulaValue | undefined) =>
      value === undefined
        ? "—"
        : typeof value !== "number"
          ? String(value)
          : fieldId === "currentSpeed"
            ? tPlay("feet", { value })
            : NOT_SIGNED.has(fieldId)
              ? String(value)
              : signed(value),
    [tPlay],
  );
  return { label, format };
}
