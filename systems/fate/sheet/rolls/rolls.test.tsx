import { Suspense, useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DiceRoll, SimpleDiceRoll } from "@skald/dice";
import type { Schema, SheetMode } from "@skald/types/schema";
import type { LoadedSystem } from "@skald/types/system";
import appZh from "@skald/sheet-sdk/messages/zh-TW.json";
import systemZh from "@skald/system-fate/data/fate-condensed/messages/zh-TW.json";
import schemaJson from "@skald/system-fate/data/fate-condensed/schema.json";
import defaultData from "@skald/system-fate/data/fate-condensed/default-data.json";
import rollsEn from "@skald/system-fate/data/fate-condensed/messages/v2-rolls/en.json";
import rollsZh from "@skald/system-fate/data/fate-condensed/messages/v2-rolls/zh-TW.json";
import { SchemaDataContext, SchemaStaticContext } from "@skald/sheet-sdk/modules/character/ui/renderer/schema-context";
import { SheetModeProvider } from "@skald/sheet-sdk/modules/character/ui/renderer/sheet-mode";
import { RollProvider } from "@skald/sheet-sdk/modules/rolls/ui/context/roll-context";
import { diceDispatchManager } from "@skald/sheet-sdk/modules/rolls/ui/roll-sink";
import { useRollSessionStore } from "@skald/sheet-sdk/modules/rolls/ui/stores/roll-session-store";
import { useRollPanelStore } from "@skald/sheet-sdk/modules/rolls/ui/stores/roll-panel-store";
import { useDiceRollerStore } from "@skald/sheet-sdk/modules/rolls/ui/stores/dice-roller-store";
import { LONG_PRESS_MS } from "@skald/sheet-sdk/modules/rolls/ui/dice/use-long-press";
import { readFateAspects, readFateStunts } from "../../domain/normalize";
import { FatePlayView } from "../play/play-view";
import { AspectInvoke, rollTray, SkillTrigger } from "./index";
import { resetFateRollStore } from "./roll-store";
import { defaultFateRollOptions } from "../../domain/roll";
import { FateRollMessages } from "./roll-messages";
import { setFateRollDeps, useFateRolls } from "./use-fate-rolls";

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock("../../reference/fate-rules-dialog", () => ({
  FateRulesDialog: ({ initialSection }: { initialSection?: string }) => <div role="dialog" data-rules-section={initialSection} />,
}));

const schema = schemaJson as unknown as Schema;
const system = {
  config: { id: "fate-condensed", sheetComponent: "fate" },
  runtime: { systemId: "s", templateVersionId: "v", builtinTemplate: true },
  schema, template: { pages: [] }, defaultData, mappings: {}, gameData: {},
} as unknown as LoadedSystem;

const SECRET = "客棧後院的密道我走過一次";
const shen: Record<string, unknown> = {
  ...defaultData,
  name: "沈青霜",
  fatePoints: 2,
  aspects: { format: 2, aspects: [
    { id: "highConcept", kind: "highConcept", text: "遭東廠追殺的忠臣之女", freeInvokes: 0, secret: false },
    { id: "trouble", kind: "trouble", text: "一句不平便拔劍", freeInvokes: 0, secret: false },
    { id: "freeAspect1", kind: "free", text: "江湖上沒人認得我的劍法", freeInvokes: 0, secret: false },
    { id: "freeAspect2", kind: "free", text: SECRET, freeInvokes: 0, secret: true },
    { id: "boost-1", kind: "boost", text: "看穿他的破綻", freeInvokes: 1, secret: false },
    { id: "situation-1", kind: "situation", text: "滿堂賓客都在看", freeInvokes: 1, secret: false },
  ] },
  skills: { skills: [{ id: "fight", name: "戰鬥", level: 4 }, { id: "stealth", name: "隱匿", level: 3 }] },
  stunts: { stunts: [
    { id: "quick-blade", type: "bonus", title: "快劍", skillId: "fight", action: "attack", circumstance: "對手尚未出手" },
    { id: "once-a-night", type: "bonus", title: "一夜一次", skillId: "fight", circumstance: "月黑風高", oncePerSession: true },
  ] },
  fateV2: { session: { id: "session-1", sequence: 1 } },
};

type Updater = Record<string, unknown> | ((previous: Record<string, unknown>) => Record<string, unknown>);
const host = {
  data: {} as Record<string, unknown>,
  writes: 0,
  dropWrites: false,
  replace: (_next: Record<string, unknown>) => {},
};

function Harness({ initial, editable, mode, extra }: { initial: Record<string, unknown>; editable: boolean; mode?: SheetMode; extra?: ComponentType }) {
  const [data, setData] = useState(initial);
  // Like the character runtime: the updater runs at once against the latest working copy.
  const working = useRef(initial);
  useEffect(() => {
    host.data = data;
    host.replace = (next) => {
      working.current = next;
      setData(next);
    };
  });
  const write = (updater: Updater) => {
    host.writes += 1;
    if (host.dropWrites) return;
    const next = typeof updater === "function" ? updater(working.current) : updater;
    working.current = next;
    setData(next);
  };
  const view = <FatePlayView system={system} slots={{ rollTray, SkillTrigger, AspectInvoke, ...(extra ? { stunts: extra } : {}) }} />;
  return (
    <SchemaStaticContext.Provider value={{ schema, editable, setupMode: mode === "edit", printMode: false, viewMode: "web", setData: write, onBlur: () => {} }}>
      <SchemaDataContext.Provider value={{ data }}>
        {/* Like TemplateRenderer: the host's mode reaches the play view through SheetModeProvider. */}
        {mode ? <SheetModeProvider mode={mode}>{view}</SheetModeProvider> : view}
      </SchemaDataContext.Provider>
    </SchemaStaticContext.Provider>
  );
}

