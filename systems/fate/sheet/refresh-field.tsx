"use client";

import * as React from "react";
import type { FateRefreshField, FateStunt } from "@skald/types/schema";
import { useFieldValue, useSchema } from "@skald/sheet-sdk/modules/character/ui/renderer/schema-context";
import type { FieldRendererProps } from "@skald/sheet-sdk/modules/systems/ui/system-plugin-ui";
import { useSchemaI18n } from "@skald/sheet-sdk/lib/i18n/use-schema-i18n";
import { useSystemOptional } from "@skald/sheet-sdk/components/providers/system-provider";
import { evaluateCondition } from "@skald/sheet-sdk/lib/condition-utils";
import { readFateResources } from "../domain/normalize";

interface StuntsData {
  stunts: FateStunt[];
}

export function FateRefreshFieldRenderer({
  field,
}: FieldRendererProps<FateRefreshField>) {
  const { resolveI18n, t } = useSchemaI18n();
  const system = useSystemOptional();
  const { data: character, schema } = useSchema();
  const resources = system?.systemId === "fate-condensed" && system.builtinTemplate === true && field.id === "refresh"
    ? readFateResources(character) : undefined;
  // The immutable v1 layout hides the old extra slot below +5. Keep an occupied
  // slot visible here when that version's consequence field would hide it.
  const legacyExtraMild = resources && !schema.fields.fateV2 &&
    !evaluateCondition("{{skills:physique >= 5 || skills:will >= 5}}", character) &&
    typeof character.extraMildConsequence === "string" ? character.extraMildConsequence : "";

  // Get stunts data to calculate refresh
  const stuntsPath = field.stuntsField || "stunts";
  const stuntsData = useFieldValue<StuntsData>(stuntsPath);
  const stuntCount = stuntsData?.stunts?.length ?? 0;

  const baseRefresh = field.baseRefresh ?? 3;
  const freeStunts = field.freeStunts ?? 3;

  // Calculate refresh: base - (stunts over free)
  const refreshCost = Math.max(0, stuntCount - freeStunts);
  const calculatedRefresh = Math.max(1, baseRefresh - refreshCost);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="w-16 h-16 rounded-full border-2 border-foreground print:border-black flex items-center justify-center">
        <span className="text-3xl font-bold">{resources?.effectiveRefresh ?? calculatedRefresh}</span>
      </div>
      {/* 與其他欄位標籤同一語彙；原本的黑底白字只在這裡出現過 */}
      <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">
        {resolveI18n(field.label || "{{i18n:field.refresh}}")}
      </span>
      {resources && (
        <span className="flex items-baseline gap-2">
          <span className="text-xs font-medium text-muted-foreground">{t("field.fatePoints")}</span>
          <span className="text-xl font-bold">{resources.fatePoints}</span>
        </span>
      )}
      {legacyExtraMild.trim() && (
        <p className="basis-full text-sm">
          {t("field.legacyExtraMildNotice", { injury: legacyExtraMild })}
        </p>
      )}
    </div>
  );
}

// Self-register
