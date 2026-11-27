"use client";

import { useMemo } from "react";
import { useTableSetupSheet } from "@skald/sheet-sdk/modules/systems/ui/table-setup-sheet";
import { allowsGmHomebrew } from "../table-setup/sources";
import type { PackScope } from "./pack-source-port";

/**
 * The pack scope of a table copy whose table's setup takes the GM's homebrew (`gm-homebrew`, ADR
 * 0018 homebrew step 8), through the host's table setup port (ADR 0016 §5); undefined for a vault
 * sheet, a table without that source, and while the setup is unread. The scope reads the device's
 * copies of the table's shares; only a picker's revalidate asks the database for them.
 */
export function useTablePackScope(): PackScope | undefined {
  const port = useTableSetupSheet();
  const tableId = port?.tableId;
  const gated = tableId !== undefined && allowsGmHomebrew(port?.setup?.config.sources);
  return useMemo(() => (gated && tableId !== undefined ? { tableId } : undefined), [gated, tableId]);
}
