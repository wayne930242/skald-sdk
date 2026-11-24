import { useEffect, useRef, useState, type ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DiceRoll, SimpleDiceRoll } from "@skald/dice";
import type { Schema } from "@skald/types/schema";
import type { LoadedSystem } from "@skald/types/system";
import appZh from "@skald/sheet-sdk/messages/zh-TW.json";
import systemZh from "@skald/system-fate/data/fate-condensed/messages/zh-TW.json";
import schemaJson from "@skald/system-fate/data/fate-condensed/schema.json";
import defaultData from "@skald/system-fate/data/fate-condensed/default-data.json";
import { SchemaDataContext, SchemaStaticContext } from "@skald/sheet-sdk/modules/character/ui/renderer/schema-context";
import { SheetViewerContext } from "@skald/sheet-sdk/modules/character/ui/renderer/viewer-context";
import { bindHostPort, HostPortsProvider } from "@skald/sheet-sdk/modules/systems/ui/host-ports";
import { corePorts } from "@skald/sheet-sdk/modules/systems/ui/core-ports";
import { RollProvider } from "@skald/sheet-sdk/modules/rolls/ui/context/roll-context";
import { diceDispatchManager } from "@skald/sheet-sdk/modules/rolls/ui/roll-sink";
import { useRollSessionStore } from "@skald/sheet-sdk/modules/rolls/ui/stores/roll-session-store";
import { useRollPanelStore } from "@skald/sheet-sdk/modules/rolls/ui/stores/roll-panel-store";
import { useDiceRollerStore } from "@skald/sheet-sdk/modules/rolls/ui/stores/dice-roller-store";
import type { FateCharacterData } from "../../domain/character";
import type { FateSettledSnapshot, FateTableView } from "../../table-rules/domain/view";
import { FatePlayView } from "../play/play-view";
import { AspectInvoke, rollTray, SkillTrigger } from "../rolls/index";
import { resetFateRollStore } from "../rolls/roll-store";
import { setFateRollDeps } from "../rolls/use-fate-rolls";
import { applyFateCarryOut } from "./carry-out";
import { fateTableReadsPort, type FateCarryOutRead, type FateTableReads } from "./table-reads-port";
import { resetFateCopyActivations } from "./use-fate-table";
import { publishFateTableLink, resetFateTableBridge, type FateTableLink, type FateTableRollPort, type FateTableRollResult } from "./table-bridge";
import { FATE_TABLE_INVOKE_RPC, FATE_TABLE_ROOT_RPC, FateTableRollError, fateTableRootDelivery, sendFateTableInvoke } from "./table-rolls";

const activation = vi.hoisted(() => ({
  status: "active" as "active" | "free",
  reads: 0,
  /** Hold the next read until released (the sheet is still checking). */
  hold: null as null | Promise<void>,
}));
const readCarryOut = vi.fn<(characterId: string) => Promise<FateCarryOutRead>>();
/** The host's table reads (`fateTableReadsPort`), answered by the test. */
const tableReads: FateTableReads = {
  readCopyActivation: async () => {
    activation.reads += 1;
    if (activation.hold) await activation.hold;
    return activation.status === "active" ? { status: "active", tableId: "table-1", revision: 1 } : { status: "free" };
  },
  readCarryOut: (characterId) => readCarryOut(characterId),
};
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock("../../reference/fate-rules-dialog", () => ({ FateRulesDialog: () => <div role="dialog" /> }));

const schema = schemaJson as unknown as Schema;
const system = {
  config: { id: "fate-condensed", sheetComponent: "fate" },
  runtime: { systemId: "s", templateVersionId: "v", builtinTemplate: true },
  schema, template: { pages: [] }, defaultData, mappings: {}, gameData: {},
} as unknown as LoadedSystem;

const shen: Record<string, unknown> = {
  ...defaultData,
  name: "沈青霜",
  fatePoints: 2,
  aspects: { format: 2, aspects: [
    { id: "highConcept", kind: "highConcept", text: "遭東廠追殺的忠臣之女", freeInvokes: 0, secret: false },
    { id: "trouble", kind: "trouble", text: "一句不平便拔劍", freeInvokes: 0, secret: false },
  ] },
  skills: { skills: [{ id: "fight", name: "戰鬥", level: 4 }] },
  fateV2: { session: { id: "session-1", sequence: 1 } },
};

