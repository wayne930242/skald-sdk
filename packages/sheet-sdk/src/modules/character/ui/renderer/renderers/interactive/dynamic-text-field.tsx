"use client";

import * as React from "react";
import type { DynamicTextField } from "@skald/types/schema";
import { useFieldValue, useFieldSetter } from "../../schema-context";
import { registerFieldRenderer, type FieldRendererProps } from "../../registry";
import { useSchemaI18n } from "@skald/sheet-sdk/lib/i18n/use-schema-i18n";
import { cn } from "@skald/sheet-sdk/lib/utils";
import { Checkbox } from "@skald/sheet-sdk/components/ui/checkbox";

interface TakenAdvance {
  id: string;
  count: number;
}

export function DynamicTextFieldRenderer({
  field,
}: FieldRendererProps<DynamicTextField>) {
  const { resolveI18n } = useSchemaI18n();
  const setValue = useFieldSetter();

  // Get the source field value (e.g., selected playbook)
  const sourceField = field.sourceField || "playbook";
  const sourceValue = useFieldValue<string>(sourceField);

  // Get growth advances to check if unlocked (array format)
  const advancesPath = "growth.advances";
  const advances = useFieldValue<TakenAdvance[]>(advancesPath) ?? [];

  // Check unlock status - find the advance in the array
  const unlockAdvanceId = field.unlockedByAdvance;
  const foundAdvance = unlockAdvanceId
    ? advances.find((a) => a.id === unlockAdvanceId)
    : null;
  const unlockedCount = unlockAdvanceId ? (foundAdvance?.count ?? 0) : 1;

  // Get usage count
  const usagePath = field.usagePath || `${field.id}.used`;
  const usedCount = useFieldValue<number>(usagePath) ?? 0;

  // Get dynamic text content
  const keyPattern = field.i18nKeyPattern || "playbook.{value}.balanceMoment";
  const fallbackKey = field.fallbackKey || "growth.selectPlaybookFirst";
  const textContent = sourceValue
    ? resolveI18n(`{{i18n:${keyPattern.replace("{value}", sourceValue)}}}`)
    : resolveI18n(`{{i18n:${fallbackKey}}}`);

  // Don't render if not unlocked
  if (unlockedCount === 0) {
    return null;
  }

  const handleToggle = (index: number) => {
    // Toggle usage: if already used at this index, unmark it
    // if not used, mark it as used
    const newUsedCount = index < usedCount ? index : index + 1;
    setValue(usagePath, newUsedCount);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">{field.label}</span>
        <div className="flex items-center gap-1">
          {Array.from({ length: unlockedCount }).map((_, index) => (
            <Checkbox
              key={index}
              checked={index < usedCount}
              onCheckedChange={() => handleToggle(index)}
              className="h-4 w-4"
            />
          ))}
        </div>
      </div>
      <div
        className={cn(
          "text-xs leading-relaxed",
          field.displayStyle === "quote" &&
            "pl-3 border-l-2 border-muted-foreground/30 text-muted-foreground",
          field.displayStyle === "muted" && "text-muted-foreground",
        )}
      >
        {textContent}
      </div>
    </div>
  );
}

registerFieldRenderer("dynamic-text", DynamicTextFieldRenderer);
