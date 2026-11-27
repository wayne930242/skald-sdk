import { act, renderHook, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { LoadedSystem } from "@skald/types/system";
import { bindHostPort, HostPortsProvider } from "@skald/sheet-sdk/modules/systems/ui/host-ports";
import { SystemPluginProvider } from "@skald/sheet-sdk/modules/systems/ui/system-plugin-provider";
import { TABLE_SETUP_SCHEMA, type TableSetupSheetPort } from "@skald/sheet-sdk/modules/systems";
import { TableSetupSheetProvider } from "@skald/sheet-sdk/modules/systems/ui/table-setup-sheet";
import { singlePackView } from "../../content-pack/domain/effective";
import type { EffectivePacks, ValidatedPack } from "../../content-pack/domain/types";
import { PLAY_VIEW_FIELDS } from "../play/play-model";
import { withPackRowText } from "../play/row-text";
import { dndPackSourcePort, type DndPackSource } from "../pack-source-port";
import type { ReferenceContextValue } from "../use-reference-context";

vi.mock("../play/play-messages", () => ({ loadPlayMessages: async () => ({}) }));

const { useDnd5eSheetAdapter } = await import("../dnd-sheet-adapter");
const { useDevicePacks } = await import("../use-device-packs");

/**
 * Open-source plan T6: the sheet reads this device's content packs only through
 * `dndPackSourcePort`. A host that registers it (Skald) gives the reference its pack names and the
 * pack rows their text (`PackTextIndex.rowText`, D9); a host without it (the previewer, a test)
 * shows the SRD alone.
 */

const pack: ValidatedPack = {
  manifest: { systemId: "dnd5e-2024", packId: "sample", packVersion: "1", requiresBuiltin: "", payloadSha256: "", counts: {}, notice: "" },
  entries: [{ ref: "feat:whittler", kind: "feat", id: "whittler", name: "Whittler", entries: ["Craft faster."], meta: {} }],
  zhTW: {},
  wizard: {},
  overlays: {},
};
const view = singlePackView("sample", pack);
const newer: EffectivePacks = singlePackView("sample", {
  ...pack,
  entries: [{ ref: "feat:whittler", kind: "feat", id: "whittler", name: "Whittler", entries: ["Craft much faster."], meta: {} }],
});

function fakeSource(cached: EffectivePacks | null = view) {
  let notify: ((packs: EffectivePacks | null) => void) | null = null;
  const source: DndPackSource = {
    readCached: vi.fn(async () => cached),
    revalidate: vi.fn(async (onUpdated) => {
      notify = onUpdated;
      return cached;
    }),
  };
  return { source, update: (packs: EffectivePacks | null) => notify?.(packs) };
}

/** A table copy's setup port, as the host gives it (ADR 0016 §5), with these content sources. */
function tablePort(sources: string[]): TableSetupSheetPort {
  return {
    tableId: "T",
    setup: { config: { schema: TABLE_SETUP_SCHEMA, sources }, revision: 1 },
    appliedRevision: null,
    locksApply: true,
    ApplyPrompt: () => null,
  };
}

function wrapperWith(source: DndPackSource | null, table?: TableSetupSheetPort) {
  const ports = source ? [bindHostPort(dndPackSourcePort, source)] : [];
  const setup = table ? { port: table, request: () => {} } : null;
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <NextIntlClientProvider locale="en" messages={{}} timeZone="UTC" onError={() => {}}>
        <SystemPluginProvider catalog={{ getClientSystemMessages: () => ({}) }}>
          <TableSetupSheetProvider value={setup}>
            <HostPortsProvider ports={ports}>{children}</HostPortsProvider>
          </TableSetupSheetProvider>
        </SystemPluginProvider>
      </NextIntlClientProvider>
    );
  };
}

const system = {
  config: { id: "dnd5e-2024" },
  schema: { fields: Object.fromEntries(PLAY_VIEW_FIELDS.map((id) => [id, { id, type: "text" }])) },
  runtime: { builtinTemplate: true },
} as unknown as LoadedSystem;

type Node = ReactElement<{ reference?: ReferenceContextValue; children?: ReactNode }>;

