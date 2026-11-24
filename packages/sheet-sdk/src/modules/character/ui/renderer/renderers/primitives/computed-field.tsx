// modules/character/ui/renderer/renderers/primitives/computed-field.tsx
"use client";

import type { ComputedField } from "@skald/types/schema";
import { useFieldValue } from "@skald/sheet-sdk/modules/character/ui/renderer/schema-context";
import {
  SheetInput,
  type LabelPosition as SheetLabelPosition,
} from "@skald/sheet-sdk/modules/character/ui/fields";
import { registerFieldRenderer, type FieldRendererProps } from "../../registry";
import { useSchemaI18n } from "@skald/sheet-sdk/lib/i18n/use-schema-i18n";
import { useFieldDisplay } from "../../field-display";
import { StatTile } from "../../stat-tile";

export function ComputedFieldRenderer({
  field,
}: FieldRendererProps<ComputedField>) {
  const { resolveI18n } = useSchemaI18n();
  const value = useFieldValue<number | string | boolean>(field.id);
  const labelPosition = (field.labelPosition || "left") as SheetLabelPosition;
  const label = resolveI18n(field.label);
  const display = useFieldDisplay();

  // views.web 的 display: "tile"：唯讀數值磚，有 roll 時點一下就擲
  if (display === "tile") {
    return (
      <StatTile
        fieldId={field.id}
        label={label}
        valueText={String(value ?? "")}
      />
    );
  }

  // Compact top label layout
  if (labelPosition === "top") {
    return (
      <div className="flex flex-col items-center">
        <span className="text-3xs text-muted-foreground font-medium tracking-wide uppercase">
          {label}
        </span>
        <span className="text-lg font-bold bg-muted print:bg-transparent print:border-b print:border-black px-2 w-[62px] text-center">
          {String(value ?? "")}
        </span>
      </div>
    );
  }

  return (
    <SheetInput
      label={label}
      labelPosition={labelPosition}
      variant="underline"
      inputSize="md"
      textAlign="center"
      value={String(value ?? "")}
      displayOnly
      className="bg-muted/50"
    />
  );
}

// Self-register
registerFieldRenderer("computed", ComputedFieldRenderer);