interface MountOptions {
  editable?: boolean;
  roller?: boolean;
  onBehalf?: boolean;
  data?: Record<string, unknown>;
  /** The host's sheet mode; omitted = no SheetModeProvider (play). */
  mode?: SheetMode;
  /** One more surface in the stunts slot (a probe of the roll transactions). */
  extra?: ComponentType;
}

async function mount({ editable = true, roller = true, onBehalf = false, data = shen, mode, extra }: MountOptions = {}) {
  host.writes = 0;
  const wrapper = ({ children }: { children: ReactNode }) => (
    <NextIntlClientProvider locale="zh-TW" messages={{ ...appZh, ...systemZh, roll: { ...appZh.roll, ...systemZh.roll } }} timeZone="UTC">{children}</NextIntlClientProvider>
  );
  const tree = (sheetMode?: SheetMode) => {
    const sheet = <Harness initial={data} editable={editable} mode={sheetMode} extra={extra} />;
    return roller ? <RollProvider characterId="char-1" characterName="沈青霜" onBehalf={onBehalf}>{sheet}</RollProvider> : sheet;
  };
  let mounted!: ReturnType<typeof render>;
  await act(async () => {
    mounted = render(tree(mode), { wrapper });
  });
  await screen.findByRole("region", { name: "形象" });
  return (sheetMode: SheetMode) => mounted.rerender(tree(sheetMode));
}

/** Messages and the preset catalog load lazily: wait for the triggers and the tray. */
async function ready() {
  await screen.findByRole("button", { name: /^擲 戰鬥/ });
  await screen.findByText("擲骰盤");
}

// Fate dice read `Math.floor(random() * 3) - 1`.
const value = (face: number) => (face + 1) / 3 + 0.1;
let dice: number[] = [];
function queueFaces(...faces: number[]) {
  dice.push(...faces.map(value));
}

const sent: DiceRoll[] = [];
let sinkBehaviour: ((roll: DiceRoll) => Promise<void>) | null = null;

function joinTable() {
  useRollSessionStore.setState({ currentUserId: "user-1", currentUserName: "洪偉", currentTableId: "table-1", currentUserAvatarUrl: null });
  diceDispatchManager.registerHandler({
    id: "test-sink",
    name: "test",
    isAvailable: () => true,
    dispatch: async (roll) => {
      sent.push(roll);
      if (sinkBehaviour) await sinkBehaviour(roll);
    },
  });
}

// By attribute: while a dialog is open the rest of the page is hidden from the accessibility tree.
const fight = () => document.querySelector("[data-fate-roll-trigger='fight']") as HTMLElement;
const tray = () => document.querySelector("[data-fate-roll-tray]") as HTMLElement;
const roots = () => sent.filter((roll) => !String((roll as SimpleDiceRoll).label ?? "").includes("援引"));
const followUps = () => sent.filter((roll) => String((roll as SimpleDiceRoll).label ?? "").includes("援引")) as SimpleDiceRoll[];
const ledger = () => ((host.data.fateV2 as Record<string, unknown>).ledger ?? []) as { reason: string; delta: number }[];
const receipt = () => Object.values(((host.data.fateV2 as Record<string, unknown>).receipts ?? {}) as Record<string, { status: string }>);

async function rollFight(...faces: number[]) {
  queueFaces(...faces);
  await act(async () => {
    fireEvent.click(fight());
  });
  await waitFor(() => expect(tray().dataset.root).toBeTruthy());
}

async function openPicker(name: RegExp) {
  await act(async () => {
    fireEvent.click(within(tray()).getByRole("button", { name }));
  });
  return screen.getByRole("dialog", { name: /援引形象/ });
}

async function confirmInvoke(dialog: HTMLElement) {
  await act(async () => {
    fireEvent.click(within(dialog).getByRole("button", { name: /^確認援引/ }));
  });
}

beforeEach(() => {
  host.dropWrites = false;
  dice = [];
  sent.length = 0;
  sinkBehaviour = null;
  resetFateRollStore();
  vi.spyOn(Math, "random").mockImplementation(() => dice.shift() ?? 0.5);
  useRollPanelStore.setState({ audience: "all", audienceTableId: "table-1" });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  setFateRollDeps();
  diceDispatchManager.removeHandler("test-sink");
  useRollSessionStore.setState({ currentUserId: null, currentUserName: null, currentTableId: null, currentUserAvatarUrl: null });
  useDiceRollerStore.setState({ rollerRef: null });
});

