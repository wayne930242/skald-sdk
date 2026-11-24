"use client";

import * as React from "react";
import type { CheckboxTrackField } from "@skald/types/schema";
import { useFieldValue, useFieldSetter, useFieldBlur, useSchema } from "../../schema-context";
import { registerFieldRenderer, type FieldRendererProps } from "../../registry";
import { TrackCell } from "../../primitives/track-cell";
import { useSchemaI18n } from "@skald/sheet-sdk/lib/i18n/use-schema-i18n";

export function CheckboxTrackFieldRenderer({
  field,
}: FieldRendererProps<CheckboxTrackField>) {
  const { resolveI18n } = useSchemaI18n();
  const { editable } = useSchema();
  const setValue = useFieldSetter();
  const onBlur = useFieldBlur();

  const valuePath = field.valuePath ?? field.id;
  const currentValue = useFieldValue<number>(valuePath) ?? 0;
  const boxes = field.boxes ?? 5;

  const handleBoxClick = (index: number) => {
    if (!editable) return;

    // If clicking on a checked box, uncheck it and all after
    // If clicking on an unchecked box, check it and all before
    const newValue = currentValue === index + 1 ? index : index + 1;
    setValue(valuePath, newValue);

    // Trigger save on click
    onBlur?.();
  };

  return (
    <div className="flex items-center gap-2 mr-4">
      <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">
        {resolveI18n(field.label)}
      </span>
      <div className="flex gap-0.5">
        {Array.from({ length: boxes }).map((_, index) => (
          <TrackCell
            key={index}
            size="sm"
            active={index < currentValue}
            disabled={!editable}
            onClick={() => handleBoxClick(index)}
            aria-label={`${resolveI18n(field.label)} ${index + 1}`}
          />
        ))}
      </div>
    </div>
  );
}

registerFieldRenderer("checkbox-track", CheckboxTrackFieldRenderer);
