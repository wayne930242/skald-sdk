"use client";

import { useHostPort } from "@skald/sheet-sdk/modules/systems/ui/host-ports";
import { dndHomebrewStorePort } from "../store-port";
import type { HomebrewPackRecord } from "../domain/types";
import { ImportDialog } from "./import-dialog";
import { ExportButton } from "./export-button";

export function TransferSlot({ pack, onImported }: { pack?: HomebrewPackRecord; onImported: (id: string) => Promise<void> }) {
  const store = useHostPort(dndHomebrewStorePort);
  if (!store) return null;
  return <div className="flex flex-wrap items-start gap-3">
    <ImportDialog store={store} onImported={onImported} />
    {pack && <ExportButton store={store} pack={pack} />}
  </div>;
}
