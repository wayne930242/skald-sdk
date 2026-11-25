// modules/character/ui/renderer/renderers/interactive/multi-select-field.tsx
"use client";

import * as React from "react";
import { cn } from "@skald/sheet-sdk/lib/utils";
import type { MultiSelectField } from "@skald/types/schema";
import { useFieldValue, useFieldSetter, useSchema } from "../../schema-context";
import { registerFieldRenderer, type FieldRendererProps } from "../../registry";
import { Check } from "lucide-react";
import { useSchemaI18n } from "@skald/sheet-sdk/lib/i18n/use-schema-i18n";

/**
 * Multi-Select Field Renderer
 *
 * Renders a field that allows selecting multiple options from a list.
 * Used for things like picking one or two backgrounds from a list.
 *
 * Features:
 * - Configurable min/max selections
 * - Multiple layout options (list, chips, grid)
 * - Visual indication of selected state
 * - Disabled state when max selections reached
 */
export function MultiSelectFieldRenderer({
  field,
}: FieldRendererProps<MultiSelectField>) {
  const selected = useFieldValue<string[]>(field.id) ?? [];
  const setValue = useFieldSetter();
  const { editable } = useSchema();
  const { resolveI18n } = useSchemaI18n();

  const displayStyle = field.displayStyle ?? "list";
  const canSelectMore =
    !field.maxSelected || selected.length < field.maxSelected;

  // Check if we can deselect (won't violate minSelected)
  const canDeselect = !field.minSelected || selected.length > field.minSelected;

  const handleToggle = (optionId: string) => {
    if (!editable) return;

    setValue(field.id, (prevValue: unknown) => {
      const prevSelected = (prevValue as string[]) ?? [];
      const isSelected = prevSelected.includes(optionId);
      if (isSelected) {
        // Can always deselect unless minSelected would be violated
        if (field.minSelected && prevSelected.length <= field.minSelected) {
          return prevSelected;
        }
        return prevSelected.filter((id) => id !== optionId);
      }
      if (field.maxSelected && prevSelected.length >= field.maxSelected) {
        return prevSelected;
      }
      return [...prevSelected, optionId];
    });
  };

  return (
    <div
      className={cn(
        "flex gap-2",
        displayStyle === "list" && "flex-col",
        displayStyle === "chips" && "flex-wrap",
        displayStyle === "grid" && "grid grid-cols-2 gap-1",
      )}
    >
      {field.options.map((option) => {
        const isSelected = selected.includes(option.id);
        // Disabled if: not editable, can't select more, OR can't deselect this item
        const isDisabled =
          !editable ||
          (!isSelected && !canSelectMore) ||
          (isSelected && !canDeselect);

        return (
          <button
            key={option.id}
            type="button"
            onClick={() => handleToggle(option.id)}
            disabled={isDisabled}
            className={cn(
              "flex items-center gap-2 rounded-md text-sm transition-colors text-left",
              displayStyle === "grid" ? "px-2 py-1.5" : "px-3 py-2",
              isSelected ? "bg-primary text-primary-foreground" : "hover:bg-muted",
              isDisabled && "opacity-50 cursor-not-allowed",
            )}
          >
            {isSelected && <Check className="h-4 w-4 shrink-0" />}
            <div className="flex flex-col">
              <span>{resolveI18n(option.label)}</span>
              {option.description && (
                <span
                  className={cn(
                    "text-xs",
                    isSelected
                      ? "text-primary-foreground/80"
                      : "text-muted-foreground",
                  )}
                >
                  {resolveI18n(option.description)}
                </span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// Self-register
registerFieldRenderer("multi-select", MultiSelectFieldRenderer);