const host = { data: {} as Record<string, unknown>, writes: 0 };

interface SheetPermissions {
  isOwner?: boolean;
  editable?: boolean;
}

function Harness({ initial, isOwner, editable = true }: { initial: Record<string, unknown> } & SheetPermissions) {
  const [data, setData] = useState(initial);
  const working = useRef(initial);
  useEffect(() => {
    host.data = data;
  });
  const write = (updater: Record<string, unknown> | ((previous: Record<string, unknown>) => Record<string, unknown>)) => {
    host.writes += 1;
    const next = typeof updater === "function" ? updater(working.current) : updater;
    working.current = next;
    setData(next);
  };
  return (
    <SchemaStaticContext.Provider value={{ schema, editable, setupMode: false, printMode: false, viewMode: "web", setData: editable ? write : undefined, onBlur: () => {} }}>
      <SchemaDataContext.Provider value={{ data }}>
        <SheetViewerContext.Provider value={{ isOwner }}>
          <FatePlayView system={system} slots={{ rollTray, SkillTrigger, AspectInvoke }} />
        </SheetViewerContext.Provider>
      </SchemaDataContext.Provider>
    </SchemaStaticContext.Provider>
  );
}

function view(overrides: Partial<FateTableView> = {}): FateTableView {
  return {
    activation: { status: "active", revision: 1, protocolVersion: 1 },
    revision: 3,
    playSession: { id: "ps-1", ordinal: 1, startedAt: "2026-11-22T00:00:00Z" },
    scene: {
      id: "scene-1", ordinal: 1, title: "客棧", status: "open", playSessionId: "ps-1", revision: 1, openedAt: "2026-11-22T00:00:00Z",
      roster: ["char-1"], zones: [],
      aspects: { public: [{ id: "sa-1", kind: "situation", scope: "scene", zoneId: null, characterId: null, text: "滿堂賓客都在看", revision: 1 }] },
      grants: { public: [] },
    },
    wallets: [{ id: "w-1", unit: "fp", canView: true, canOperate: true, revision: 4, value: 5, characterId: "char-1", name: "沈青霜", refreshedPlaySessionId: "ps-1" }],
    offers: [],
    ledger: [],
    ...overrides,
  };
}

type Call = { rpc: string; operationId: string; payload: Record<string, unknown> };
const calls: { root: Call[]; followUp: Call[] } = { root: [], followUp: [] };
let rootReply: () => FateTableRollResult;
let followUpReply: () => FateTableRollResult;
const ok = (result: Record<string, unknown> & { messageId: string }): FateTableRollResult =>
  ({ ok: true, value: { tableId: "table-1", actorId: "user-1", operationId: "op", result } });

const port: FateTableRollPort = {
  postRoot: async (rpc, command) => {
    calls.root.push({ rpc, operationId: command.operationId, payload: command.payload as unknown as Record<string, unknown> });
    return rootReply();
  },
  publishFollowUp: async (rpc, command) => {
    calls.followUp.push({ rpc, operationId: command.operationId, payload: command.payload as unknown as Record<string, unknown> });
    return followUpReply();
  },
};

function link(overrides: Partial<FateTableLink> = {}): FateTableLink {
  return {
    tableId: "table-1", userId: "user-1", characterId: "char-1", canControl: true, isGmRunner: false,
    status: "ready", view: view(), others: [], loadOthers: () => {}, port, refresh: () => {}, ...overrides,
  };
}

const sent: DiceRoll[] = [];
let operations = 0;

/** The host's locale-aware link, as a plain anchor. */
const navigationPort = bindHostPort(corePorts.navigationLink, (props: React.ComponentPropsWithoutRef<"a"> & { href: string }) => <a {...props} />);
const tableReadsBinding = bindHostPort(fateTableReadsPort, tableReads);

