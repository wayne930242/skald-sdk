"use client";

import { useCallback } from "react";
import { useSchemaStatic } from "@skald/sheet-sdk/modules/character/ui/renderer/schema-context";
import { useRecalcChangeNotice } from "@skald/sheet-sdk/modules/character/ui/derived/use-recalc";
import { useDndRecalcText } from "./recalc";

/**
 * B-024: after a change the sheet makes itself (equipping, an item's +N), the notice of what it
 * recalculated, from the stored data before and after (the overrides whose auto value moved get
 * 恢復自動計算). Nothing without a formula runtime or when nothing moved.
 */
export function useDndRecalc(): (before: Record<string, unknown>, after: Record<string, unknown>) => void {
  const { formulaRuntime, onRefreshDerivedOverride } = useSchemaStatic();
  const notify = useRecalcChangeNotice();
  const { label, format } = useDndRecalcText();
  return useCallback(
    (before, after) => {
      if (!formulaRuntime) return;
      notify(
        { runtime: formulaRuntime, before, after },
        { label, format, restore: onRefreshDerivedOverride ? (fieldId) => onRefreshDerivedOverride(fieldId) : undefined },
      );
    },
    [formulaRuntime, onRefreshDerivedOverride, notify, label, format],
  );
}
