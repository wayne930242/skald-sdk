"use client";

import * as React from "react";
import { Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  evaluateFormulaLifecycle,
  type FormulaLifecyclePhase,
  type FormulaValue,
} from "@skald/formula";
import type {
  ListEntry,
  ListField,
  ListRowField,
  Schema,
} from "@skald/types/schema";
import { Button } from "@skald/sheet-sdk/components/ui/button";
import { DerivedValueField } from "../../derived-value-field";
import { FieldRenderer } from "../../field-renderer";
import { LayoutRenderer } from "../../layout-renderer";
import { RollableField } from "../../rollable-field";
import { RollDataProvider, useRollData } from "../../roll-data-context";
import { registerFieldRenderer, type FieldRendererProps } from "../../registry";
import {
  SchemaDataContext,
  SchemaStaticContext,
  useFieldSetter,
  useFieldValue,
  useSchemaData,
  useSchemaStatic,
  setNestedValue,
} from "../../schema-context";
import {
  buildCharacterFormulaValues,
  buildListRowDerivedOverrideKey,
  evaluateCharacterFormulaRuntime,
  inputDefaultsOf,
  withInputDefaults,
} from "@skald/sheet-sdk/modules/sheet-schema";
import { cn } from "@skald/sheet-sdk/lib/utils";

const DEFAULT_MAX_ITEMS = 100;

function toEntries(value: unknown): ListEntry[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is ListEntry =>
      typeof entry === "object" &&
      entry !== null &&
      typeof (entry as { id?: unknown }).id === "string",
  );
}

function primitiveValues(
  value: Record<string, unknown>,
): Record<string, FormulaValue | undefined> {
  const result: Record<string, FormulaValue | undefined> = {};
  for (const [key, item] of Object.entries(value)) {
    if (
      typeof item === "number" ||
      typeof item === "string" ||
      typeof item === "boolean"
    ) {
      result[key] = item;
    }
  }
  return result;
}

const rowDefaultsByList = new WeakMap<ListField, Record<string, unknown>>();

/** The List's row input defaults (its row template's `defaultValue`s), the same rule as the character's. */
function rowInputDefaults(list: ListField): Record<string, unknown> {
  let defaults = rowDefaultsByList.get(list);
  if (!defaults) {
    defaults = inputDefaultsOf(list.rowTemplate.children);
    rowDefaultsByList.set(list, defaults);
  }
  return defaults;
}

function evaluateRow(
  list: ListField,
  entry: ListEntry,
  characterData: Record<string, unknown>,
  runtime: ReturnType<typeof useSchemaStatic>["formulaRuntime"],
  phase: FormulaLifecyclePhase = "runtime",
) {
  if (!runtime) return null;
  const programs = runtime.artifact.programs.filter(
    (program) =>
      program.location.scope === "list-row" &&
      program.location.listFieldId === list.id,
  );
  const formulaIds = new Set(programs.map((program) => program.formulaId));
  const overrides: Record<string, FormulaValue> = {};
  for (const field of list.rowTemplate.children) {
    const value =
      runtime.derivedOverrides[
        buildListRowDerivedOverrideKey(list.id, entry.id, field.id)
      ];
    if (value !== undefined) overrides[field.id] = value;
  }
  const characterResult = evaluateCharacterFormulaRuntime(runtime, characterData);
  return evaluateFormulaLifecycle(
    programs,
    {
      order: runtime.artifact.graph.order.filter((id) => formulaIds.has(id)),
      dependencies: runtime.artifact.graph.dependencies,
    },
    {
      character: {
        ...buildCharacterFormulaValues(withInputDefaults(characterData, runtime.inputDefaults)),
        ...characterResult.derivedValues,
      },
      // A row saved before a row field existed reads that field's row template default
      row: primitiveValues(withInputDefaults(entry, rowInputDefaults(list))),
    },
    overrides,
    phase,
  );
}

function createEntry(
  list: ListField,
  characterData: Record<string, unknown>,
  runtime: ReturnType<typeof useSchemaStatic>["formulaRuntime"],
): ListEntry {
  const suffix =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const entry: ListEntry = { id: `${list.idPrefix ?? "item"}_${suffix}` };
  for (const field of list.rowTemplate.children) {
    if (field.type !== "computed" && field.defaultValue !== undefined) {
      entry[field.id] = structuredClone(field.defaultValue);
    }
  }
  const initialized = evaluateRow(list, entry, characterData, runtime, "initialize");
  if (initialized) {
    const rowFieldIds = new Set(list.rowTemplate.children.map((field) => field.id));
    for (const [fieldId, value] of Object.entries(initialized.defaultValues)) {
      if (rowFieldIds.has(fieldId)) entry[fieldId] = value;
    }
  }
  return entry;
}