async function mount(
  permissions: SheetPermissions = {},
  { navigation = true, tables = true }: { navigation?: boolean; tables?: boolean } = {},
) {
  host.writes = 0;
  cleanup();
  const ports = [...(navigation ? [navigationPort] : []), ...(tables ? [tableReadsBinding] : [])];
  const wrapper = ({ children }: { children: ReactNode }) => (
    <NextIntlClientProvider locale="zh-TW" messages={{ ...appZh, ...systemZh, roll: { ...appZh.roll, ...systemZh.roll } }} timeZone="UTC">
      <HostPortsProvider ports={ports}>{children}</HostPortsProvider>
    </NextIntlClientProvider>
  );
  await act(async () => {
    render(<RollProvider characterId="char-1" characterName="沈青霜"><Harness initial={shen} {...permissions} /></RollProvider>, { wrapper });
  });
  await screen.findByRole("button", { name: /^擲 戰鬥/ });
  await screen.findByText("擲骰盤");
}

const fight = () => document.querySelector("[data-fate-roll-trigger='fight']") as HTMLElement;
const tray = () => document.querySelector("[data-fate-roll-tray]") as HTMLElement;
const points = () => document.querySelector("[data-fate-points]") as HTMLElement;

async function rollFight() {
  await act(async () => {
    fireEvent.click(fight());
  });
}

async function invokeOwn(effect: RegExp, aspect: RegExp) {
  await act(async () => {
    fireEvent.click(within(tray()).getByRole("button", { name: effect }));
  });
  const dialog = screen.getByRole("dialog", { name: "在遊戲桌上援引" });
  await act(async () => {
    fireEvent.click(within(dialog).getByRole("radio", { name: aspect }));
  });
  await act(async () => {
    fireEvent.click(within(dialog).getByRole("button", { name: /^確認援引/ }));
  });
  return dialog;
}

beforeEach(() => {
  activation.status = "active";
  activation.reads = 0;
  activation.hold = null;
  readCarryOut.mockReset().mockResolvedValue({ status: "none" });
  resetFateCopyActivations();
  calls.root.length = 0;
  calls.followUp.length = 0;
  sent.length = 0;
  operations = 0;
  rootReply = () => ok({ messageId: "m-root", rollRevision: 1, sceneId: "scene-1" });
  followUpReply = () => ok({ messageId: "m-2", rollRevision: 2, faces: [1, 1, 0, 0], total: 8, available: 4 });
  resetFateRollStore();
  resetFateTableBridge();
  setFateRollDeps({
    random: () => 0.5,
    operationId: () => `00000000-0000-4000-8000-${String(++operations).padStart(12, "0")}`,
    wait: async () => {},
  });
  // Every face reads 0 (`Math.floor(random() * 3) - 1`).
  vi.spyOn(Math, "random").mockImplementation(() => 0.5);
  useRollPanelStore.setState({ audience: "all", audienceTableId: "table-1" });
  useRollSessionStore.setState({ currentUserId: "user-1", currentUserName: "洪偉", currentTableId: "table-1", currentUserAvatarUrl: null });
  diceDispatchManager.registerHandler({ id: "test-sink", name: "test", isAvailable: () => true, dispatch: async (roll) => { sent.push(roll); } });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  setFateRollDeps();
  resetFateTableBridge();
  diceDispatchManager.removeHandler("test-sink");
  useRollSessionStore.setState({ currentUserId: null, currentUserName: null, currentTableId: null, currentUserAvatarUrl: null });
  useDiceRollerStore.setState({ rollerRef: null });
});