describe("roll trigger gestures (B-022)", () => {
  it("a tap rolls a +0 skill once with the defaults: overcome against +0, nothing selected", async () => {
    joinTable();
    await mount();
    await ready();
    const crafts = screen.getByRole("button", { name: "擲 工匠 +0" });
    queueFaces(1, 0, 0, -1);
    await act(async () => {
      fireEvent.click(crafts);
    });
    await waitFor(() => expect(roots()).toHaveLength(1));
    const root = roots()[0] as SimpleDiceRoll;
    expect(root.rolls).toEqual([1, 0, 0, -1]);
    expect(root.total).toBe(0);
    expect(root.targetValue).toBe(0);
    expect(root.label).toMatch(/^工匠 #[a-z0-9]{4}$/);
    expect(within(tray()).getByText("對抗 +0 平庸")).toBeTruthy();
    expect(tray().querySelector("[data-fate-outcome]")?.textContent).toBe("平手");
    expect(tray().querySelector("[data-fate-faces]")?.getAttribute("data-fate-faces")).toBe("1,0,0,-1");
    // Rolling writes nothing to the sheet.
    expect(host.writes).toBe(0);
  });

  it("a long press opens the options and the click that follows does not roll; a short press rolls", async () => {
    joinTable();
    await mount();
    await ready();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    fireEvent.pointerDown(fight(), { button: 0, clientX: 10, clientY: 10 });
    act(() => {
      vi.advanceTimersByTime(LONG_PRESS_MS);
    });
    fireEvent.pointerUp(fight());
    await act(async () => {
      fireEvent.click(fight());
    });
    expect(screen.getByRole("dialog", { name: "擲骰選項" })).toBeTruthy();
    expect(roots()).toHaveLength(0);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "取消" }));
    });
    expect(screen.queryByRole("dialog", { name: "擲骰選項" })).toBeNull();

    fireEvent.pointerDown(fight(), { button: 0, clientX: 10, clientY: 10 });
    act(() => {
      vi.advanceTimersByTime(LONG_PRESS_MS - 200);
    });
    fireEvent.pointerUp(fight());
    queueFaces(0, 0, 0, 0);
    await act(async () => {
      fireEvent.click(fight());
    });
    vi.useRealTimers();
    await waitFor(() => expect(roots()).toHaveLength(1));
    expect(screen.queryByRole("dialog", { name: "擲骰選項" })).toBeNull();
  });

  it("right click opens the options without rolling", async () => {
    joinTable();
    await mount();
    await ready();
    await act(async () => {
      fireEvent.contextMenu(fight());
    });
    expect(screen.getByRole("dialog", { name: "擲骰選項" })).toBeTruthy();
    expect(roots()).toHaveLength(0);
  });

  it("keyboard: Enter and Space roll, Shift+Enter opens the options", async () => {
    joinTable();
    await mount();
    await ready();
    queueFaces(0, 0, 0, 0);
    await act(async () => {
      fireEvent.keyDown(fight(), { key: "Enter" });
    });
    await waitFor(() => expect(roots()).toHaveLength(1));
    queueFaces(0, 0, 0, 0);
    await act(async () => {
      fireEvent.keyDown(fight(), { key: " " });
    });
    await waitFor(() => expect(roots()).toHaveLength(2));
    await act(async () => {
      fireEvent.keyDown(fight(), { key: "Enter", shiftKey: true });
    });
    expect(screen.getByRole("dialog", { name: "擲骰選項" })).toBeTruthy();
    expect(roots()).toHaveLength(2);
    expect(fight().getAttribute("aria-keyshortcuts")).toBe("Shift+Enter");
  });

  it("a fast repeat while a roll is in flight rolls once", async () => {
    joinTable();
    let release = () => {};
    sinkBehaviour = () => new Promise<void>((resolve) => {
      release = resolve;
    });
    await mount();
    await ready();
    queueFaces(1, 1, 1, 1);
    await act(async () => {
      fireEvent.click(fight());
      fireEvent.click(fight());
      fireEvent.click(fight());
    });
    expect(sent).toHaveLength(1);
    sinkBehaviour = null;
    await act(async () => {
      release();
    });
    await waitFor(() => expect(tray().dataset.root).toBeTruthy());
    queueFaces(0, 0, 0, 0);
    await act(async () => {
      fireEvent.click(fight());
    });
    await waitFor(() => expect(sent).toHaveLength(2));
  });

  it("in the host's play mode a tap still rolls and the options stay announced", async () => {
    joinTable();
    await mount({ mode: "play" });
    await ready();
    expect(fight().getAttribute("aria-haspopup")).toBe("dialog");
    expect(fight().getAttribute("aria-keyshortcuts")).toBe("Shift+Enter");
    queueFaces(0, 0, 0, 0);
    await act(async () => {
      fireEvent.click(fight());
    });
    await waitFor(() => expect(roots()).toHaveLength(1));
  });

  // B-023: in edit mode a chip edits its skill; with no skill editor on the sheet it is text (inert).
  it("in edit mode without a skill editor the chip is text: no roll, no options, no roll name", async () => {
    joinTable();
    const switchMode = await mount({ mode: "play" });
    await ready();
    await act(async () => {
      fireEvent.keyDown(fight(), { key: "Enter", shiftKey: true });
    });
    expect(screen.getByRole("dialog", { name: "擲骰選項" })).toBeTruthy();
    // Options opened in play close on entering edit mode: no options dialog renders there.
    await act(async () => {
      switchMode("edit");
    });
    expect(screen.queryByRole("dialog", { name: "擲骰選項" })).toBeNull();
    expect(fight()).toBeNull();
    expect(screen.queryByRole("button", { name: /^擲 戰鬥/ })).toBeNull();
    expect(within(document.querySelector("[data-fate-skill='fight']") as HTMLElement).getByText("戰鬥")).toBeTruthy();
    await act(async () => {
      switchMode("play");
    });
    expect(screen.queryByRole("dialog", { name: "擲骰選項" })).toBeNull();
    expect(sent).toHaveLength(0);
    expect(tray().dataset.root).toBeFalsy();
  });

  it("without a roll host the chips stay text, never a button that does nothing", async () => {
    await mount({ roller: false });
    await screen.findByText("擲骰盤");
    await waitFor(() => expect(screen.queryByRole("button", { name: /^擲 戰鬥/ })).toBeNull());
    expect(screen.getByText("這裡無法擲骰。")).toBeTruthy();
  });

  it("uses the faces the 3D roller returned, not a second roll", async () => {
    useDiceRollerStore.setState({
      rollerRef: { isReady: true, roll: async () => [{ notation: "4dF", total: 3, rolls: [{ value: 1 }, { value: 1 }, { value: 1 }, { value: 0 }] }] },
    });
    await mount();
    await ready();
    queueFaces(-1, -1, -1, -1);
    await act(async () => {
      fireEvent.click(fight());
    });
    await waitFor(() => expect(tray().querySelector("[data-fate-faces]")?.getAttribute("data-fate-faces")).toBe("1,1,1,0"));
    expect(tray().querySelector("[data-fate-total]")?.getAttribute("data-fate-total")).toBe("7");
  });
});