function ListRowDerivedField({
  list,
  entry,
  field,
  characterData,
  editable,
  formulaRuntime,
  onSetDerivedOverride,
  onRefreshDerivedOverride,
}: {
  list: ListField;
  entry: ListEntry;
  field: ListRowField;
  characterData: Record<string, unknown>;
  editable: boolean;
  formulaRuntime: ReturnType<typeof useSchemaStatic>["formulaRuntime"];
  onSetDerivedOverride: ReturnType<typeof useSchemaStatic>["onSetDerivedOverride"];
  onRefreshDerivedOverride: ReturnType<typeof useSchemaStatic>["onRefreshDerivedOverride"];
}) {
  const formula = formulaRuntime?.artifact.programs.find(
    (program) =>
      program.kind === "derived" &&
      program.location.scope === "list-row" &&
      program.location.listFieldId === list.id &&
      program.targetFieldId === field.id,
  );
  if (!formulaRuntime || !formula) return <FieldRenderer field={field} />;
  const result = evaluateRow(list, entry, characterData, formulaRuntime);
  const overrideKey = buildListRowDerivedOverrideKey(
    list.id,
    entry.id,
    field.id,
  );

  const derivedField = (
    <DerivedValueField
      field={field}
      editable={editable}
      derived={{
        value: result?.derivedValues[field.id],
        resultType: formula.resultType,
        hasOverride: Object.hasOwn(formulaRuntime.derivedOverrides, overrideKey),
        issues: result?.issues.filter((issue) => issue.targetFieldId === field.id) ?? [],
        setOverride: onSetDerivedOverride
          ? (value) => onSetDerivedOverride(overrideKey, value)
          : undefined,
        refresh: onRefreshDerivedOverride
          ? () => onRefreshDerivedOverride(overrideKey)
          : undefined,
      }}
    />
  );
  if (!field.roll) return derivedField;
  return (
    <RollableField
      roll={field.roll}
      fieldLabel={field.label}
      fieldType={field.type}
      rollKey={field.id}
    >
      {derivedField}
    </RollableField>
  );
}

/**
 * On a form (`presentation: "form"`) a row field takes the whole row and is named
 * "<list label> <n>" when it has no label of its own: the form shows no column
 * headers, so a bare input would be unnamed.
 */
function formRowField(field: ListRowField, list: ListField, position: number): ListRowField {
  const named = field.label
    ? field
    : ({
        ...field,
        label: list.label ? `${list.label} ${position}` : undefined,
        labelPosition: "hidden",
      } as ListRowField);
  return named.layout?.width ? named : { ...named, layout: { ...named.layout, width: "fill" } };
}

/**
 * On the sheet a long-text row field with no width of its own takes the rest of
 * the row: in the row layout it otherwise shrank to its default 20-column width
 * while the section stayed wide.
 */
function sheetRowField(field: ListRowField): ListRowField {
  if (field.type !== "text" || !field.multiline || field.layout?.width) return field;
  return { ...field, layout: { ...field.layout, width: "fill" } };
}

