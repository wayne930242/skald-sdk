// modules/character/ui/renderer/renderers/lists/checklist-field.tsx
"use client";

import * as React from "react";
import { cn } from "@skald/sheet-sdk/lib/utils";
import type { ChecklistField, ChecklistItemState } from "@skald/types/schema";
import { useFieldValue, useFieldSetter, useSchema } from "../../schema-context";
import { registerFieldRenderer, type FieldRendererProps } from "../../registry";
import { Check, X, Circle } from "lucide-react";
import { useSchemaI18n } from "@skald/sheet-sdk/lib/i18n/use-schema-i18n";

type ChecklistData = Record<string, ChecklistItemState>;

const DEFAULT_STATES: ChecklistItemState[] = ["unchecked", "checked"];

export function ChecklistFieldRenderer({
  field,
}: FieldRendererProps<ChecklistField>) {
  const data = useFieldValue<ChecklistData>(field.id) ?? {};
  const setValue = useFieldSetter();
  const { editable } = useSchema();
  const { resolveI18n } = useSchemaI18n();
  const editableLabels = field.editableLabels ?? false;
  const labelPath = field.labelPath ?? `${field.id}Labels`;
  const customLabels = useFieldValue<Record<string, string>>(labelPath) ?? {};

  const states = field.states ?? DEFAULT_STATES;
  const direction = field.direction ?? "vertical";
  const columns = field.columns;

  const getNextState = (
    currentState: ChecklistItemState,
  ): ChecklistItemState => {
    const currentIndex = states.indexOf(currentState);
    const nextIndex = (currentIndex + 1) % states.length;
    return states[nextIndex];
  };

  const checkedCount = Object.values(data).filter(
    (s) => s === "checked" || s === "completed",
  ).length;

  const canCheck = !field.maxChecked || checkedCount < field.maxChecked;

  const handleItemClick = (itemId: string) => {
    if (!editable) return;

    setValue(field.id, (prevValue: unknown) => {
      const prevData = (prevValue as ChecklistData) ?? {};
      const currentState = prevData[itemId] ?? "unchecked";

      if (field.cycleStates) {
        return { ...prevData, [itemId]: getNextState(currentState) };
      }

      // Simple toggle between unchecked and checked
      if (currentState === "unchecked") {
        const checkedCount = Object.values(prevData).filter(
          (s) => s === "checked" || s === "completed",
        ).length;
        if (field.maxChecked && checkedCount >= field.maxChecked) return prevData;
        return { ...prevData, [itemId]: "checked" };
      } else if (currentState === "checked") {
        return { ...prevData, [itemId]: "unchecked" };
      }
      return prevData;
    });
  };

  const handleLabelChange = (itemId: string, label: string) => {
    if (!editable || !editableLabels) return;
    setValue(labelPath, (prevValue: unknown) => ({
      ...((prevValue as Record<string, string>) ?? {}),
      [itemId]: label,
    }));
  };

  const renderStateIcon = (state: ChecklistItemState) => {
    switch (state) {
      case "checked":
        return <Check className="h-4 w-4 text-primary" />;
      case "completed":
        return <Check className="h-4 w-4 text-success" />;
      case "crossed":
        return <X className="h-4 w-4 text-destructive" />;
      default:
        return <Circle className="h-4 w-4 text-muted-foreground" />;
    }
  };

  return (
    <div
      className={cn(
        columns
          ? "grid gap-x-3"
          : cn("flex gap-2", direction === "vertical" ? "flex-col" : "flex-wrap"),
      )}
      style={columns ? { gridTemplateColumns: `repeat(${columns}, 1fr)` } : undefined}
    >
      {field.items.map((item) => {
        const state = data[item.id] ?? "unchecked";
        const isDisabled = !editable || (state === "unchecked" && !canCheck);

        if (editableLabels) {
          const customLabel = customLabels[item.id] ?? "";

          return (
            <div
              key={item.id}
              className={cn(
                "flex items-center gap-2 py-1.5 transition-colors border-b border-border/40",
                state === "checked" && "bg-primary/5",
                state === "completed" &&
                  "bg-success/10 opacity-60",
                state === "crossed" && "bg-destructive/10",
                !isDisabled && "hover:bg-muted",
              )}
            >
              <button
                type="button"
                aria-label={customLabel || resolveI18n(item.label) || undefined}
                aria-pressed={state === "checked" || state === "completed"}
                onClick={() => handleItemClick(item.id)}
                disabled={isDisabled}
                className={cn(
                  "mt-0.5 shrink-0",
                  isDisabled && "opacity-50 cursor-not-allowed",
                )}
              >
                {renderStateIcon(state)}
              </button>
              <input
                type="text"
                value={customLabel}
                onChange={(event) =>
                  handleLabelChange(item.id, event.target.value)
                }
                readOnly={!editable}
                aria-label={resolveI18n(item.label) || undefined}
                placeholder={resolveI18n(item.label)}
                className={cn(
                  "w-full bg-transparent border-b border-muted-foreground/30 px-1 py-0.5 text-sm outline-none",
                  "focus:border-primary",
                  !editable && "opacity-70",
                )}
              />
            </div>
          );
        }

        const itemDescription = item.description ? resolveI18n(item.description) : undefined;

        return (
          <button
            key={item.id}
            onClick={() => handleItemClick(item.id)}
            disabled={isDisabled}
            className={cn(
              "flex items-start gap-2 rounded-md text-left transition-colors",
              direction === "horizontal" ? "px-3 py-1.5" : "px-2 py-1.5",
              state === "checked" && "bg-primary/8",
              state === "completed" && "bg-success/10 line-through opacity-60",
              state === "crossed" && "bg-destructive/10 line-through",
              isDisabled && "opacity-50 cursor-not-allowed",
              !isDisabled && "hover:bg-muted cursor-pointer",
            )}
          >
            <span className="mt-0.5 shrink-0">{renderStateIcon(state)}</span>
            <span className="flex flex-col gap-0.5">
              <span className="text-sm">{resolveI18n(item.label)}</span>
              {itemDescription && (
                <span className="text-xs text-muted-foreground leading-snug">{itemDescription}</span>
              )}
            </span>
          </button>
        );
      })}

    </div>
  );
}

// Self-register
registerFieldRenderer("checklist", ChecklistFieldRenderer);
