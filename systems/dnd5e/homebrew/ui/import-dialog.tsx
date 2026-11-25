"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, buttonVariants } from "@skald/sheet-sdk/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@skald/sheet-sdk/components/ui/dialog";
import { PACK_SCHEMA_ID } from "../../content-pack/domain/validate-pack";
import { loadBuiltinIdentity, loadOpenPackSchemaCheck } from "../../content-pack/open/load";
import { validateOpenPackText } from "../../content-pack/open/validate-open-pack";
import { HOMEBREW_LIMITS } from "../domain/limits";
import { splitOpenPack, keptRefs } from "../domain/split";
import type { DndHomebrewStore, HomebrewImport } from "../store-port";

interface Preview {
  input: HomebrewImport;
  dropped: string[];
  existing?: { id: string; name: string };
  copyId: string;
}

export function ImportDialog({ store, onImported }: { store: DndHomebrewStore; onImported: (id: string) => Promise<void> }) {
  const t = useTranslations("homebrew");
  const [filename, setFilename] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState("");
  async function inspect(file?: File) {
    setError(""); setPreview(null);
    if (!file) return;
    if (file.size > HOMEBREW_LIMITS.bytes) return setError(t("transfer.tooLarge"));
    setBusy(true);
    try {
      const text = await file.text();
      let raw;
      try { raw = JSON.parse(text); } catch { return setError(t("error.invalid")); }
      if (raw?.$schema === PACK_SCHEMA_ID) return setError(t("transfer.driveOnly"));
      const [{ refs, nameKeys }, schema] = await Promise.all([loadBuiltinIdentity(), loadOpenPackSchemaCheck()]);
      const result = await validateOpenPackText(text, { builtinRefs: refs, builtinNameKeys: nameKeys, schema });
      if (!result.ok) return setError(t("error.invalid"));
      const input = splitOpenPack(raw, keptRefs(result.pack));
      const packs = await store.listPacks();
      if (!packs.ok) return setError(t(`error.${packs.error}`));
      const id = input.manifest.packId;
      const existing = packs.value.find(p => p.packId === id);
      let copyId = id;
      for (let n = 2; packs.value.some(p => p.packId === copyId); n++) {
        const suffix = `-${n}`;
        copyId = id.slice(0, 200 - suffix.length) + suffix;
      }
      const { dropped, droppedOverlays, droppedByName } = result.report;
      setPreview({ input, existing, copyId, dropped: [...dropped, ...(droppedOverlays ?? []), ...(droppedByName ?? []).map(v => `${v.ref} → ${v.builtinRef}`)] });
    } catch { setError(t("error.network")); } finally { setBusy(false); }
  }
  async function save(replace: boolean) {
    if (!preview) return;
    setBusy(true); setError("");
    try {
      const { input, existing, copyId } = preview;
      const result = await store.importPack(replace ? { ...input, replace: existing?.id } : { ...input, manifest: { ...input.manifest, packId: copyId } });
      if (!result.ok) return setError(t(`error.${result.error}`));
      setOpen(false); await onImported(result.value.id);
    } catch { setError(t("error.network")); } finally { setBusy(false); }
  }
  return <Dialog open={open} onOpenChange={value => { if (!busy) { setOpen(value); setFilename(""); setError(""); setPreview(null); } }}>
    <DialogTrigger asChild><Button variant="outline">{t("transfer.import")}</Button></DialogTrigger>
    <DialogContent aria-describedby={undefined}>
      <DialogHeader><DialogTitle>{t("transfer.import")}</DialogTitle></DialogHeader>
      <label className="grid min-w-0 gap-2">
        <span>{t("transfer.file")}</span>
        <input className="peer sr-only" type="file" aria-label={t("transfer.file")} accept=".json,application/json" disabled={busy} onChange={e => {
          const file = e.target.files?.[0]; setFilename(file?.name ?? ""); void inspect(file);
        }} />
        <span className="flex min-w-0 items-center gap-3 rounded-md peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-disabled:opacity-50">
          <span className={buttonVariants({ variant: "outline" })}>{t("transfer.chooseFile")}</span>
          <span className="truncate text-sm text-muted-foreground" title={filename}>{filename || t("transfer.noFile")}</span>
        </span>
      </label>
      {preview && <><p>{t("transfer.report", { name: preview.input.manifest.name, count: preview.input.items.length })}</p>
        {preview.dropped.length > 0 && <p>{t("transfer.dropped", { refs: preview.dropped.join(", ") })}</p>}
        {preview.existing && <Button variant="outline" disabled={busy} onClick={() => save(true)}>{t("transfer.replace", { name: preview.existing.name })}</Button>}
        <Button disabled={busy} onClick={() => save(false)}>{t(preview.existing ? "transfer.copy" : "transfer.confirm")}</Button>
      </>}
      {error && <p role="alert">{error}</p>}
    </DialogContent>
  </Dialog>;
}