/** The reference context the adapter hands its play view (inside any wrapping fragment). */
function findReference(node: ReactNode): ReferenceContextValue | undefined {
  if (!node || typeof node !== "object" || !("props" in node)) return undefined;
  const { props } = node as Node;
  return props.reference ?? [props.children].flat().map(findReference).find(Boolean);
}
const playReference = (adapter: { playView?: ReactNode }) => findReference(adapter.playView)!;

// A table copy's pack row holds ref, name and origin, never text (D9).
const tableRow = { ref: "feat:whittler", name: "Whittler", origin: "pack" };

describe("dndPackSourcePort: the sheet's content packs", () => {
  it("reads nothing and shows no pack without the port", async () => {
    const { result } = renderHook(() => useDevicePacks(), { wrapper: wrapperWith(null) });
    expect(result.current.packs).toBeNull();
    expect(() => result.current.revalidate()).not.toThrow();
    await act(async () => {});
    expect(result.current.packs).toBeNull();
  });

  it("reads the cached packs once at mount and checks their links once, taking each newer view", async () => {
    const { source, update } = fakeSource();
    const { result } = renderHook(() => useDevicePacks(), { wrapper: wrapperWith(source) });
    await waitFor(() => expect(result.current.packs).toBe(view));
    expect(source.readCached).toHaveBeenCalledTimes(1);
    expect(source.revalidate).not.toHaveBeenCalled();
    act(() => result.current.revalidate());
    act(() => result.current.revalidate());
    await waitFor(() => expect(source.revalidate).toHaveBeenCalledTimes(1));
    act(() => update(newer));
    expect(result.current.packs).toBe(newer);
  });

  it("gives a table copy's pack row its text from the viewer's pack through the port (rowText)", async () => {
    const { source } = fakeSource();
    const { result } = renderHook(() => useDnd5eSheetAdapter({ system }), { wrapper: wrapperWith(source) });
    await waitFor(() => expect(playReference(result.current).packText).not.toBeNull());
    const reference = playReference(result.current);
    expect(reference.packText!.rowText(tableRow)).toBe("Craft faster.");
    expect(withPackRowText(reference, tableRow)).toEqual({ ...tableRow, text: "Craft faster." });
    expect(reference.packRefs.has("feat:whittler")).toBe(true);
    expect(reference.nameOf("feat:whittler")).toBe("Whittler");
  });

  it("keeps the sheet on the SRD alone without the port: no pack text, names or refs", async () => {
    const { result } = renderHook(() => useDnd5eSheetAdapter({ system }), { wrapper: wrapperWith(null) });
    await act(async () => {});
    const reference = playReference(result.current);
    expect(reference.packText).toBeNull();
    expect(reference.packRefs.size).toBe(0);
    expect(withPackRowText(reference, tableRow)).toBe(tableRow);
  });

  it("reads a table copy's packs with the table's GM homebrew when its setup takes it, and checks them when a picker opens", async () => {
    const { source } = fakeSource();
    const { result } = renderHook(() => useDnd5eSheetAdapter({ system, inTable: true }), {
      wrapper: wrapperWith(source, tablePort(["srd52", "gm-homebrew"])),
    });
    await waitFor(() => expect(source.readCached).toHaveBeenCalledWith({ tableId: "T" }));
    expect(source.revalidate).not.toHaveBeenCalled();
    act(() => result.current.handlers.openCompendium?.({}, () => {}));
    await waitFor(() => expect(source.revalidate).toHaveBeenCalledWith(expect.any(Function), { tableId: "T" }));
  });

  it("keeps a table copy without the GM's homebrew source, and a vault sheet, on the device's packs alone", async () => {
    const atTable = fakeSource();
    renderHook(() => useDnd5eSheetAdapter({ system, inTable: true }), { wrapper: wrapperWith(atTable.source, tablePort(["srd52", "device-packs"])) });
    await waitFor(() => expect(atTable.source.readCached).toHaveBeenCalled());
    expect(atTable.source.readCached).toHaveBeenCalledWith();
    const vault = fakeSource();
    renderHook(() => useDnd5eSheetAdapter({ system }), { wrapper: wrapperWith(vault.source) });
    await waitFor(() => expect(vault.source.readCached).toHaveBeenCalled());
    expect(vault.source.readCached).toHaveBeenCalledWith();
  });
});
