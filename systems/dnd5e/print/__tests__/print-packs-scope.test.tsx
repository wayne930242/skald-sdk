import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { TABLE_SETUP_SCHEMA } from "@skald/sheet-sdk/modules/systems";
import { bindHostPort, HostPortsProvider } from "@skald/sheet-sdk/modules/systems/ui/host-ports";
import { TableSetupSheetProvider, type TableSetupSheetSource } from "@skald/sheet-sdk/modules/systems/ui/table-setup-sheet";
import type { EffectivePacks } from "../../content-pack/domain/types";
import { dndPackSourcePort, type DndPackSource } from "../../sheet/pack-source-port";
import { usePrintPacks } from "../print-reference";

/** Homebrew step 8: a table copy's print reads the table's shared GM homebrew with its packs, from the cache. */
const view = { keys: ["table/T/owner"] } as unknown as EffectivePacks;

function wrapper(source: DndPackSource, sources?: string[]) {
  const setup: TableSetupSheetSource | null = sources
    ? {
      port: { tableId: "T", setup: { config: { schema: TABLE_SETUP_SCHEMA, sources }, revision: 1 }, appliedRevision: null, locksApply: false, ApplyPrompt: () => null },
      request: () => {},
    }
    : null;
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <TableSetupSheetProvider value={setup}>
        <HostPortsProvider ports={[bindHostPort(dndPackSourcePort, source)]}>{children}</HostPortsProvider>
      </TableSetupSheetProvider>
    );
  };
}

describe("usePrintPacks", () => {
  it("reads a table copy's scope when its setup takes the GM's homebrew", async () => {
    const source: DndPackSource = { readCached: vi.fn(async () => view), revalidate: vi.fn() };
    const { result } = renderHook(() => usePrintPacks(), { wrapper: wrapper(source, ["srd52", "gm-homebrew"]) });
    await waitFor(() => expect(result.current).toEqual({ packs: view, settled: true }));
    expect(source.readCached).toHaveBeenCalledWith({ tableId: "T" });
    expect(source.revalidate).not.toHaveBeenCalled();
  });

  it("reads the device's packs alone for a vault copy and a table without that source", async () => {
    for (const sources of [undefined, ["srd52", "device-packs"]]) {
      const source: DndPackSource = { readCached: vi.fn(async () => view), revalidate: vi.fn() };
      const { result } = renderHook(() => usePrintPacks(), { wrapper: wrapper(source, sources) });
      await waitFor(() => expect(result.current.settled).toBe(true));
      expect(source.readCached).toHaveBeenCalledWith();
    }
  });
});
