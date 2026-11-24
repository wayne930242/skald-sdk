"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@skald/sheet-sdk/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@skald/sheet-sdk/components/ui/dialog";
import { Textarea } from "@skald/sheet-sdk/components/ui/textarea";
import { EditIntl } from "./edit-messages";
import { PLAYER_TEXT_MAX_CHARS, capPlayerText, playerTextOf, textEditSave, textEditStart } from "./row-body";

type Row = Record<string, unknown>;

export interface RowTextDialogProps {
  name: string;
  row: Row;
  /** The text the row shows now (`useRowText`): an SRD row's corpus text when it has no own text. */
  shown: string | null;
  /** The row's rules text is still loading: the editor waits for it instead of opening empty. */
  loading?: boolean;
  /** Writes `field` of the row; `value` "" with `playerText` is 還原. */
  onSave: (field: "text" | "playerText", value: string) => void;
  onClose: () => void;
}

function RowTextBody({ name, row, shown, loading = false, onSave, onClose }: RowTextDialogProps) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl" data-dnd-text-editor>
        {/* A new start once the rules text arrives: the editor opens on it, not on the empty wait. */}
        <RowTextFields key={loading ? "loading" : "ready"} name={name} row={row} shown={loading ? null : shown} loading={loading} onSave={onSave} onClose={onClose} />
      </DialogContent>
    </Dialog>
  );
}

function RowTextFields({ name, row, shown, loading, onSave, onClose }: RowTextDialogProps & { loading: boolean }) {
  const t = useTranslations("edit.text");
  const id = useId();
  const start = textEditStart(row, shown);
  const [value, setValue] = useState(start.value);
  const srd = start.field === "playerText" && !start.beside && !playerTextOf(row) && value !== "";
  const save = () => {
    const write = textEditSave(start, value);
    if (write) onSave(write.field, write.value);
    else onClose();
  };
  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("title", { name })}</DialogTitle>
        <DialogDescription className={srd || loading ? undefined : "sr-only"}>{loading ? t("loading") : srd ? t("srdHint") : t("title", { name })}</DialogDescription>
      </DialogHeader>
      <div className={start.beside ? "grid gap-3 md:grid-cols-2" : undefined}>
        {start.beside && (
          <section className="max-h-[50vh] space-y-1 overflow-auto rounded-lg bg-muted/50 p-3 text-sm" data-text-beside>
            <h3 className="text-xs text-muted-foreground">{t("packBeside")}</h3>
            <p className="whitespace-pre-wrap">{start.beside}</p>
          </section>
        )}
        <div className="space-y-1">
          <Textarea id={id} aria-label={t("title", { name })} rows={10} maxLength={PLAYER_TEXT_MAX_CHARS} disabled={loading} aria-busy={loading || undefined} value={value} onChange={(event) => setValue(capPlayerText(event.target.value))} className="max-h-[50vh] min-h-48 overflow-y-auto" />
          <p className="text-right text-xs text-muted-foreground">{t("count", { count: value.length, max: PLAYER_TEXT_MAX_CHARS })}</p>
        </div>
      </div>
      <DialogFooter className="gap-2">
        {start.field === "playerText" && playerTextOf(row) && (
          <Button type="button" variant="ghost" title={t("resetHint")} onClick={() => onSave("playerText", "")} className="sm:mr-auto">
            {t("reset")}
          </Button>
        )}
        <Button type="button" variant="outline" onClick={onClose}>
          {t("cancel")}
        </Button>
        <Button type="button" disabled={loading} onClick={save}>
          {t("save")}
        </Button>
      </DialogFooter>
    </>
  );
}

/** 「編輯文字」 of a row (plan-uat2 §3.4). Loaded when opened. */
export function RowTextDialog(props: RowTextDialogProps) {
  return (
    <EditIntl>
      <RowTextBody {...props} />
    </EditIntl>
  );
}

/** The 角色 tab's ✎ editor for appearance, backstory and notes: a textarea in the card (inside the edit layer's labels). */
export function InlineTextEditor({ label, value, onSave, onCancel }: { label: string; value: string; onSave: (value: string) => void; onCancel: () => void }) {
  const t = useTranslations("edit.text");
  const [draft, setDraft] = useState(value);
  return (
    <div className="space-y-2" data-play-inline-editor>
      <Textarea aria-label={label} autoFocus rows={6} value={draft} onChange={(event) => setDraft(event.target.value)} className="min-h-32 text-base" />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          {t("cancel")}
        </Button>
        <Button type="button" size="sm" onClick={() => onSave(draft)}>
          {t("save")}
        </Button>
      </div>
    </div>
  );
}