describe("roll options", () => {
  it("closing the options or the invoke picker puts focus back on the control that opened it", async () => {
    joinTable();
    await mount();
    await ready();
    fight().focus();
    await act(async () => {
      fireEvent.keyDown(fight(), { key: "Enter", shiftKey: true });
    });
    await act(async () => {
      fireEvent.click(within(screen.getByRole("dialog", { name: "擲骰選項" })).getByRole("button", { name: "取消" }));
    });
    await waitFor(() => expect(document.activeElement).toBe(fight()));

    await rollFight(0, 0, 0, 0);
    const invoke = within(tray()).getByRole("button", { name: /援引形象 \+2/ });
    invoke.focus();
    const dialog = await openPicker(/援引形象 \+2/);
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "取消" }));
    });
    await waitFor(() => expect(document.activeElement).toBe(within(tray()).getByRole("button", { name: /援引形象 \+2/ })));
  });

  it("open with defaults, cancel never rolls or uses a stunt, and a confirmed stunt adds +2 and is marked used", async () => {
    joinTable();
    await mount();
    await ready();
    await act(async () => {
      fireEvent.keyDown(fight(), { key: "Enter", shiftKey: true });
    });
    let dialog = screen.getByRole("dialog", { name: "擲骰選項" });
    expect(within(dialog).getByRole("radio", { name: "克服" }).getAttribute("aria-checked")).toBe("true");
    expect((within(dialog).getByLabelText("對抗") as HTMLInputElement).value).toBe("0");
    // The attack-only stunt is not offered for overcome; the any-action one is, unticked.
    expect(within(dialog).queryByText(/快劍/)).toBeNull();
    const once = within(dialog).getByRole("checkbox", { name: /一夜一次/ }) as HTMLInputElement;
    expect(once.checked).toBe(false);
    await act(async () => {
      fireEvent.click(once);
      fireEvent.click(within(dialog).getByRole("button", { name: "取消" }));
    });
    expect(roots()).toHaveLength(0);
    expect(host.writes).toBe(0);

    await act(async () => {
      fireEvent.contextMenu(fight());
    });
    dialog = screen.getByRole("dialog", { name: "擲骰選項" });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("radio", { name: "攻擊" }));
      fireEvent.click(within(dialog).getByRole("button", { name: "提高對抗" }));
      fireEvent.click(within(dialog).getByRole("button", { name: "提高對抗" }));
      fireEvent.click(within(dialog).getByRole("button", { name: "提高對抗" }));
    });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("checkbox", { name: /快劍/ }));
      fireEvent.click(within(dialog).getByRole("checkbox", { name: /一夜一次/ }));
    });
    expect(within(dialog).getByText("+8 傳奇")).toBeTruthy();
    queueFaces(0, 0, 0, 0);
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "擲骰" }));
    });
    await waitFor(() => expect(roots()).toHaveLength(1));
    const root = roots()[0] as SimpleDiceRoll;
    expect(root.total).toBe(8);
    expect(root.targetValue).toBe(3);
    expect(tray().querySelector("[data-fate-outcome]")?.getAttribute("data-fate-outcome")).toBe("style");
    const stunts = readFateStunts(host.data);
    expect(stunts.find((s) => s.id === "once-a-night")?.usedSessionId).toBe("session-1");
    expect(stunts.find((s) => s.id === "quick-blade")?.usedSessionId).toBeUndefined();
  });
});

