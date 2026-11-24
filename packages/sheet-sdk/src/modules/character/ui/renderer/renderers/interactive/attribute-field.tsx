// modules/character/ui/renderer/renderers/interactive/attribute-field.tsx
"use client";

import type { AttributeField } from "@skald/types/schema";
import {
  useSchema,
  useFieldValue,
  useFieldSetter,
  useFieldBlur,
} from "@skald/sheet-sdk/modules/character/ui/renderer/schema-context";
import { SimpleStatInput } from "@skald/sheet-sdk/modules/character/ui/fields";
import { useSystemPluginUi } from "@skald/sheet-sdk/modules/systems/ui/system-plugin-provider";
import { registerFieldRenderer, type FieldRendererProps } from "../../registry";
import { useFieldDisplay } from "../../field-display";
import { useSheetMode } from "../../sheet-mode";
import { StatTile, TileNumberInput, getTileFractions } from "../../stat-tile";

/**
 * Generic attribute field renderer that adapts based on field configuration.
 *
 * - When showHalf or showFifth is true: Uses the registered fractional input with derived values
 * - Otherwise: Uses SimpleStatInput for a simple numeric input
 *
 * This allows the same field type to work for CoC7e (with half/fifth values)
 * and other systems that just need basic attributes.
 */
export function AttributeFieldRenderer({
  field,
}: FieldRendererProps<AttributeField>) {
  const value = useFieldValue<
    number | { value: number; half?: number; fifth?: number }
  >(field.id);
  const setValue = useFieldSetter();
  const onBlur = useFieldBlur();
  const { editable, data, handlers, setData } = useSchema();
  const display = useFieldDisplay();
  const mode = useSheetMode();
  const { legacySheet } = useSystemPluginUi();
  const FractionalAttributeInput = legacySheet?.fractionalAttributeInput;

  const numValue = typeof value === "object" ? value?.value : value;
  const needsDerivedValues = field.showHalf || field.showFifth;

  const handleChange = (newValue: number) => {
    // Only calculate and store derived values if needed
    let newFieldValue:
      | number
      | { value: number; half?: number; fifth?: number };

    if (needsDerivedValues) {
      // Calculate derived values (supports custom formulas in future)
      const half = Math.floor(newValue / 2);
      const fifth = Math.floor(newValue / 5);
      newFieldValue = { value: newValue, half, fifth };
    } else {
      // Simple systems: just store the number
      newFieldValue = newValue;
    }

    setValue(field.id, newFieldValue);

    if (field.onChange && handlers?.[field.onChange] && setData) {
      const updatedData = { ...data, [field.id]: newFieldValue };
      handlers[field.onChange](updatedData, setData);
    }
  };

  // views.web 的 display: "tile"：點一下擲骰，編輯模式才出現輸入框
  if (display === "tile") {
    const label = field.label || "";
    return (
      <StatTile
        fieldId={field.id}
        label={label}
        valueText={numValue === undefined ? "" : String(numValue)}
        {...getTileFractions(field, numValue)}
        input={
          editable && mode === "edit" ? (
            <TileNumberInput
              label={label}
              value={numValue}
              min={field.min}
              max={field.max}
              onChange={handleChange}
              onBlur={onBlur}
            />
          ) : undefined
        }
      />
    );
  }

  // Systems with half/fifth display (e.g., CoC7e)
  if (needsDerivedValues && FractionalAttributeInput) {
    return (
      <div className="group">
        <FractionalAttributeInput
          label={field.label || ""}
          value={numValue ?? 0}
          onChange={handleChange}
          onBlur={onBlur}
          showHalf={field.showHalf}
          showFifth={field.showFifth}
          editable={editable}
          size="sm"
        />
      </div>
    );
  }

  // Generic fallback for systems without derived values
  return (
    <div className="group">
      <SimpleStatInput
        label={field.label || ""}
        value={numValue ?? 0}
        onChange={(v) =>
          handleChange(typeof v === "number" ? v : parseInt(String(v), 10) || 0)
        }
        onBlur={onBlur}
        editable={editable}
        variant="boxed"
        size="sm"
        isNumber
      />
    </div>
  );
}

// Self-register
registerFieldRenderer("attribute", AttributeFieldRenderer);
