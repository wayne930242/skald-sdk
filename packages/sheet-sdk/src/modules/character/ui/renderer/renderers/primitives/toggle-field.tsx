"use client";

import { Check } from "lucide-react";
import type { ToggleField } from "@skald/types/schema";
import { FieldIcon } from "../../primitives/field-icon";
import { registerFieldRenderer, type FieldRendererProps } from "../../registry";
import { useFieldSetter, useFieldValue, useSchemaStatic } from "../../schema-context";
import { useSchemaI18n } from "@skald/sheet-sdk/lib/i18n/use-schema-i18n";
import { cn } from "@skald/sheet-sdk/lib/utils";

export function ToggleFieldRenderer({ field }: FieldRendererProps<ToggleField>) {
  const value = useFieldValue<boolean>(field.id) === true;
  const setValue = useFieldSetter();
  const { editable } = useSchemaStatic();
  const { resolveI18n } = useSchemaI18n();
  const fieldLabel = resolveI18n(field.label);
  const stateLabel = resolveI18n(value ? field.onLabel : field.offLabel);

  return (
    <button
      type="button"
      disabled={!editable || field.readonly}
      aria-pressed={value}
      aria-label={fieldLabel || stateLabel || field.id}
      title={stateLabel}
      onClick={() => setValue(field.id, !value)}
      className={cn(
        "inline-flex items-center gap-1.5 align-top",
        // 純圖示開關多半排在輸入框旁（列表列用 items-start，窄螢幕直向堆疊不加高）：高度對齊單行輸入框，
        // 圖示才會落在第一行的垂直中心，文字長成多行時也不會往下飄
        !field.label && "sm:min-h-[1.9375rem]",
        value ? "text-foreground" : "text-muted-foreground",
      )}
    >
      <FieldIcon
        name={field.icon}
        fallback={Check}
        className={cn("h-4 w-4", value && "fill-current")}
      />
      {fieldLabel && <span>{fieldLabel}</span>}
    </button>
  );
}

registerFieldRenderer("toggle", ToggleFieldRenderer);
