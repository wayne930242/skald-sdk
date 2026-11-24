"use client";

import { createContext, useContext, useEffect, useMemo } from "react";
import type { TableSetupProvider, TableSetupSheetPort } from "../domain/table-setup";

/**
 * What the host puts around a table copy's sheet: the port, read only once the sheet asks for it,
 * so a System whose sheet never reads its table's setup costs no read or subscription.
 */
export interface TableSetupSheetSource {
  /** Null until requested and read, and for a vault sheet. */
  readonly port: TableSetupSheetPort | null;
  /** A reader is mounted: start reading. */
  readonly request: () => void;
}

const TableSetupSheetContext = createContext<TableSetupSheetSource | null>(null);

/** The host gives a table copy's sheet its table's setup here (ADR 0016 §5). */
export const TableSetupSheetProvider = TableSetupSheetContext.Provider;

/** The table's setup as this sheet's copy sees it, or null outside a table or without a host. */
export function useTableSetupSheet(): TableSetupSheetPort | null {
  const source = useContext(TableSetupSheetContext);
  const request = source?.request;
  useEffect(() => {
    request?.();
  }, [request]);
  return source?.port ?? null;
}

/** A provider's part of the copy's table setup, parsed; null without a setup. */
export function useTableSetupSheetConfig<C>(provider: TableSetupProvider<C>): C | null {
  const config = useTableSetupSheet()?.setup?.config;
  return useMemo(() => (config ? provider.parse(provider.configSlot === "sources" ? config.sources : config.system?.[provider.id]).config : null), [config, provider]);
}