describe("F6 at an active table (plan-r2 T3)", () => {
  it("shows the wallet and posts the root through the table's roll RPC, never the chat sink", async () => {
    publishFateTableLink(link());
    await mount();
    await waitFor(() => expect(points().dataset.fateTable).toBe("table"));
    expect(points().querySelector("[data-fate-table-points='wallet']")).toBeTruthy();
    expect(within(points()).getByRole("img", { name: /5/ })).toBeTruthy();
    await rollFight();
    await waitFor(() => expect(tray().dataset.root).toBeTruthy());
    expect(calls.root).toHaveLength(1);
    expect(calls.root[0].rpc).toBe(FATE_TABLE_ROOT_RPC);
    expect(calls.root[0].payload.audience).toBe("all");
    expect(calls.root[0].payload.details).toEqual({ rating: 4, bonus: 0, opposition: 0 });
    expect(sent).toHaveLength(0);
    expect(tray().querySelector("[data-fate-delivery]")?.getAttribute("data-fate-delivery")).toBe("table");
    expect(host.writes).toBe(0);
  });

  it("a refused root roll shows the table's error and records nothing on the sheet", async () => {
    rootReply = () => ({ ok: false, code: "conflict" });
    publishFateTableLink(link());
    await mount();
    await waitFor(() => expect(points().dataset.fateTable).toBe("table"));
    await rollFight();
    await waitFor(() => expect(document.querySelector("[data-fate-table-failure]")?.getAttribute("data-fate-table-failure")).toBe("conflict"));
    expect(tray().dataset.empty).toBeDefined();
    expect(sent).toHaveLength(0);
    expect(host.writes).toBe(0);
  });

  it("a paid invoke goes to the table with the wallet as payer; the faces are the table's; the card's points stay", async () => {
    publishFateTableLink(link());
    await mount();
    await waitFor(() => expect(points().dataset.fateTable).toBe("table"));
    await rollFight();
    await waitFor(() => expect(tray().dataset.root).toBeTruthy());
    await invokeOwn(/援引形象 \+2/, /一句不平便拔劍/);
    await waitFor(() => expect(calls.followUp).toHaveLength(1));
    const call = calls.followUp[0];
    expect(call.rpc).toBe(FATE_TABLE_INVOKE_RPC);
    expect(call.payload.followUpOf).toBe("m-root");
    expect(call.payload.audience).toBe("all");
    expect(call.payload.details).toEqual({
      effect: "plus2", source: "wallet", aspect: { kind: "character", characterId: "char-1", aspectId: "trouble" },
      hostile: false, expectedRevision: 1,
    });
    await waitFor(() => expect(tray().querySelector("[data-fate-revision]")).toBeTruthy());
    expect(sent).toHaveLength(0);
    expect(host.writes).toBe(0);
    expect(host.data.fatePoints).toBe(2);
  });

  it("an unknown invoke outcome is resent with the same operation, and never as a new one", async () => {
    followUpReply = () => ({ ok: false, code: "unavailable" });
    publishFateTableLink(link());
    await mount();
    await waitFor(() => expect(points().dataset.fateTable).toBe("table"));
    await rollFight();
    await waitFor(() => expect(tray().dataset.root).toBeTruthy());
    await invokeOwn(/重擲/, /滿堂賓客都在看/);
    await waitFor(() => expect(document.querySelector("[data-fate-table-confirm]")).toBeTruthy());
    const first = new Set(calls.followUp.map((c) => c.operationId));
    expect(first.size).toBe(1);
    expect(calls.followUp.length).toBe(3);
    followUpReply = () => ok({ messageId: "m-2", rollRevision: 2, faces: [-1, 1, 1, 1], total: 6, available: 4 });
    await act(async () => {
      fireEvent.click(document.querySelector("[data-fate-table-confirm]") as HTMLElement);
    });
    await waitFor(() => expect(document.querySelector("[data-fate-table-confirm]")).toBeNull());
    expect(new Set(calls.followUp.map((c) => c.operationId))).toEqual(first);
    expect(host.writes).toBe(0);
  });

  it("an active copy the sheet cannot reach is read-only: no balance, no roll, no local fallback", async () => {
    await mount();
    await waitFor(() => expect(points().querySelector("[data-fate-table-points='elsewhere']")).toBeTruthy());
    expect(within(points()).queryByRole("img")).toBeNull();
    await rollFight();
    await waitFor(() => expect(document.querySelector("[data-fate-table-failure]")?.getAttribute("data-fate-table-failure")).toBe("readOnly"));
    expect(calls.root).toHaveLength(0);
    expect(sent).toHaveLength(0);
    expect(host.writes).toBe(0);
  });

  it("a copy of an inactive table keeps the sheet's own roll through the chat sink", async () => {
    activation.status = "free";
    await mount();
    await waitFor(() => expect(points().dataset.fateTable).toBeUndefined());
    await rollFight();
    await waitFor(() => expect(tray().dataset.root).toBeTruthy());
    expect(calls.root).toHaveLength(0);
    expect(sent).toHaveLength(1);
  });
});

