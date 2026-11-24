import type {
  ComputedField,
  FieldBase,
  ListField,
  ListRowField,
  SelectOption,
  SizeUnit,
} from "@skald/types/schema";

/** 只存在於舊 schema 匯入邊界，不屬於正式 Field vocabulary。 */
export interface LegacyStructuredListColumn {
  id: string;
  type: "text" | "textarea" | "number" | "select" | "toggle" | "computed";
  formula?: string;
  label?: string;
  placeholder?: string;
  width?: SizeUnit;
  printWidth?: SizeUnit;
  align?: "left" | "center" | "right";
  options?: SelectOption[] | string;
  icon?: string;
  toggleOnLabel?: string;
  toggleOffLabel?: string;
}

/** 舊 structured-list 的反序列化輸入；轉換後不得流入 renderer 或 editor。 */
export interface LegacyStructuredListField extends FieldBase {
  type: "structured-list";
  columns: LegacyStructuredListColumn[];
  maxItems?: number;
  minRows?: number;
  allowAdd?: boolean;
  allowRemove?: boolean;
  idPrefix?: string;
  emptyMessage?: string;
}

function convertLegacyRowFormula(source: string): string {
  const trimmed = source.trim();
  if (trimmed.startsWith("{{") && trimmed.endsWith("}}")) {
    const body = trimmed.slice(2, -2).trim();
    return `=${body.replace(/@([A-Za-z0-9_-]+)/g, "[@$1]")}`;
  }
  return trimmed;
}

export function structuredListColumnToRowField(
  column: LegacyStructuredListColumn,
): ListRowField {
  const base = {
    id: column.id,
    label: column.label,
    layout: column.width ? { width: column.width } : undefined,
    printWidth: column.printWidth,
    textAlign: column.align,
  };
  switch (column.type) {
    case "textarea":
      return {
        ...base,
        type: "text",
        multiline: true,
        rows: 1,
        placeholder: column.placeholder,
        defaultValue: "",
      };
    case "number":
      return { ...base, type: "number", defaultValue: "" };
    case "select":
      return {
        ...base,
        type: "select",
        options: column.options ?? [],
        defaultValue: "",
      };
    case "toggle":
      return {
        ...base,
        type: "toggle",
        icon: column.icon,
        onLabel: column.toggleOnLabel,
        offLabel: column.toggleOffLabel,
        defaultValue: false,
      };
    case "computed":
      return {
        ...base,
        type: "computed",
        formula: convertLegacyRowFormula(column.formula ?? ""),
      } satisfies ComputedField;
    case "text":
      return {
        ...base,
        type: "text",
        placeholder: column.placeholder,
        defaultValue: "",
      };
  }
}

export function structuredListToListField(
  field: LegacyStructuredListField,
): ListField {
  return {
    id: field.id,
    type: "list",
    label: field.label,
    labelPosition: field.labelPosition,
    description: field.description,
    layout: field.layout,
    gridPosition: field.gridPosition,
    required: field.required,
    readonly: field.readonly,
    visibleWhen: field.visibleWhen,
    roll: field.roll,
    customClass: field.customClass,
    rowTemplate: {
      children: field.columns.map(structuredListColumnToRowField),
      layout: { type: "stack", direction: "row", wrap: true, gap: "xs" },
    },
    maxItems: field.maxItems,
    allowAdd: field.allowAdd,
    allowRemove: field.allowRemove,
    idPrefix: field.idPrefix,
    emptyMessage: field.emptyMessage,
  };
}
