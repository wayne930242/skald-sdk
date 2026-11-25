"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@skald/sheet-sdk/components/ui/button";
import type { DndHomebrewStore, HomebrewErrorCode } from "../store-port";
import type { HomebrewPackRecord } from "../domain/types";
import { exportHomebrewPack } from "../domain/assemble";

export function ExportButton({ store, pack }: { store: DndHomebrewStore; pack: HomebrewPackRecord }) {
  const t = useTranslations("homebrew");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<HomebrewErrorCode | null>(null);
  async function download() {
    setBusy(true);
    setError(null);
    try {
      const items = await store.listItems(pack.id);
      if (!items.ok) return setError(items.error);
      const text = await exportHomebrewPack(pack, items.value);
      const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `${pack.packId}.pack.json`;
      try { link.click(); } finally { setTimeout(() => URL.revokeObjectURL(url), 0); }
    } catch { setError("network"); } finally { setBusy(false); }
  }
  return <div><Button variant="outline" disabled={busy} onClick={download}>{t("transfer.export")}</Button>
    {error && <p role="alert">{t(`error.${error}`)}</p>}
  </div>;
}
