import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@skald/sheet-sdk/components/ui/button";
import { Input } from "@skald/sheet-sdk/components/ui/input";
import { CLASS_LIMITS, type ClassForm } from "../domain/class";
import { TextBox } from "./subclass-parts";

type Column = ClassForm["columns"][number];
const LEVELS = Array.from({ length: 20 }, (_, i) => i + 1);

/** One author column: its names, then a cell per level labelled with that level, and a fill-all helper. */
function ColumnEditor({ col, index, put }: { col: Column; index: number; put(next: Column | null): void }) {
  const t = useTranslations("homebrew.class");
  const tb = useTranslations("homebrew");
  const [fill, setFill] = useState("");
  const name = col.nameZh || col.nameEn || String(index + 1);
  return (
    <div className="space-y-2 rounded border p-2" data-class-column={index}>
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <TextBox label={t("columnNameZh")} value={col.nameZh} change={(nameZh) => put({ ...col, nameZh })} />
        <TextBox label={t("columnNameEn")} value={col.nameEn} change={(nameEn) => put({ ...col, nameEn })} />
        <Button type="button" size="sm" variant="ghost" className="self-end" onClick={() => put(null)}>
          {tb("remove")}
        </Button>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="block min-w-0 space-y-1 text-sm">
          <span>{t("fillValue")}</span>
          <Input value={fill} maxLength={CLASS_LIMITS.cell} className="w-32" onChange={(e) => setFill(e.target.value)} />
        </label>
        <Button type="button" size="sm" variant="outline" onClick={() => put({ ...col, values: LEVELS.map(() => fill) })}>
          {t("fillAll")}
        </Button>
      </div>
      <div role="group" aria-label={t("columnLevels", { column: name })} className="grid grid-cols-5 gap-1 sm:grid-cols-10" data-column-grid>
        {col.values.map((v, k) => (
          <label key={k} className="flex min-w-0 flex-col gap-0.5 text-center text-xs">
            <span className="text-muted-foreground tabular-nums lining-nums" aria-hidden>
              {t("columnLevel", { level: k + 1 })}
            </span>
            <Input
              aria-label={t("columnCell", { column: name, level: k + 1 })}
              className="h-8 px-1 text-center"
              value={v}
              maxLength={CLASS_LIMITS.cell}
              onChange={(e) => put({ ...col, values: col.values.map((x, j) => (j === k ? e.target.value : x)) })}
            />
          </label>
        ))}
      </div>
    </div>
  );
}

/** The ladder's author columns (up to four), each a value per level. */
export function ColumnsEditor({ form, set }: { form: ClassForm; set(patch: Partial<ClassForm>): void }) {
  const t = useTranslations("homebrew.class");
  const putColumn = (i: number, next: Column | null) =>
    set({ columns: next ? form.columns.map((c, j) => (j === i ? next : c)) : form.columns.filter((_, j) => j !== i) });
  return (
    <fieldset className="space-y-2">
      <legend className="font-medium">{t("columns")}</legend>
      {form.columns.map((col, i) => (
        <ColumnEditor key={i} col={col} index={i} put={(next) => putColumn(i, next)} />
      ))}
      {form.columns.length < CLASS_LIMITS.columns && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => set({ columns: [...form.columns, { nameEn: "", nameZh: "", values: LEVELS.map(() => "") }] })}
        >
          {t("addColumn")}
        </Button>
      )}
    </fieldset>
  );
}