describe("invoke transactions", () => {
  it("disables invokes on a retained tray roll after switching to edit mode", async () => {
    joinTable();
    const switchMode = await mount({ mode: "play" });
    await ready();
    await rollFight(1, 0, 0, -1);
    const root = tray().dataset.root;
    const writes = host.writes;
    expect(sent).toHaveLength(1);

    const buttons = () => [
      within(tray()).getByRole("button", { name: /援引形象 \+2/ }),
      within(tray()).getByRole("button", { name: "重擲" }),
    ];
    for (const button of buttons()) expect(button).toBeEnabled();

    switchMode("edit");
    expect(tray()).toHaveAttribute("data-root", root);
    for (const button of buttons()) {
      expect(button).toBeDisabled();
      fireEvent.click(button);
    }
    expect(screen.queryByRole("dialog", { name: /援引形象/ })).not.toBeInTheDocument();
    expect(sent).toHaveLength(1);
    expect(host.writes).toBe(writes);
  });
  it("refuses a reroll picker opened before switching to edit mode", async () => {
    joinTable();
    const switchMode = await mount({ mode: "play" });
    await ready();
    await rollFight(-1, -1, -1, -1);
    const random = vi.fn(() => 0.5);
    setFateRollDeps({ random });
    const dialog = await openPicker(/^重擲$/);
    fireEvent.click(within(within(dialog).getByRole("region", { name: "我的形象" })).getByRole("radio", { name: /遭東廠追殺的忠臣之女/ }));
    expect(within(dialog).getByRole("button", { name: /^確認援引/ })).toBeEnabled();
    const writes = host.writes;

    switchMode("edit");
    await confirmInvoke(dialog);
    expect(random).not.toHaveBeenCalled();
    expect(host.writes).toBe(writes);
    expect(sent).toHaveLength(1);
  });

  it("+2 with a free use keeps the faces and sends one new message to the same audience", async () => {
    joinTable();
    await mount();
    await ready();
    await rollFight(1, 0, -1, -1);
    const before = tray().querySelector("[data-fate-faces]")?.getAttribute("data-fate-faces");
    const random = vi.fn(() => 0.5);
    setFateRollDeps({ random });
    const dialog = await openPicker(/援引形象 \+2/);
    // Free uses come first; the secret aspect has no text in the picker.
    expect(within(dialog).queryByText(SECRET)).toBeNull();
    await act(async () => {
      fireEvent.click(within(within(dialog).getByRole("region", { name: "免費援引" })).getByRole("radio", { name: /滿堂賓客都在看/ }));
    });
    await confirmInvoke(dialog);
    await waitFor(() => expect(followUps()).toHaveLength(1));
    expect(random).not.toHaveBeenCalled();
    expect(tray().querySelector("[data-fate-faces]")?.getAttribute("data-fate-faces")).toBe(before);
    expect(tray().querySelector("[data-fate-total]")?.getAttribute("data-fate-total")).toBe("5");
    const follow = followUps()[0];
    const root = roots()[0] as SimpleDiceRoll;
    expect(follow).toMatchObject({ type: "simple", visibility: "all", rolls: [1, 0, -1, -1], total: 5, targetValue: 0, characterId: "char-1", rollerId: "user-1" });
    expect(follow.id).not.toBe(root.id);
    expect(follow.label).toContain(root.label?.split(" ").at(-1));
    expect(JSON.stringify(follow)).not.toContain("滿堂賓客");
    expect(readFateAspects(host.data).rows.find((row) => row.id === "situation-1")?.freeInvokes).toBe(0);
    expect(host.data.fatePoints).toBe(2);
    expect(receipt().map((r) => r.status)).toEqual(["posted"]);
    // The original message was never touched: one root, one follow-up.
    expect(sent).toHaveLength(2);
  });

  it("a paid reroll reads exactly four new dice, costs one FP and cannot repeat on the same aspect", async () => {
    joinTable();
    useRollPanelStore.setState({ audience: "gm" });
    await mount();
    await ready();
    await rollFight(-1, -1, -1, -1);
    const reroll = [value(1), value(1), value(0), value(0)];
    const random = vi.fn(() => reroll.shift() ?? 0.5);
    setFateRollDeps({ random });
    let dialog = await openPicker(/^重擲$/);
    expect(within(dialog).getByRole("radio", { name: "重擲 4 顆骰" }).getAttribute("aria-checked")).toBe("true");
    await act(async () => {
      fireEvent.click(within(within(dialog).getByRole("region", { name: "我的形象" })).getByRole("radio", { name: /遭東廠追殺的忠臣之女/ }));
    });
    expect(within(dialog).getByText("−1 命運點：命運點 2 → 1")).toBeTruthy();
    await confirmInvoke(dialog);
    await waitFor(() => expect(followUps()).toHaveLength(1));
    expect(random).toHaveBeenCalledTimes(4);
    expect(tray().querySelector("[data-fate-faces]")?.getAttribute("data-fate-faces")).toBe("1,1,0,0");
    expect(followUps()[0]).toMatchObject({ visibility: "gm", rolls: [1, 1, 0, 0], total: 6 });
    expect(host.data.fatePoints).toBe(1);
    expect(ledger().map((entry) => [entry.reason, entry.delta])).toEqual([["invokePaid", -1]]);

    dialog = await openPicker(/援引形象 \+2/);
    const again = within(within(dialog).getByRole("region", { name: "我的形象" })).getByRole("radio", { name: /遭東廠追殺的忠臣之女/ }) as HTMLInputElement;
    expect(again.disabled).toBe(true);
    expect(within(dialog).getByText("這一擲已經花命運點援引過這個形象。")).toBeTruthy();
  });

  it("a boost is free only and disappears when used", async () => {
    joinTable();
    await mount();
    await ready();
    await rollFight(0, 0, 0, 0);
    const dialog = await openPicker(/援引形象 \+2/);
    const paidList = within(dialog).getByRole("region", { name: "我的形象" });
    expect(within(paidList).queryByText("看穿他的破綻")).toBeNull();
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("radio", { name: /看穿他的破綻/ }));
    });
    await confirmInvoke(dialog);
    await waitFor(() => expect(followUps()).toHaveLength(1));
    expect(readFateAspects(host.data).rows.some((row) => row.id === "boost-1")).toBe(false);
    expect(host.data.fatePoints).toBe(2);
  });

  it("a double submit pays and sends once", async () => {
    joinTable();
    await mount();
    await ready();
    await rollFight(0, 0, 0, 0);
    const dialog = await openPicker(/援引形象 \+2/);
    await act(async () => {
      fireEvent.click(within(within(dialog).getByRole("region", { name: "我的形象" })).getByRole("radio", { name: /一句不平便拔劍/ }));
    });
    const confirm = within(dialog).getByRole("button", { name: /^確認援引/ });
    await act(async () => {
      fireEvent.click(confirm);
      fireEvent.click(confirm);
    });
    await waitFor(() => expect(followUps()).toHaveLength(1));
    expect(host.data.fatePoints).toBe(1);
    expect(ledger()).toHaveLength(1);
  });

  it("a GM rolling for a teammate keeps the on-behalf attribution on the follow-up", async () => {
    joinTable();
    useRollPanelStore.setState({ audience: "gm" });
    await mount({ onBehalf: true });
    await ready();
    await rollFight(0, 0, 0, 0);
    const dialog = await openPicker(/援引形象 \+2/);
    await act(async () => {
      fireEvent.click(within(within(dialog).getByRole("region", { name: "免費援引" })).getByRole("radio", { name: /滿堂賓客都在看/ }));
    });
    await confirmInvoke(dialog);
    await waitFor(() => expect(followUps()).toHaveLength(1));
    expect(roots()[0]).toMatchObject({ onBehalf: true, visibility: "gm", characterId: "char-1" });
    expect(followUps()[0]).toMatchObject({ onBehalf: true, visibility: "gm", characterId: "char-1", rollerId: "user-1" });
  });
});