describe("a host without tables (no fateTableReadsPort)", () => {
  it("keeps the sheet's own behaviour in a session: no table read, the roll goes through the chat sink", async () => {
    await mount({}, { tables: false });
    expect(points().dataset.fateTable).toBeUndefined();
    expect(within(points()).getByRole("img", { name: /2/ })).toBeTruthy();
    await rollFight();
    await waitFor(() => expect(tray().dataset.root).toBeTruthy());
    expect(activation.reads).toBe(0);
    expect(calls.root).toHaveLength(0);
    expect(sent).toHaveLength(1);
  });

  it("offers the owner no carry-out and reads nothing", async () => {
    readCarryOut.mockResolvedValue({ status: "ready", tableId: "table-1", snapshot: {
      characterId: "char-1", fatePoints: 7, walletRevision: 9, tableRevision: 3,
      activation: { status: "inactive", revision: 2 }, tableDeleted: false,
    } });
    await mount({ isOwner: true }, { tables: false });
    expect(points().querySelector("[data-fate-carry-out]")).toBeNull();
    expect(readCarryOut).not.toHaveBeenCalled();
    expect(activation.reads).toBe(0);
  });
});

describe("review fixes (fate-t3-review)", () => {
  it("F004: a root roll with an unknown outcome waits; 再確認一次 resends the same operation", async () => {
    rootReply = () => ({ ok: false, code: "unavailable" });
    publishFateTableLink(link());
    await mount();
    await waitFor(() => expect(points().dataset.fateTable).toBe("table"));
    await rollFight();
    await waitFor(() => expect(document.querySelector("[data-fate-table-root-pending]")).toBeTruthy());
    expect(calls.root).toHaveLength(3);
    const operation = calls.root[0].operationId;
    expect(new Set(calls.root.map((c) => c.operationId))).toEqual(new Set([operation]));
    rootReply = () => ok({ messageId: "m-root", rollRevision: 1, sceneId: "scene-1" });
    await act(async () => {
      fireEvent.click(document.querySelector("[data-fate-table-root-confirm]") as HTMLElement);
    });
    await waitFor(() => expect(tray().dataset.root).toBeTruthy());
    expect(calls.root.at(-1)?.operationId).toBe(operation);
    expect(calls.root.at(-1)?.payload).toEqual(calls.root[0].payload);
    expect(document.querySelector("[data-fate-table-root-pending]")).toBeNull();
    expect(document.querySelector("[data-fate-table-failure]")).toBeNull();
    expect(sent).toHaveLength(0);
  });

  it("F004: letting an unknown root go records nothing and says so", async () => {
    rootReply = () => ({ ok: false, code: "unavailable" });
    publishFateTableLink(link());
    await mount();
    await waitFor(() => expect(points().dataset.fateTable).toBe("table"));
    await rollFight();
    await waitFor(() => expect(document.querySelector("[data-fate-table-root-abandon]")).toBeTruthy());
    await act(async () => {
      fireEvent.click(document.querySelector("[data-fate-table-root-abandon]") as HTMLElement);
    });
    await waitFor(() => expect(document.querySelector("[data-fate-table-failure]")?.getAttribute("data-fate-table-failure")).toBe("abandoned"));
    expect(tray().dataset.empty).toBeDefined();
    expect(host.writes).toBe(0);
  });

  it("F005: while the activation is read the sheet stays v2, and a roll waits for the answer", async () => {
    activation.status = "free";
    let release!: () => void;
    activation.hold = new Promise((resolve) => { release = resolve; });
    await mount();
    expect(points().dataset.fateTable).toBeUndefined();
    expect(within(points()).getByRole("img", { name: /2/ })).toBeTruthy();
    await rollFight();
    expect(document.querySelector("[data-fate-table-failure]")).toBeNull();
    await act(async () => { release(); });
    await waitFor(() => expect(tray().dataset.root).toBeTruthy());
    expect(sent).toHaveLength(1);
    expect(calls.root).toHaveLength(0);
  });

  it("F005: one activation read per character, kept across remounts", async () => {
    activation.status = "free";
    await mount();
    await waitFor(() => expect(activation.reads).toBe(1));
    await mount();
    await rollFight();
    await waitFor(() => expect(tray().dataset.root).toBeTruthy());
    expect(activation.reads).toBe(1);
  });

  it("F006: a v2 roll's result is not claimed once the table holds the copy", async () => {
    activation.status = "free";
    await mount();
    await rollFight();
    await waitFor(() => expect(tray().dataset.root).toBeTruthy());
    // +4 against +0 with four blanks: success with style, a boost to claim.
    expect(within(tray()).queryAllByRole("button", { name: /取得|推助|boost/i }).length).toBeGreaterThan(0);
    await act(async () => {
      publishFateTableLink(link({ status: "error", code: "unavailable" }));
    });
    await waitFor(() => expect(points().dataset.fateTable).toBe("readOnly"));
    expect(within(tray()).queryAllByRole("button", { name: /取得|推助|boost/i })).toHaveLength(0);
  });

  it("F007/F008: the picker reads the other cards when it opens and names them through a message", async () => {
    const loadOthers = vi.fn();
    publishFateTableLink(link({
      loadOthers,
      others: [{ characterId: "char-2", characterName: "小柏", aspectId: "b-hc", kind: "highConcept", text: "Street doctor" }],
    }));
    await mount();
    await waitFor(() => expect(points().dataset.fateTable).toBe("table"));
    await rollFight();
    await waitFor(() => expect(tray().dataset.root).toBeTruthy());
    expect(loadOthers).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(within(tray()).getByRole("button", { name: /援引形象 \+2/ }));
    });
    const dialog = screen.getByRole("dialog", { name: "在遊戲桌上援引" });
    expect(loadOthers).toHaveBeenCalledTimes(1);
    expect(within(dialog).getByRole("radio", { name: "小柏：Street doctor" })).toBeTruthy();
  });
});

