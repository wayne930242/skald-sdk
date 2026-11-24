// modules/character/ui/renderer/renderers/primitives/select-field.tsx
"use client";

import { useMemo } from "react";
import type { SelectField, SelectOption } from "@skald/types/schema";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@skald/sheet-sdk/components/ui/select";
import { SheetInput } from "@skald/sheet-sdk/modules/character/ui/fields";
import {
  useSchema,
  useFieldValue,
  useFieldSetter,
  useFieldBlur,
  useViewMode,
  type OptionSources,
} from "@skald/sheet-sdk/modules/character/ui/renderer/schema-context";
import { registerFieldRenderer, type FieldRendererProps } from "../../registry";
import { useSchemaI18n } from "@skald/sheet-sdk/lib/i18n/use-schema-i18n";
import { cn } from "@skald/sheet-sdk/lib/utils";

const EMPTY_OPTION_VALUE = "__empty__";
const missingOptionModuleWarnings = new Set<string>();

/**
 * Resolve a `select` field's option list: static `options` array first, then
 * an `optionModule` lookup against `optionSources` (with a system-prefix-
 * stripping fallback, e.g. "coc7e-occupations" -> "occupations"), else empty.
 * Shared with the macro-trigger-button renderer's `optionSource` resolution
 * so both consumers agree on the same priority/fallback order.
 */
export function resolveSelectFieldOptions(
  field: Pick<SelectField, "options" | "optionModule">,
  optionSources: OptionSources | undefined,
): SelectOption[] {
  if (Array.isArray(field.options) && field.options.length > 0) {
    return field.options;
  }

  if (field.optionModule && optionSources) {
    let source = optionSources[field.optionModule];

    if (!source) {
      const parts = field.optionModule.split("-");
      if (parts.length > 1) {
        const shortKey = parts.slice(1).join("-");
        source = optionSources[shortKey];
      }
    }

    if (Array.isArray(source)) {
      return source as SelectOption[];
    }
  }

  return [];
}

/**
 * Selects whose custom value shows a name typed into a companion text field,
 * by select field id: the value that means "custom" and the field holding
 * the name.
 */
const SELECT_CUSTOM_NAMES: Readonly<Record<string, { value: string; nameField: string }>> = {
  occupation: { value: "__custom__", nameField: "customOccupationName" },
};

/**
 * The companion text field whose typed name a `select` shows for `value`,
 * or undefined when the select shows an option (or the value) instead.
 */
export function selectCustomNameField(
  field: Pick<SelectField, "id">,
  value: unknown,
): string | undefined {
  const custom = Object.hasOwn(SELECT_CUSTOM_NAMES, field.id)
    ? SELECT_CUSTOM_NAMES[field.id]
    : undefined;
  return custom && value === custom.value ? custom.nameField : undefined;
}

/**
 * The text a `select` field shows for `value`: an option's label, the value
 * itself when no option names it, and for a custom value the name typed into
 * its companion field (`selectCustomNameField`). Shared with the character
 * wizard's summary so both read a value the same way.
 */
export function selectFieldDisplayLabel(
  field: Pick<SelectField, "id">,
  value: string | undefined,
  data: Record<string, unknown>,
  options: readonly SelectOption[],
  resolveI18n: (text: string) => string,
): string {
  const nameField = selectCustomNameField(field, value);
  if (nameField) {
    const name = data[nameField];
    return typeof name === "string" ? name.trim() : "";
  }
  if (!value) return "";
  const matched = options.find((option) => option.value === value);
  if (!matched) return value;
  return resolveI18n(matched.label);
}

