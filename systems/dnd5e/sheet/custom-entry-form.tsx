"use client";

import { useId, useState } from "react";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ListRowField, Schema } from "@skald/types/schema";
import { Button } from "@skald/sheet-sdk/components/ui/button";
import { Checkbox } from "@skald/sheet-sdk/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@skald/sheet-sdk/components/ui/dialog";
import { Input } from "@skald/sheet-sdk/components/ui/input";
import { Label } from "@skald/sheet-sdk/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@skald/sheet-sdk/components/ui/select";
import { Textarea } from "@skald/sheet-sdk/components/ui/textarea";
import { useSchemaI18n } from "@skald/sheet-sdk/lib/i18n/use-schema-i18n";
import { EditIntl } from "./play/edit-messages";
import { PLAYER_TEXT_MAX_CHARS } from "./play/row-body";
import { formFields, formValues, type CustomList } from "./custom-rows";

type Row = Record<string, unknown>;

export interface CustomEntryDialogProps {
  schema: Schema;
  list: CustomList;
  /** The list's name, for the title of a new entry. */
  listLabel: string;
  /** The row being edited; absent for a new custom entry. */
  row?: Row;
  /** The edited row's name as the sheet shows it (the catalog's, for a built-in row): the title. */
  rowName?: string;
  /** Row fields the form leaves out: the sheet shows them from the catalog (`catalogFields`). */
  locked?: readonly string[];
  /** SRD picks shown as chips above the form (語言): picking one adds it at once. */
  chips?: Array<{ ref: string; name: string }>;
  onPick?: (chip: { ref: string; name: string }) => void;
  onSubmit: (values: Row) => void;
  onClose: () => void;
}

const LONG_FIELDS = new Set(["text", "notes"]);

function FieldControl({ field, value, onChange, id }: { field: ListRowField; value: unknown; onChange: (value: unknown) => void; id: string }) {
  const { resolveI18n } = useSchemaI18n();
  if (field.type === "toggle") {
    return <Checkbox id={id} checked={value === true} onCheckedChange={(checked) => onChange(checked === true)} />;
  }
  if (field.type === "select") {
    const options = (field as { options?: Array<{ value: string; label: string }> }).options ?? [];
    return (
      <Select value={typeof value === "string" ? value : ""} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {resolveI18n(option.label)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
  if (field.type === "number") {
    const { min, max } = field as { min?: number; max?: number };
    return (
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={typeof value === "number" ? value : ""}
        onChange={(event) => {
          // A cleared field is blank, not 0: a feature without a level.
          if (event.target.value === "") return onChange(undefined);
          const next = Number(event.target.value);
          if (!Number.isFinite(next)) return;
          onChange(Math.min(max ?? Infinity, Math.max(min ?? -Infinity, next)));
        }}
      />
    );
  }
  if (LONG_FIELDS.has(field.id)) {
    return <Textarea id={id} rows={field.id === "text" ? 5 : 2} maxLength={PLAYER_TEXT_MAX_CHARS} value={typeof value === "string" ? value : ""} onChange={(event) => onChange(event.target.value)} />;
  }
  return <Input id={id} value={typeof value === "string" ? value : ""} onChange={(event) => onChange(event.target.value)} />;
}

function EntryForm({ schema, list, listLabel, row, rowName, locked, chips, onPick, onSubmit, onClose }: CustomEntryDialogProps) {
  const t = useTranslations("edit.custom");
  const { resolveI18n } = useSchemaI18n();
  const base = useId();
  const fields = formFields(schema, list, row, locked);
  const [values, setValues] = useState<Row>(() => formValues(schema, list, row, locked));
  const [missingName, setMissingName] = useState(false);
  const named = fields.some((field) => field.id === "name");
  const submit = () => {
    if (named && (typeof values.name !== "string" || values.name.trim() === "")) {
      setMissingName(true);
      return;
    }
    // A number left blank stays unset (a feature without a level), not an empty string or 0: a new
    // row leaves it out, an edited row clears its old value.
    const blank = fields.filter((field) => field.type === "number" && typeof values[field.id] !== "number").map((field) => field.id);
    const own = Object.entries(named ? { ...values, name: String(values.name).trim() } : values).filter(([key]) => !blank.includes(key));
    onSubmit(Object.fromEntries(row ? [...own, ...blank.map((key) => [key, undefined])] : own));
  };
  const title = row ? t("editTitle", { name: rowName ?? String(row.name ?? "") }) : t("title", { list: listLabel });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg" data-dnd-custom-entry={list}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="sr-only">{title}</DialogDescription>
        </DialogHeader>
        {chips && chips.length > 0 && (
          <section aria-label={t("srdLanguages")} className="space-y-1.5">
            <h3 className="text-sm text-muted-foreground">{t("srdLanguages")}</h3>
            <ul className="flex flex-wrap gap-1.5">
              {chips.map((chip) => (
                <li key={chip.ref}>
                  <button type="button" onClick={() => onPick?.(chip)} className="inline-flex min-h-9 items-center gap-1 rounded-full border border-border px-3 text-sm hover:bg-muted" data-chip={chip.ref}>
                    <Plus className="size-3.5" aria-hidden="true" />
                    {chip.name}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          {fields.map((field) => {
            const id = `${base}-${field.id}`;
            const wide = field.type === "text";
            const label = resolveI18n(field.label ?? field.id);
            return (
              <div key={field.id} className={field.type === "toggle" ? "flex items-center gap-2" : wide ? "space-y-1.5 sm:col-span-2" : "space-y-1.5"}>
                {field.type === "toggle" ? (
                  <>
                    <FieldControl field={field} id={id} value={values[field.id]} onChange={(value) => setValues((previous) => ({ ...previous, [field.id]: value }))} />
                    <Label htmlFor={id}>{label}</Label>
                  </>
                ) : (
                  <>
                    <Label htmlFor={id}>{label}</Label>
                    <FieldControl
                      field={field}
                      id={id}
                      value={values[field.id]}
                      onChange={(value) => {
                        if (field.id === "name") setMissingName(false);
                        setValues((previous) => ({ ...previous, [field.id]: value }));
                      }}
                    />
                    {field.id === "name" && missingName && (
                      <p role="alert" className="text-sm text-destructive">
                        {t("nameRequired")}
                      </p>
                    )}
                  </>
                )}
              </div>
            );
          })}
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={onClose}>
              {t("cancel")}
            </Button>
            <Button type="submit">{row ? t("save") : t("add")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** The custom entry form of a list (plan-uat2 §3.2), also the row's 編輯欄位. Loaded when opened. */
export function CustomEntryDialog(props: CustomEntryDialogProps) {
  return (
    <EditIntl>
      <EntryForm {...props} />
    </EditIntl>
  );
}