describe("table roll transport", () => {
  const roll = (visibility: string) => ({ visibility } as unknown as SimpleDiceRoll);

  it("refuses a private audience before calling the table", async () => {
    const deliver = fateTableRootDelivery(port, "op-1", { rating: 1, bonus: 0, opposition: 0 }, () => {}, async () => {});
    await expect(deliver(roll("self"))).rejects.toBeInstanceOf(FateTableRollError);
    expect(calls.root).toHaveLength(0);
  });

  it("rejects with the table's code; nothing is posted another way", async () => {
    rootReply = () => ({ ok: false, code: "forbidden" });
    const deliver = fateTableRootDelivery(port, "op-1", { rating: 1, bonus: 0, opposition: 0 }, () => {}, async () => {});
    await expect(deliver(roll("gm"))).rejects.toMatchObject({ code: "forbidden" });
    expect(calls.root).toHaveLength(1);
  });

  it("an invoke answer without four faces is invalid, not a guess", async () => {
    followUpReply = () => ok({ messageId: "m-2", rollRevision: 2, faces: [1, 1], total: 8 });
    const outcome = await sendFateTableInvoke({
      port, root: { messageId: "m-root", audience: "gm", revision: 1 }, operationId: "op-2", label: "x", wait: async () => {},
      request: { effect: "plus2", source: "grant", grantId: "g-1", aspectKey: "scene:sa-1", isBoost: false, label: "x" },
    });
    expect(outcome).toEqual({ ok: false, code: "invalid" });
    expect(calls.followUp[0].payload.details).toEqual({ effect: "plus2", source: "grant", grantId: "g-1", expectedRevision: 1 });
  });
});

