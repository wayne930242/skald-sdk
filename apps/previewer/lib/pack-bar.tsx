"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@skald/sheet-sdk/components/ui/button";
import { addPackFile, removePack, usePreviewPacks, type LoadedPack } from "./content-packs";

function PackRow({ item }: { item: LoadedPack }) {
  const t = useTranslations("previewer.packs");
  const { manifest } = item.pack;
  const { report } = item;
  const entries = Object.values(report.counts).reduce((sum, count) => sum + count, 0);
  const dropped = [...report.dropped, ...(report.droppedByName ?? []).map(({ ref }) => ref), ...(report.droppedOverlays ?? [])];
  return (
    <li className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-md border px-3 py-2" data-preview-pack={manifest.packId}>
      <span className="font-medium">{item.name}</span>
      <span className="text-muted-foreground">{t("version", { packId: manifest.packId, version: manifest.packVersion })}</span>
      <span>{t("supplies", { entries, overlays: Object.keys(item.pack.overlays ?? {}).length })}</span>
      {dropped.length > 0 && <span className="text-destructive">{t("dropped", { count: dropped.length, refs: dropped.join(", ") })}</span>}
      {report.builtinMismatch && <span className="text-muted-foreground">{t("mismatch")}</span>}
      <Button type="button" variant="ghost" size="sm" className="ml-auto" onClick={() => removePack(manifest.packId)}>
        {t("remove")}
      </Button>
    </li>
  );
}

/**
 * D&D's content packs in the previewer: load pack files from this computer, see what each supplies
 * and drops, remove them. They stay in this tab's memory; the sheet remounts to read them
 * (`packsKey`).
 */
export function PackBar() {
  const t = useTranslations("previewer.packs");
  const packs = usePreviewPacks();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const load = async (file: File) => {
    setBusy(true);
    try {
      const result = await addPackFile(file);
      if (result.ok) {
        toast.success(t("loaded", { name: result.pack.name }));
      } else {
        toast.error(t(`error.${result.error}`, { detail: result.detail ?? "" }));
      }
    } catch {
      toast.error(t("error.failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mb-4 flex flex-col gap-2 text-sm" data-pack-bar>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-medium">{t("title")}</h2>
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => fileRef.current?.click()}>
          {busy ? t("checking") : t("load")}
        </Button>
        <span className="text-muted-foreground">{t("note")}</span>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void load(file);
          }}
        />
      </div>
      {packs.length > 0 && (
        <ul className="flex flex-col gap-1">
          {packs.map((item) => (
            <PackRow key={item.pack.manifest.packId} item={item} />
          ))}
        </ul>
      )}
    </section>
  );
}
