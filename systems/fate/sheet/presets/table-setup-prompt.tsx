"use client";

import type { TableSetupProvider } from "@skald/sheet-sdk/modules/systems";
import { useTableSetupSheet } from "@skald/sheet-sdk/modules/systems/ui/table-setup-sheet";
import { fateTableSetupProvider } from "../../table-setup/manifest";
import { useFatePlay } from "../play/play-context";

/**
 * D5 on a table copy (ADR 0016): the host's apply prompt, for those who may write the card, when
 * its table has a setup. Nothing on a vault sheet, outside a table or on a read-only sheet.
 */
export function FateTableSetupPrompt() {
  const port = useTableSetupSheet();
  const { data, editable, update } = useFatePlay();
  if (!port?.setup || !editable) return null;
  const { ApplyPrompt } = port;
  return <ApplyPrompt provider={fateTableSetupProvider as TableSetupProvider} data={data} update={update} />;
}