function ListRow({
  list,
  entry,
  position,
  characterData,
  character,
  onChange,
  onRemove,
}: {
  list: ListField;
  entry: ListEntry;
  /** 1-based place of the row in the list. */
  position: number;
  characterData: Record<string, unknown>;
  /** The whole character (the outermost data, also in a nested list), for row handlers. */
  character: Record<string, unknown>;
  onChange: (updater: (prevEntry: ListEntry) => ListEntry) => void;
  onRemove: () => void;
}) {
  const outerStatic = useSchemaStatic();
  const tRenderer = useTranslations("renderer");
  const rowSchema = React.useMemo<Schema>(
    () => ({
      ...outerStatic.schema,
      fields: Object.fromEntries(
        list.rowTemplate.children.map((field) => [field.id, field]),
      ),
    }),
    [list.rowTemplate.children, outerStatic.schema],
  );
  const rowStatic = React.useMemo(
    () => ({
      ...outerStatic,
      schema: rowSchema,
      formulaRuntime: undefined,
      growTextareas: true,
      onSetDerivedOverride: undefined,
      onRefreshDerivedOverride: undefined,
      onChange: (path: string, value: unknown) =>
        onChange((prevEntry) => ({
          ...setNestedValue(prevEntry, path, value),
          id: prevEntry.id,
        })),
      setData: (
        updater:
          | Record<string, unknown>
          | ((previous: Record<string, unknown>) => Record<string, unknown>),
      ) => {
        onChange((prevEntry) => {
          const next =
            typeof updater === "function" ? updater(prevEntry) : updater;
          return { ...next, id: prevEntry.id };
        });
      },
    }),
    [onChange, outerStatic, rowSchema],
  );

  // 列內擲骰讀得到：角色資料與角色公式值、這一列的值、這一列的公式值
  const characterRollData = useRollData(characterData);
  const rowRollData = React.useMemo(() => {
    const rowDerived = evaluateRow(list, entry, characterData, outerStatic.formulaRuntime);
    return {
      ...characterRollData,
      ...withInputDefaults(entry, rowInputDefaults(list)),
      ...(rowDerived?.derivedValues ?? {}),
    };
  }, [characterData, characterRollData, entry, list, outerStatic.formulaRuntime]);

  const form = outerStatic.presentation === "form";
  const canRemove = outerStatic.editable && list.allowRemove !== false;

  const row = (
    <SchemaStaticContext.Provider value={rowStatic}>
      <SchemaDataContext.Provider value={{ data: entry, character }}>
        <RollDataProvider source={entry} value={rowRollData}>
        <LayoutRenderer
          layout={list.rowTemplate.layout}
          // A form row stretches its fields: `items-start` in the narrow column
          // layout shrank a text field to its default 20-column width.
          // On the sheet the row stretches its fields on a phone, where the web
          // row layout stacks as a column, and aligns them to the top otherwise.
          className={form ? "w-full" : "items-stretch sm:items-start"}
        >
          {list.rowTemplate.children.map((field) =>
            field.type === "computed" ? (
              <div key={field.id} className="skald-field" data-field-id={field.id}>
                <ListRowDerivedField
                  list={list}
                  entry={entry}
                  field={field}
                  characterData={characterData}
                  editable={outerStatic.editable}
                  formulaRuntime={outerStatic.formulaRuntime}
                  onSetDerivedOverride={outerStatic.onSetDerivedOverride}
                  onRefreshDerivedOverride={outerStatic.onRefreshDerivedOverride}
                />
              </div>
            ) : (
              <FieldRenderer
                key={field.id}
                field={
                  form ? formRowField(field, list, position) : sheetRowField(field)
                }
              />
            ),
          )}
        </LayoutRenderer>
        </RollDataProvider>
      </SchemaDataContext.Provider>
    </SchemaStaticContext.Provider>
  );

  if (form) {
    return (
      <div className="flex items-start gap-2" data-list-entry-id={entry.id}>
        <div className="min-w-0 flex-1">{row}</div>
        {canRemove && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={tRenderer("removeItem")}
            onClick={onRemove}
            className="h-9 w-9 shrink-0 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="group relative" data-list-entry-id={entry.id}>
      {row}
      {canRemove && (
        <button
          type="button"
          aria-label={tRenderer("removeItem")}
          onClick={onRemove}
          className="absolute right-0 top-0 opacity-0 group-hover:opacity-100 print:hidden"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

export function ListFieldRenderer({ field }: FieldRendererProps<ListField>) {
  const entries = toEntries(useFieldValue(field.id));
  const characterData = useSchemaData();
  const character = React.useContext(SchemaDataContext)?.character ?? characterData;
  const setValue = useFieldSetter();
  const { editable, formulaRuntime, presentation } = useSchemaStatic();
  const t = useTranslations();
  const maxItems = field.maxItems ?? DEFAULT_MAX_ITEMS;
  const canAdd = editable && field.allowAdd !== false && entries.length < maxItems;
  const canRemove = editable && field.allowRemove !== false;

  const updateEntry = React.useCallback(
    (entryId: string, updater: (prevEntry: ListEntry) => ListEntry) => {
      setValue(field.id, (prevValue: unknown) =>
        toEntries(prevValue).map((entry) =>
          entry.id === entryId ? updater(entry) : entry,
        ),
      );
    },
    [field.id, setValue],
  );

  const addEntry = () =>
    setValue(field.id, (prevValue: unknown) => [
      ...toEntries(prevValue),
      createEntry(field, characterData, formulaRuntime),
    ]);

  return (
    <div className="space-y-2" data-list-field={field.id}>
      {entries.map((entry, index) => (
        <ListRow
          key={entry.id}
          list={field}
          entry={entry}
          position={index + 1}
          characterData={characterData}
          character={character}
          onChange={(updater) => updateEntry(entry.id, updater)}
          onRemove={() =>
            canRemove &&
            setValue(field.id, (prevValue: unknown) =>
              toEntries(prevValue).filter((item) => item.id !== entry.id),
            )
          }
        />
      ))}
      {canAdd &&
        (presentation === "form" ? (
          // On a form the list's label sits above it; the button says what it adds.
          <Button type="button" variant="outline" size="sm" onClick={addEntry}>
            <Plus className="h-4 w-4" />
            {field.label
              ? t("renderer.addNamedItem", { label: field.label })
              : t("common.add")}
          </Button>
        ) : (
          <button
            type="button"
            onClick={addEntry}
            className={cn(
              "flex items-center gap-1 text-muted-foreground hover:text-foreground print:hidden",
            )}
          >
            <Plus className="h-3.5 w-3.5" />
            {t("common.add")}
          </button>
        ))}
    </div>
  );
}

registerFieldRenderer("list", ListFieldRenderer);
