import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TableSetupAfterSaveHook, TableSetupAfterSaveResult } from "@skald/sheet-sdk/modules/systems";
import { bindHostPort, HostPortsProvider, type HostPortBinding } from "@skald/sheet-sdk/modules/systems/ui/host-ports";
import type { HomebrewItemKind, HomebrewItemRecord, HomebrewPayload } from "../../homebrew/domain/types";
import { dndHomebrewStorePort } from "../../homebrew/store-port";
import {
  dndTableHomebrewPort,
  type DndTableHomebrew,
  type TableShare,
  type TableShareItem,
  type TableShareList,
  type TableShareResult,
  type TableShareSummary,
} from "../../homebrew/table-share-port";
import { createMemoryHomebrewStore, type MemoryHomebrewState } from "../../homebrew/testing/memory-store";
import en from "../en.json";
import { SourceEditor } from "../editor";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

afterEach(cleanup);

const s = en.dndShare;
const OWNER = "owner-id";
const ASST = "asst-id";
const TABLE = "t1";

function row(id: string, kind: HomebrewItemKind, key: string, name: string, extra: Record<string, unknown> = {}, revision = 1): HomebrewItemRecord {
  return {
    id, packUuid: "pack-1", kind, key,
    payload: { entry: { kind, id: key, name, source: "homebrew", entries: [], ...extra } } as unknown as HomebrewPayload,
    revision, bytes: 1_024, updatedAt: "2026-11-27T00:00:00Z",
  };
}

const packState = (items: HomebrewItemRecord[]): MemoryHomebrewState => ({
  packs: [{ id: "pack-1", packId: "harbor", name: "Harbor", notice: "", packVersion: "1", position: 0, enabled: true, revision: 1, updatedAt: "2026-11-27T00:00:00Z" }],
  items,
});

const copy = (r: Pick<HomebrewItemRecord, "id" | "kind" | "key" | "revision">, name: string, revision = r.revision): TableShareItem => ({
  id: `copy-${r.id}`, kind: r.kind, key: r.key, name, sourceItemId: r.id, sourcePackId: "pack-1", sourceRevision: revision,
});

function share(sharedBy: string, items: TableShareItem[], revision = 3, name: string | null = sharedBy === OWNER ? "Mira" : "Rin"): TableShare {
  return {
    sharedBy, revision, itemCount: items.length, payloadBytes: items.length * 1_024,
    createdAt: "2026-11-01T00:00:00Z", updatedAt: "2026-11-01T00:00:00Z", sharerName: name, isOwner: sharedBy === OWNER, items,
  };
}

/** A fake table port over a list; a share copies the store's rows at their current revision. */
function fakePort(initial: TableShareList, rows: () => HomebrewItemRecord[]) {
  let state: TableShareList = structuredClone(initial);
  const port = {
    listShares: vi.fn(async (): Promise<TableShareResult<TableShareList>> => ({ ok: true, value: structuredClone(state) })),
    share: vi.fn(async (_table: string, ids: readonly string[], expected: number): Promise<TableShareResult<TableShareSummary | null>> => {
      const mine = state.shares.find((x) => x.sharedBy === state.viewerId);
      if ((mine?.revision ?? 0) !== expected) return { ok: false, error: "conflict", detail: "revision" };
      const items = ids.map((id) => rows().find((r) => r.id === id)!).map((r) => copy(r, r.payload.entry!.name));
      const next = share(state.viewerId, items, (mine?.revision ?? 0) + 1, null);
      state = { ...state, shares: [...state.shares.filter((x) => x.sharedBy !== state.viewerId), ...(ids.length ? [next] : [])] };
      return { ok: true, value: ids.length ? next : null };
    }),
    removeShare: vi.fn(async (_table: string, by: string): Promise<TableShareResult<boolean>> => {
      const had = state.shares.some((x) => x.sharedBy === by);
      state = { ...state, shares: state.shares.filter((x) => x.sharedBy !== by) };
      return { ok: true, value: had };
    }),
  };
  return port satisfies DndTableHomebrew;
}

function mount(options: { config: string[]; ports?: HostPortBinding[] }) {
  const hooks: TableSetupAfterSaveHook[] = [];
  const registerAfterSave = (hook: TableSetupAfterSaveHook) => {
    hooks.push(hook);
    return () => void hooks.splice(hooks.indexOf(hook), 1);
  };
  const onChange = vi.fn();
  function Harness() {
    const [config, setConfig] = useState(options.config);
    return (
      <SourceEditor tableId={TABLE} registerAfterSave={registerAfterSave} config={config}
        onChange={(next) => { onChange(next); setConfig(next); }} />
    );
  }
  const ports = options.ports ?? [];
  render(
    <NextIntlClientProvider locale="en" timeZone="UTC" messages={en}>
      <HostPortsProvider ports={ports}><Harness /></HostPortsProvider>
    </NextIntlClientProvider>,
  );
  const save = async (): Promise<TableSetupAfterSaveResult[]> => {
    let results: TableSetupAfterSaveResult[] = [];
    await act(async () => { results = await Promise.all(hooks.map((hook) => hook({ tableId: TABLE, revision: 2 }))); });
    return results;
  };
  return { onChange, save, hooks };
}