describe("invoke from an aspect card", () => {
  const card = (id: string) => document.querySelector(`[data-fate-aspect='${id}']`) as HTMLElement;

  it("waits for a roll, then opens the picker with that card's aspect chosen", async () => {
    joinTable();
    await mount();
    await ready();
    const invoke = await waitFor(() => within(card("trouble")).getByRole("button", { name: "援引麻煩" }));
    expect(invoke).toHaveAttribute("aria-disabled", "true");
    expect(invoke).toHaveAccessibleDescription("先擲骰，才能援引形象。");
    await act(async () => {
      fireEvent.click(invoke);
    });
    expect(screen.queryByRole("dialog", { name: /援引形象/ })).toBeNull();

    await rollFight(0, 0, 0, 0);
    expect(within(card("trouble")).getByRole("button", { name: "援引麻煩" })).not.toHaveAttribute("aria-disabled");
    await act(async () => {
      fireEvent.click(within(card("trouble")).getByRole("button", { name: "援引麻煩" }));
    });
    const dialog = screen.getByRole("dialog", { name: /援引形象/ });
    expect(within(within(dialog).getByRole("region", { name: "我的形象" })).getByRole("radio", { name: /一句不平便拔劍/ })).toBeChecked();
    expect(within(dialog).getByRole("button", { name: /^確認援引/ })).toBeEnabled();
    await confirmInvoke(dialog);
    await waitFor(() => expect(host.data.fatePoints).toBe(1));
    expect(ledger().at(-1)).toMatchObject({ reason: "invokePaid", delta: -1 });
  });

  it("chooses the card's free invoke over a fate point", async () => {
    joinTable();
    const data = { ...shen, aspects: { format: 2, aspects: (shen.aspects as { aspects: Record<string, unknown>[] }).aspects.map((row) => (row.id === "trouble" ? { ...row, freeInvokes: 1 } : row)) } };
    await mount({ data });
    await ready();
    await rollFight(0, 0, 0, 0);
    await act(async () => {
      fireEvent.click(within(card("trouble")).getByRole("button", { name: "援引麻煩" }));
    });
    const dialog = screen.getByRole("dialog", { name: /援引形象/ });
    expect(within(within(dialog).getByRole("region", { name: "免費援引" })).getByRole("radio", { name: /一句不平便拔劍/ })).toBeChecked();
  });

  it("leaves empty aspects out of the picker", async () => {
    joinTable();
    const data = { ...shen, aspects: { format: 2, aspects: [
      ...(shen.aspects as { aspects: unknown[] }).aspects,
      { id: "relationship", kind: "relationship", text: "", freeInvokes: 0, secret: false },
      { id: "freeAspect3", kind: "free", text: "  ", freeInvokes: 1, secret: false },
    ] } };
    await mount({ data });
    await ready();
    await rollFight(0, 0, 0, 0);
    const dialog = await openPicker(/援引形象 \+2/);
    expect(within(dialog).queryByRole("radio", { name: /關係/ })).toBeNull();
    // Free: the boost and the situation; mine: three named aspects, the secret one and the situation.
    expect(within(within(dialog).getByRole("region", { name: "免費援引" })).getAllByRole("radio")).toHaveLength(2);
    expect(within(within(dialog).getByRole("region", { name: "我的形象" })).getAllByRole("radio")).toHaveLength(5);
    // A face-down secret card is a real aspect: it stays, without its text.
    expect(within(dialog).getByRole("radio", { name: /祕密形象/ })).toBeInTheDocument();
  });

  it("is disabled on a read-only sheet", async () => {
    joinTable();
    await mount({ editable: false });
    await ready();
    await rollFight(0, 0, 0, 0);
    expect(within(card("trouble")).getByRole("button", { name: "援引麻煩" })).toBeDisabled();
  });
});