describe("carry-out", () => {
  const snapshot: FateSettledSnapshot = {
    characterId: "char-1", fatePoints: 7, walletRevision: 9, tableRevision: 3,
    activation: { status: "inactive", revision: 2 }, tableDeleted: false,
  };

  const buttonName = "帶出已入帳點數";
  const sceneHint = "場景進行中：關場後才能帶出命運點。";

  it("enables carry-out for the copy owner when the mounted session receives a scene close", async () => {
    readCarryOut.mockResolvedValue({ status: "sceneOpen", tableId: "table-1" });
    publishFateTableLink(link());
    await mount({ isOwner: true });
    await within(points()).findByText(sceneHint);

    readCarryOut.mockResolvedValue({ status: "ready", tableId: "table-1", snapshot });
    act(() => publishFateTableLink(link({ view: view({ scene: null, revision: 4 }) })));
    const button = await within(points()).findByRole("button", { name: buttonName });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "寫入角色卡" })); });
    expect(host.writes).toBe(1);
    expect(host.data.fatePoints).toBe(snapshot.fatePoints);
  });

  it("shows the disabled carry-out entry and reason while the scene is open", async () => {
    readCarryOut.mockResolvedValue({ status: "sceneOpen", tableId: "table-1" });
    publishFateTableLink(link());
    await mount({ isOwner: true });
    const button = await within(points()).findByRole("button", { name: buttonName });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription(sceneHint);
  });

  it("drops an unconfirmed snapshot when a new scene opens", async () => {
    readCarryOut.mockResolvedValue({ status: "ready", tableId: "table-1", snapshot });
    publishFateTableLink(link({ view: view({ scene: null }) }));
    await mount({ isOwner: true });
    fireEvent.click(await within(points()).findByRole("button", { name: buttonName }));
    expect(screen.getByRole("button", { name: "寫入角色卡" })).toBeEnabled();

    readCarryOut.mockResolvedValue({ status: "sceneOpen", tableId: "table-1" });
    await act(async () => { publishFateTableLink(link({ view: view({ revision: 4 }) })); });
    expect(screen.queryByRole("button", { name: "寫入角色卡" })).not.toBeInTheDocument();
    expect(within(points()).getByRole("button", { name: buttonName })).toBeDisabled();
    expect(host.writes).toBe(0);
  });

  it("offers a full-sheet link instead of a write on a read-only session host", async () => {
    readCarryOut.mockResolvedValue({ status: "ready", tableId: "table-1", snapshot });
    publishFateTableLink(link({ view: view({ scene: null }) }));
    await mount({ isOwner: true, editable: false });
    const entry = await within(points()).findByRole("link", { name: buttonName });
    expect(entry).toHaveAttribute("href", expect.stringMatching(/\/sheets\/fate-condensed\/char-1$/));
    // The session stays open: the link opens beside it, like the panel's own full-editor link.
    expect(entry).toHaveAttribute("target", "_blank");
    expect(entry).toHaveAttribute("rel", "noopener");
    expect(host.writes).toBe(0);
  });

  it("shows the full-sheet entry off, with the reason, on a host that cannot open the full sheet", async () => {
    readCarryOut.mockResolvedValue({ status: "ready", tableId: "table-1", snapshot });
    publishFateTableLink(link({ view: view({ scene: null }) }));
    await mount({ isOwner: true, editable: false }, { navigation: false });
    const entry = await within(points()).findByRole("button", { name: buttonName });
    expect(entry).toBeDisabled();
    expect(entry).toHaveAccessibleDescription("這裡無法開啟完整角色卡。");
    expect(within(points()).queryByRole("link", { name: buttonName })).toBeNull();
    expect(host.writes).toBe(0);
  });

  it("never reads or offers carry-out for a non-owner, even with write access", async () => {
    readCarryOut.mockResolvedValue({ status: "ready", tableId: "table-1", snapshot });
    publishFateTableLink(link({ view: view({ scene: null }) }));
    await mount({ isOwner: false });
    expect(within(points()).queryByRole("button", { name: buttonName })).not.toBeInTheDocument();
    expect(within(points()).queryByRole("link", { name: buttonName })).not.toBeInTheDocument();
    expect(readCarryOut).not.toHaveBeenCalled();
  });

  it("writes only the booked balance, once per wallet revision", () => {
    const once = applyFateCarryOut(shen as FateCharacterData, snapshot, "table-1", "帶出");
    expect(once.fatePoints).toBe(7);
    const ledger = (once.fateV2 as { ledger: { operationId: string; delta: number }[] }).ledger;
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({ operationId: "carry-out:table-1:9", delta: 5 });
    expect(applyFateCarryOut(once, snapshot, "table-1", "帶出")).toBe(once);
  });
});