export function SelectFieldRenderer({
  field,
}: FieldRendererProps<SelectField>) {
  const value = useFieldValue<string>(field.id);
  const setValue = useFieldSetter();
  const onBlur = useFieldBlur();
  const { editable, handlers, data, setData, optionSources, onOpenPanel } =
    useSchema();
  const { resolveI18n } = useSchemaI18n();
  const viewMode = useViewMode();
  const isReadonly = field.readonly || !editable;

  // Resolve options: prioritize optionModule, then fall back to static options
  const resolvedOptions = useMemo((): SelectOption[] => {
    const options = resolveSelectFieldOptions(field, optionSources);
    if (options.length > 0) return options;

    // Debug: log when no options found (dev only, once per field/module/keyset)
    // Skip warning when optionSources is not provided by the caller.
    if (process.env.NODE_ENV === "development" && field.optionModule && optionSources) {
      const optionSourceKeys = Object.keys(optionSources).sort().join(",");
      const warnKey = `${field.id}|${field.optionModule}|${optionSourceKeys}`;
      if (!missingOptionModuleWarnings.has(warnKey)) {
        missingOptionModuleWarnings.add(warnKey);
      console.warn(
        `[SelectFieldRenderer] No options found for field "${field.id}" with optionModule "${field.optionModule}". optionSources keys:`,
        optionSources ? Object.keys(optionSources) : "undefined"
      );
      }
    }

    return [];
  }, [field, optionSources]);

  const handleChange = (newValue: string) => {
    const normalizedValue =
      newValue === EMPTY_OPTION_VALUE ? "" : newValue;
    setValue(field.id, normalizedValue);

    // Call onChange handler if specified
    if (field.onChange && handlers?.[field.onChange] && setData) {
      // Create updated data for handler
      const updatedData = { ...data, [field.id]: normalizedValue };
      handlers[field.onChange](updatedData, setData);
    }

    // Trigger save on selection change (selecting is a final action)
    onBlur?.();
  };

  const selectedLabel = useMemo(
    () => selectFieldDisplayLabel(field, value, data, resolvedOptions, resolveI18n),
    [data, field, resolvedOptions, resolveI18n, value],
  );

  // In print mode, show plain text without select chrome
  if (viewMode === "print") {
    return (
      <SheetInput
        label={resolveI18n(field.label)}
        variant="underline"
        inputSize="md"
        value={selectedLabel}
        readOnly
      />
    );
  }

  if (isReadonly) {
    const canOpenSettingsFromOccupation =
      editable && field.id === "occupation" && !!onOpenPanel;

    const handleReadonlyClick = () => {
      if (canOpenSettingsFromOccupation) {
        onOpenPanel?.("settings");
      }
    };

    return (
      <div
        className={cn(
          canOpenSettingsFromOccupation && "cursor-pointer",
        )}
        onClick={handleReadonlyClick}
        onKeyDown={(event) => {
          if (!canOpenSettingsFromOccupation) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onOpenPanel?.("settings");
          }
        }}
        role={canOpenSettingsFromOccupation ? "button" : undefined}
        tabIndex={canOpenSettingsFromOccupation ? 0 : undefined}
        aria-label={
          canOpenSettingsFromOccupation ? resolveI18n(field.label) : undefined
        }
      >
        <SheetInput
          label={resolveI18n(field.label)}
          variant="underline"
          inputSize="md"
          value={selectedLabel}
          readOnly
        />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <label className="text-sm text-muted-foreground shrink-0">
        {resolveI18n(field.label)}
      </label>
      <Select
        value={value || EMPTY_OPTION_VALUE}
        onValueChange={handleChange}
        disabled={!editable}
      >
        <SelectTrigger
          className={cn(
            "flex-1 h-8 rounded-md border border-muted-foreground/65 bg-muted/35 px-2 py-1 shadow-none",
            "hover:border-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/20 focus-visible:border-ring",
            !editable && "opacity-60 cursor-not-allowed",
          )}
        >
          <SelectValue placeholder="—" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={EMPTY_OPTION_VALUE}>—</SelectItem>
        {resolvedOptions.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {resolveI18n(option.label)}
          </SelectItem>
        ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// Self-register
registerFieldRenderer("select", SelectFieldRenderer);