describe("edit mode on a retained roll (FMR2)", () => {
  const probe: { rolls: ReturnType<typeof useFateRolls> | null } = { rolls: null };
  function ProbeBody() {
    const rolls = useFateRolls();
    useEffect(() => {
      probe.rolls = rolls;
    });
    return null;
  }
  function Probe() {
    return (
      <Suspense fallback={null}>
        <FateRollMessages>
          <ProbeBody />
        </FateRollMessages>
      </Suspense>
    );
  }
  const fightSkill = { id: "fight", rating: 4 };

  it("F001: a roll asked for in edit mode (an options dialog confirmed after the switch) is refused", async () => {
    joinTable();
    const switchMode = await mount({ mode: "play", extra: Probe });
    await ready();
    await waitFor(() => expect(probe.rolls).not.toBeNull());
    await act(async () => {
      switchMode("edit");
    });
    let rolled: boolean | undefined;
    queueFaces(0, 0, 0, 0);
    await act(async () => {
      rolled = await probe.rolls?.rollSkill(fightSkill, "戰鬥", { ...defaultFateRollOptions(), stunts: [] });
    });
    expect(rolled).toBe(false);
    expect(sent).toHaveLength(0);
    expect(tray().dataset.root).toBeFalsy();
  });

  it("F002: a retained roll's result is claimed in play mode only, with a note instead of the read-only wording", async () => {
    joinTable();
    const switchMode = await mount({ mode: "play", extra: Probe });
    await ready();
    // +4 against +0 with four blanks: success with style, a boost to claim.
    await rollFight(0, 0, 0, 0);
    expect(within(tray()).getByRole("button", { name: "取得推助" })).toBeTruthy();
    const writes = host.writes;
    await act(async () => {
      switchMode("edit");
    });
    expect(within(tray()).queryByRole("button", { name: "取得推助" })).toBeNull();
    expect(within(tray()).getByText("切換到遊玩模式才能援引、撤銷或取得結果。")).toBeTruthy();
    expect(within(tray()).queryByText(/唯讀的角色卡/)).toBeNull();
    let claimed: boolean | undefined;
    await act(async () => {
      claimed = probe.rolls?.claim("successWithBoost", { kind: "new", aspectId: "boost-new", text: "趁勢" });
    });
    expect(claimed).toBe(false);
    expect(host.writes).toBe(writes);
    await act(async () => {
      switchMode("play");
    });
    expect(within(tray()).getByRole("button", { name: "取得推助" })).toBeTruthy();
  });

  it("F002: reverse and an open invoke picker wait for play mode", async () => {
    joinTable();
    const switchMode = await mount({ mode: "play", extra: Probe });
    await ready();
    await rollFight(0, 0, 0, 0);
    sinkBehaviour = async () => {
      throw { code: "42501", message: "new row violates row-level security policy" };
    };
    let dialog = await openPicker(/援引形象 \+2/);
    await act(async () => {
      fireEvent.click(within(within(dialog).getByRole("region", { name: "我的形象" })).getByRole("radio", { name: /遭東廠追殺的忠臣之女/ }));
    });
    await confirmInvoke(dialog);
    await waitFor(() => expect(receipt().map((r) => r.status)).toEqual(["rejected"]));
    expect(within(tray()).getByRole("button", { name: "撤銷援引並退還" })).toBeTruthy();
    sinkBehaviour = null;
    await act(async () => {
      probe.rolls?.keepLocal();
    });
    dialog = await openPicker(/^重擲$/);
    await act(async () => {
      fireEvent.click(within(within(dialog).getByRole("region", { name: "我的形象" })).getByRole("radio", { name: /一句不平便拔劍/ }));
    });
    expect(within(dialog).getByRole("button", { name: /^確認援引/ })).toBeEnabled();
    const writes = host.writes;

    await act(async () => {
      switchMode("edit");
    });
    expect(within(dialog).getByRole("button", { name: /^確認援引/ })).toBeDisabled();
    expect(within(dialog).getByText("切換到遊玩模式才能援引。")).toBeTruthy();
    await confirmInvoke(dialog);
    expect(within(dialog).queryByText("唯讀的角色卡不能援引。")).toBeNull();
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "取消" }));
    });
    expect(within(tray()).queryByRole("button", { name: "撤銷援引並退還" })).toBeNull();
    const last = probe.rolls?.tray?.revisions.at(-1)?.operationId ?? "";
    let reversed: boolean | undefined;
    await act(async () => {
      reversed = probe.rolls?.reverse(last);
    });
    expect(reversed).toBe(false);
    expect(host.writes).toBe(writes);
    expect(receipt().map((r) => r.status)).toEqual(["rejected"]);
  });
});