function withHomebrew(items: HomebrewItemRecord[], list: TableShareList, owner: "account" | "guest" = "account") {
  const store = createMemoryHomebrewStore({ initial: packState(items), owner });
  const port = fakePort(list, () => store.snapshot().items);
  return { store, port, ports: [bindHostPort(dndHomebrewStorePort, store), bindHostPort(dndTableHomebrewPort, port)] };
}

const checkbox = (name: string) => screen.getByRole("checkbox", { name });

describe("the D&D content sources editor", () => {
  it("keeps the SRD on, toggles players' packs, and hides the GM's homebrew without the host port", () => {
    const { onChange, hooks } = mount({ config: ["srd52", "device-packs"] });
    expect(checkbox(en.dndSources.options.srd)).toBeChecked();
    expect(checkbox(en.dndSources.options.srd)).toBeDisabled();
    expect(screen.queryByRole("checkbox", { name: en.dndSources.options.gm })).toBeNull();
    expect(hooks).toHaveLength(0);
    fireEvent.click(checkbox(en.dndSources.options.device));
    expect(onChange).toHaveBeenLastCalledWith(["srd52"]);
  });

  it("ticks the GM's homebrew, takes a subclass's class along, and shares on save", async () => {
    const rows = [
      row("spell", "spell", "ember", "Ember"),
      row("sub", "subclass", "lamp/keeper", "Keeper", { meta: { parent: "lamp" } }),
      row("sf", "subclassFeature", "lamp/keeper/wick-l3", "Wick"),
      row("class", "class", "lamp", "Lamp"),
      row("cf", "classFeature", "lamp/flare-l1", "Flare"),
    ];
    const { port, ports } = withHomebrew(rows, { viewerId: OWNER, ownerId: OWNER, shares: [] });
    const { onChange, save } = mount({ config: ["srd52"], ports });
    fireEvent.click(checkbox(en.dndSources.options.gm));
    expect(onChange).toHaveBeenLastCalledWith(["srd52", "gm-homebrew"]);
    fireEvent.click(await screen.findByRole("checkbox", { name: "Keeper" }));
    expect(checkbox("Lamp")).toBeChecked();
    expect(checkbox("Lamp")).toBeDisabled();
    expect(screen.getAllByText(s.added).length).toBeGreaterThan(0);
    expect(screen.getByText("4 / 300 entries")).toBeVisible();
    expect(await save()).toEqual([{ ok: true }]);
    expect(port.share).toHaveBeenCalledWith(TABLE, ["sub", "sf", "class", "cf"], 0);
    await waitFor(() => expect(port.listShares).toHaveBeenCalledTimes(2));
    expect(await save()).toEqual([{ ok: true }]);
    expect(port.share).toHaveBeenCalledTimes(1);
  });

  it("marks newer and deleted sources and copies again only after 「更新到桌上」", async () => {
    const spell = row("spell", "spell", "ember", "Ember", {}, 3);
    const gone = { id: "gone", kind: "feat" as const, key: "gone", revision: 1 };
    const { port, ports } = withHomebrew([spell], {
      viewerId: OWNER, ownerId: OWNER, shares: [share(OWNER, [copy(spell, "Ember", 1), copy(gone, "Gone")], 5)],
    });
    const { save } = mount({ config: ["srd52", "gm-homebrew"], ports });
    expect(await screen.findByText(s.status.newer)).toBeVisible();
    expect(screen.getByText("Gone")).toBeVisible();
    expect(screen.getByText(s.status.deleted)).toBeVisible();
    expect(await save()).toEqual([{ ok: true }]);
    expect(port.share).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: s.refresh }));
    expect(screen.getByText(s.status.willUpdate)).toBeVisible();
    expect(screen.getByText(s.status.willRemove)).toBeVisible();
    expect(await save()).toEqual([{ ok: true }]);
    expect(port.share).toHaveBeenCalledWith(TABLE, ["spell"], 5);
  });

  it("reloads on a conflict, keeps the ticks, and the next save sends them", async () => {
    const rows = [row("spell", "spell", "ember", "Ember")];
    const { port, ports } = withHomebrew(rows, { viewerId: OWNER, ownerId: OWNER, shares: [] });
    port.share.mockResolvedValueOnce({ ok: false, error: "conflict", detail: "revision" });
    const { save } = mount({ config: ["srd52", "gm-homebrew"], ports });
    fireEvent.click(await screen.findByRole("checkbox", { name: "Ember" }));
    expect(await save()).toEqual([{ ok: false, message: s.errors.conflict }]);
    expect(port.listShares).toHaveBeenCalledTimes(2);
    expect(checkbox("Ember")).toBeChecked();
    expect(await save()).toEqual([{ ok: true }]);
    expect(port.share).toHaveBeenLastCalledWith(TABLE, ["spell"], 0);
  });

  it("refuses two rows of one kind and key before sending, naming both", async () => {
    const rows = [row("a", "spell", "ember", "Ember"), row("b", "spell", "ember", "Ember Again")];
    const { port, ports } = withHomebrew(rows, { viewerId: OWNER, ownerId: OWNER, shares: [] });
    const { save } = mount({ config: ["srd52", "gm-homebrew"], ports });
    fireEvent.click(await screen.findByRole("checkbox", { name: "Ember" }));
    fireEvent.click(checkbox("Ember Again"));
    expect(await save()).toEqual([{ ok: false, message: s.errors.duplicate.replace("{first}", "Ember").replace("{second}", "Ember Again") }]);
    expect(port.share).not.toHaveBeenCalled();
  });

  it("names the entry the server refused as invalid", async () => {
    const rows = [row("spell", "spell", "ember", "Ember")];
    const { port, ports } = withHomebrew(rows, { viewerId: OWNER, ownerId: OWNER, shares: [] });
    port.share.mockResolvedValueOnce({ ok: false, error: "invalid", detail: "spell" });
    const { save } = mount({ config: ["srd52", "gm-homebrew"], ports });
    fireEvent.click(await screen.findByRole("checkbox", { name: "Ember" }));
    expect(await save()).toEqual([{ ok: false, message: s.errors.invalidEntry.replace("{name}", "Ember") }]);
  });

  it("lets the owner remove an assistant's share, and shows an assistant no remove button", async () => {
    const theirs = share(ASST, [copy({ id: "x", kind: "spell", key: "glow", revision: 1 }, "Glow")]);
    const { port, ports } = withHomebrew([], { viewerId: OWNER, ownerId: OWNER, shares: [theirs] });
    mount({ config: ["srd52", "gm-homebrew"], ports });
    const group = (await screen.findByText("Rin’s entries")).closest("section")!;
    expect(within(group).getByText("Glow")).toBeVisible();
    fireEvent.click(within(group).getByRole("button", { name: s.remove }));
    fireEvent.click(await screen.findByRole("button", { name: s.removeOther.confirm }));
    await waitFor(() => expect(port.removeShare).toHaveBeenCalledWith(TABLE, ASST));
    await waitFor(() => expect(screen.queryByText("Rin’s entries")).toBeNull());
    cleanup();

    const mine = share(OWNER, [copy({ id: "y", kind: "spell", key: "spark", revision: 1 }, "Spark")]);
    const asAssistant = withHomebrew([], { viewerId: ASST, ownerId: OWNER, shares: [mine] });
    mount({ config: ["srd52", "gm-homebrew"], ports: asAssistant.ports });
    const owners = (await screen.findByText("Mira’s entries")).closest("section")!;
    expect(within(owners).getByText(s.owner)).toBeVisible();
    expect(within(owners).queryByRole("button", { name: s.remove })).toBeNull();
  });

  it("asks before unticking and removes everyone's share on the owner's save", async () => {
    const spell = row("spell", "spell", "ember", "Ember");
    const { port, ports } = withHomebrew([spell], {
      viewerId: OWNER, ownerId: OWNER,
      shares: [share(OWNER, [copy(spell, "Ember")]), share(ASST, [copy({ id: "x", kind: "spell", key: "glow", revision: 1 }, "Glow")])],
    });
    const { onChange, save } = mount({ config: ["srd52", "gm-homebrew"], ports });
    await screen.findByRole("checkbox", { name: "Ember" });
    fireEvent.click(checkbox(en.dndSources.options.gm));
    expect(await screen.findByText(s.untick.owner)).toBeVisible();
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: s.untick.confirm }));
    expect(onChange).toHaveBeenLastCalledWith(["srd52"]);
    expect(await save()).toEqual([{ ok: true }]);
    expect(port.removeShare.mock.calls).toEqual([[TABLE, OWNER], [TABLE, ASST]]);
  });

  it("tells a guest account it cannot share, and still lists the table's shares", async () => {
    const theirs = share(OWNER, [copy({ id: "y", kind: "spell", key: "spark", revision: 1 }, "Spark")]);
    const { ports } = withHomebrew([], { viewerId: ASST, ownerId: OWNER, shares: [theirs] }, "guest");
    mount({ config: ["srd52", "gm-homebrew"], ports });
    expect(await screen.findByText(s.guest)).toBeVisible();
    expect(screen.getByText("Spark")).toBeVisible();
  });
});