describe("audience and binding", () => {
  it("a roll that could not be posted never broadcasts; the player may keep the invoke on the sheet", async () => {
    joinTable();
    sinkBehaviour = async () => {
      throw { code: "42501", message: "rls" };
    };
    await mount();
    await ready();
    await rollFight(0, 0, 0, 0);
    sinkBehaviour = null;
    expect(tray().querySelector("[data-fate-delivery]")?.getAttribute("data-fate-delivery")).toBe("blocked");
    const dialog = await openPicker(/援引形象 \+2/);
    await act(async () => {
      fireEvent.click(within(within(dialog).getByRole("region", { name: "免費援引" })).getByRole("radio", { name: /滿堂賓客都在看/ }));
    });
    const confirm = within(dialog).getByRole("button", { name: /^確認援引/ }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    expect(host.writes).toBe(0);
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "只記在這張角色卡" }));
    });
    await confirmInvoke(dialog);
    await waitFor(() => expect(receipt().map((r) => r.status)).toEqual(["local"]));
    expect(followUps()).toHaveLength(0);
    expect(sent).toHaveLength(1);
  });

  it("a changed table binding blocks the follow-up instead of sending it elsewhere", async () => {
    joinTable();
    await mount();
    await ready();
    await rollFight(0, 0, 0, 0);
    useRollSessionStore.setState({ currentTableId: "table-2" });
    const dialog = await openPicker(/援引形象 \+2/);
    await act(async () => {
      fireEvent.click(within(within(dialog).getByRole("region", { name: "免費援引" })).getByRole("radio", { name: /滿堂賓客都在看/ }));
    });
    expect(within(dialog).getByText(/遊戲桌連線或角色已經不同/)).toBeTruthy();
    expect((within(dialog).getByRole("button", { name: /^確認援引/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(followUps()).toHaveLength(0);
    expect(host.writes).toBe(0);
  });

  it("outside a table the roll and its invokes stay on the sheet", async () => {
    await mount();
    await ready();
    await rollFight(0, 0, 0, 0);
    expect(tray().querySelector("[data-fate-delivery]")?.getAttribute("data-fate-delivery")).toBe("local");
    const dialog = await openPicker(/援引形象 \+2/);
    await act(async () => {
      fireEvent.click(within(within(dialog).getByRole("region", { name: "免費援引" })).getByRole("radio", { name: /滿堂賓客都在看/ }));
    });
    await confirmInvoke(dialog);
    await waitFor(() => expect(receipt().map((r) => r.status)).toEqual(["local"]));
    expect(sent).toHaveLength(0);
  });
});

describe("stale roll actions", () => {
  it("does not dispatch an invoke if the host never ran the updater", async () => {
    joinTable();
    await mount();
    await ready();
    await rollFight(0, 0, 0, 0);
    const dialog = await openPicker(/援引形象 \+2/);
    fireEvent.click(within(dialog).getByRole("radio", { name: /遭東廠追殺的忠臣之女/ }));
    host.dropWrites = true;
    await confirmInvoke(dialog);
    expect(followUps()).toHaveLength(0);
    expect(tray().querySelector("[data-fate-total]")?.getAttribute("data-fate-total")).toBe("4");
  });

  it("clears a selected stunt used elsewhere before confirming the roll", async () => {
    joinTable();
    await mount();
    await ready();
    await act(async () => { fireEvent.contextMenu(fight()); });
    const dialog = screen.getByRole("dialog", { name: "擲骰選項" });
    const once = () => within(dialog).getByRole<HTMLInputElement>("checkbox", { name: /一夜一次/ });
    fireEvent.click(once());
    expect(once().checked).toBe(true);
    await act(async () => {
      host.replace({ ...host.data, stunts: { stunts: readFateStunts(host.data).map((stunt) => stunt.id === "once-a-night" ? { ...stunt, usedSessionId: "session-1" } : stunt) } });
    });
    expect(once().disabled).toBe(true);
    expect(once().checked).toBe(false);
    queueFaces(0, 0, 0, 0);
    await act(async () => { fireEvent.click(within(dialog).getByRole("button", { name: "擲骰" })); });
    expect((roots()[0] as SimpleDiceRoll).total).toBe(4);
  });
});

describe("delivery failures", () => {
  it("a refused follow-up debits once, is not resent and can be reversed once", async () => {
    joinTable();
    await mount();
    await ready();
    await rollFight(0, 0, 0, 0);
    sinkBehaviour = async () => {
      throw { code: "42501", message: "new row violates row-level security policy" };
    };
    const dialog = await openPicker(/援引形象 \+2/);
    await act(async () => {
      fireEvent.click(within(within(dialog).getByRole("region", { name: "我的形象" })).getByRole("radio", { name: /遭東廠追殺的忠臣之女/ }));
    });
    await confirmInvoke(dialog);
    await waitFor(() => expect(receipt().map((r) => r.status)).toEqual(["rejected"]));
    expect(followUps()).toHaveLength(1);
    expect(host.data.fatePoints).toBe(1);
    expect(tray().querySelector("[data-fate-total]")?.getAttribute("data-fate-total")).toBe("6");
    const undo = within(tray()).getByRole("button", { name: "撤銷援引並退還" });
    await act(async () => {
      fireEvent.click(undo);
    });
    expect(host.data.fatePoints).toBe(2);
    expect(receipt().map((r) => r.status)).toEqual(["reversed"]);
    expect(within(tray()).queryByRole("button", { name: "撤銷援引並退還" })).toBeNull();
    expect(tray().querySelector("[data-fate-total]")?.getAttribute("data-fate-total")).toBe("4");
    expect(ledger().map((entry) => [entry.reason, entry.delta])).toEqual([["invokePaid", -1], ["invokeReverse", 1]]);
    expect(followUps()).toHaveLength(1);
  });

  it("an ambiguous failure says delivery is unknown: no resend, no refund, no reversal", async () => {
    joinTable();
    await mount();
    await ready();
    await rollFight(0, 0, 0, 0);
    sinkBehaviour = async () => {
      throw new TypeError("Failed to fetch");
    };
    const dialog = await openPicker(/援引形象 \+2/);
    await act(async () => {
      fireEvent.click(within(within(dialog).getByRole("region", { name: "我的形象" })).getByRole("radio", { name: /遭東廠追殺的忠臣之女/ }));
    });
    await confirmInvoke(dialog);
    await waitFor(() => expect(receipt().map((r) => r.status)).toEqual(["unknown"]));
    expect(within(tray()).getByText(/訊息是否送達無法確認/)).toBeTruthy();
    expect(within(tray()).queryByRole("button", { name: "撤銷援引並退還" })).toBeNull();
    expect(followUps()).toHaveLength(1);
    expect(host.data.fatePoints).toBe(1);
    expect(ledger()).toHaveLength(1);
  });
});

describe("no payment without a confirmed, current invoke", () => {
  it("read-only: may roll, but cannot invoke and writes nothing", async () => {
    joinTable();
    await mount({ editable: false });
    await ready();
    await rollFight(0, 0, 0, 0);
    expect((within(tray()).getByRole("button", { name: /援引形象 \+2/ }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(tray()).getByRole("button", { name: "重擲" }) as HTMLButtonElement).disabled).toBe(true);
    expect(host.writes).toBe(0);
    expect(sent).toHaveLength(1);
  });

  it("cancel spends nothing", async () => {
    joinTable();
    await mount();
    await ready();
    await rollFight(0, 0, 0, 0);
    const dialog = await openPicker(/援引形象 \+2/);
    await act(async () => {
      fireEvent.click(within(within(dialog).getByRole("region", { name: "我的形象" })).getByRole("radio", { name: /遭東廠追殺的忠臣之女/ }));
      fireEvent.click(within(dialog).getByRole("button", { name: "取消" }));
    });
    expect(screen.queryByRole("dialog", { name: /援引形象/ })).toBeNull();
    expect(host.writes).toBe(0);
    expect(followUps()).toHaveLength(0);
  });

  it("stale: FP spent elsewhere after the picker opened cannot be paid", async () => {
    joinTable();
    await mount();
    await ready();
    await rollFight(0, 0, 0, 0);
    const dialog = await openPicker(/援引形象 \+2/);
    await act(async () => {
      fireEvent.click(within(within(dialog).getByRole("region", { name: "我的形象" })).getByRole("radio", { name: /遭東廠追殺的忠臣之女/ }));
    });
    await act(async () => {
      host.replace({ ...host.data, fatePoints: 0 });
    });
    const writes = host.writes;
    await confirmInvoke(dialog);
    expect(host.data.fatePoints).toBe(0);
    expect(host.writes).toBe(writes);
    expect(followUps()).toHaveLength(0);
    expect(ledger()).toHaveLength(0);
  });
});

describe("v2-rolls messages", () => {
  const keys = (node: Record<string, unknown>, prefix = ""): string[] =>
    Object.entries(node).flatMap(([key, value]) =>
      value && typeof value === "object" ? keys(value as Record<string, unknown>, `${prefix}${key}.`) : [`${prefix}${key}`]);
  it("en and zh-TW have the same keys", () => {
    expect(keys(rollsZh).sort()).toEqual(keys(rollsEn).sort());
  });
});
