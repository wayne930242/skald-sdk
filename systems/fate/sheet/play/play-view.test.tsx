import { useEffect, useState, type ReactNode } from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Schema } from "@skald/types/schema";
import type { LoadedSystem } from "@skald/types/system";
import appZh from "@skald/sheet-sdk/messages/zh-TW.json";
import systemZh from "@skald/system-fate/data/fate-condensed/messages/zh-TW.json";
import schemaJson from "@skald/system-fate/data/fate-condensed/schema.json";
import defaultData from "@skald/system-fate/data/fate-condensed/default-data.json";
import { SchemaDataContext, SchemaStaticContext } from "@skald/sheet-sdk/modules/character/ui/renderer/schema-context";
import { SheetViewerContext, type SheetViewer } from "@skald/sheet-sdk/modules/character/ui/renderer/viewer-context";
import { readFateAspects } from "../../domain/normalize";
import { FatePlayView } from "./play-view";
import { useFatePlay } from "./play-context";
import type { FatePlaySlots } from "./slots";

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock("../../reference/fate-rules-dialog", () => ({
  FateRulesDialog: ({ initialSection, onClose }: { initialSection?: string; onClose: () => void }) => (
    <div role="dialog" data-rules-section={initialSection ?? "intro"}>
      <button type="button" onClick={onClose}>close rules</button>
    </div>
  ),
}));

const schema = schemaJson as unknown as Schema;
const system = {
  config: { id: "fate-condensed", sheetComponent: "fate" },
  runtime: { systemId: "s", templateVersionId: "v", builtinTemplate: true },
  schema,
  template: { pages: [] },
  defaultData,
  mappings: {},
  gameData: {},
} as unknown as LoadedSystem;

const SECRET = "客棧後院的密道我走過一次";

/** 沈青霜, the frames' character (design-b brief), with one secret free aspect. */
const shen: Record<string, unknown> = {
  ...defaultData,
  name: "沈青霜",
  player: "洪偉",
  description: "龍門客棧",
  fatePoints: 2,
  aspects: { format: 2, aspects: [
    { id: "highConcept", kind: "highConcept", text: "遭東廠追殺的忠臣之女", freeInvokes: 0, secret: false },
    { id: "trouble", kind: "trouble", text: "一句不平便拔劍", freeInvokes: 0, secret: false },
    { id: "relationship", kind: "relationship", text: "欠了掌櫃金鑲玉一條命", freeInvokes: 0, secret: false },
    { id: "freeAspect1", kind: "free", text: "江湖上沒人認得我的劍法", freeInvokes: 0, secret: false },
    { id: "freeAspect2", kind: "free", text: SECRET, freeInvokes: 0, secret: true, labelOverride: "密道" },
    { id: "boost-1", kind: "boost", text: "看穿他的破綻", freeInvokes: 1, secret: false },
    { id: "situation-1", kind: "situation", text: "滿堂賓客都在看", freeInvokes: 1, secret: false },
  ] },
  skills: { skills: [
    { id: "fight", name: "戰鬥", level: 4 }, { id: "stealth", name: "隱匿", level: 3 }, { id: "athletics", name: "運動", level: 3 },
    { id: "notice", name: "感知", level: 2 }, { id: "will", name: "意志", level: 2 }, { id: "deceive", name: "欺瞞", level: 2 },
    { id: "physique", name: "體魄", level: 1 }, { id: "empathy", name: "同理", level: 1 }, { id: "contacts", name: "人脈", level: 1 },
    { id: "investigate", name: "調查", level: 1 },
  ] },
  physicalStress: [1],
  mildConsequence: "肩頭的刀傷",
  extras: "一把舊劍",
  notes: "掌櫃欠她一壺酒",
};

interface MountOptions {
  editable?: boolean;
  setupMode?: boolean;
  slots?: FatePlaySlots;
  viewer?: SheetViewer;
}

type Updater = Record<string, unknown> | ((previous: Record<string, unknown>) => Record<string, unknown>);
const state = {
  data: {} as Record<string, unknown>,
  setData: vi.fn<(updater: Updater) => void>(),
  onBlur: vi.fn<() => void>(),
};

function Harness({ initial, editable, setupMode, slots, viewer }: { initial: Record<string, unknown> } & MountOptions) {
  const [data, setData] = useState(initial);
  useEffect(() => {
    state.data = data;
  });
  const write = (updater: Updater) => {
    state.setData(updater);
    setData((previous) => (typeof updater === "function" ? updater(previous) : updater));
  };
  return (
    <SchemaStaticContext.Provider value={{ schema, editable: editable ?? true, setupMode: setupMode ?? false, printMode: false, viewMode: "web", setData: write, onBlur: state.onBlur }}>
      <SchemaDataContext.Provider value={{ data }}>
        {/* The shell alone: the assembled slots are covered by assembly.test.tsx. */}
        {viewer ? (
          <SheetViewerContext.Provider value={viewer}>
            <FatePlayView system={system} slots={slots ?? {}} />
          </SheetViewerContext.Provider>
        ) : (
          <FatePlayView system={system} slots={slots ?? {}} />
        )}
      </SchemaDataContext.Provider>
    </SchemaStaticContext.Provider>
  );
}

async function mount(initial: Record<string, unknown> = shen, options: MountOptions = {}) {
  state.setData = vi.fn<(updater: Updater) => void>();
  state.onBlur = vi.fn<() => void>();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <NextIntlClientProvider locale="zh-TW" messages={{ ...appZh, ...systemZh }} timeZone="UTC">{children}</NextIntlClientProvider>
  );
  let unmount = () => {};
  await act(async () => {
    unmount = render(<Harness initial={initial} {...options} />, { wrapper }).unmount;
  });
  await screen.findByRole("region", { name: "形象" });
  return { unmount };
}

const view = () => document.querySelector("[data-fate-play-view]") as HTMLElement;
const card = (id: string) => document.querySelector(`[data-fate-aspect='${id}']`) as HTMLElement;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Fate B play view", () => {
  it("lays out the frame-03 character: identity, FP tokens, aspect cards, held strip, ladder and notes", async () => {
    await mount();
    expect(view().querySelectorAll("input, textarea, select")).toHaveLength(0);
    expect(view().querySelector("[data-fate-identity]")).toHaveTextContent("遭東廠追殺的忠臣之女");
    expect(view().querySelector("[data-fate-points]")).toHaveTextContent("2");
    expect(view().querySelector("[data-fate-points]")).toHaveTextContent("重振 3");
    expect(view().querySelectorAll("[data-fate-token]")).toHaveLength(2);
    expect(card("trouble")).toHaveTextContent("麻煩");
    expect(card("trouble")).toHaveTextContent("一句不平便拔劍");
    // A card shows free invokes only when it has some, and no position number.
    expect(within(card("trouble")).queryByRole("img")).toBeNull();
    expect(card("trouble").querySelector("header")?.textContent).not.toMatch(/\d/);
    const held = view().querySelector("[data-fate-held]") as HTMLElement;
    expect(held).toHaveTextContent("看穿他的破綻");
    expect(held).toHaveTextContent("推助");
    expect(held).toHaveTextContent("滿堂賓客都在看");
    const top = view().querySelector("[data-fate-rung='4']") as HTMLElement;
    expect(top).toHaveTextContent("傑出");
    expect(top).toHaveTextContent("戰鬥");
    expect(view().querySelector("[data-fate-pyramid]")).toHaveAttribute("data-complete", "true");
    expect(view().querySelector("[data-fate-rung='0']")).toHaveTextContent("學術");
    expect(view().querySelector("[data-fate-notes]")).toHaveTextContent("掌櫃欠她一壺酒");
    expect(view().querySelector("[data-fate-extras]")).toHaveTextContent("一把舊劍");
    expect(view().querySelector("[data-fate-description]")).toHaveTextContent("龍門客棧");
    expect(view().querySelector("[data-fate-player]")).toHaveTextContent("洪偉");
  });

  it("keeps the page's shell width, aligned with the sheet header like frame 03", async () => {
    await mount();
    expect(view()).toHaveClass("shell-wrap");
  });

  it("leaves a read-only sheet untouched: no edit or structural controls, no writes", async () => {
    await mount(shen, { editable: false, setupMode: true });
    expect(screen.queryByRole("button", { name: /編輯|新增|移除|公開|祕密/ })).not.toBeInTheDocument();
    for (const button of view().querySelectorAll("button")) fireEvent.click(button);
    expect(state.setData).not.toHaveBeenCalled();
    expect(state.data).toBe(shen);
  });

  it("never puts a secret aspect's text in the DOM for an unknown viewer, in play or setup", async () => {
    const legacy = { ...shen, highConcept: "東廠臥底", aspects: [{ id: "highConcept", value: "東廠臥底", secret: true }] };
    for (const options of [{}, { setupMode: true }]) {
      const { unmount } = await mount(shen, options);
      expect(document.body.innerHTML).not.toContain(SECRET);
      expect(document.body.innerHTML).not.toContain("密道");
      expect(card("freeAspect2")).toHaveAttribute("data-hidden", "true");
      unmount();
    }
    const { unmount } = await mount(legacy);
    expect(document.body.innerHTML).not.toContain("東廠臥底");
    expect(view().querySelector("[data-fate-identity]")).not.toHaveTextContent("東廠臥底");
    unmount();
  });

  it("shows secret aspects only to the host-known owner or GM (display only, C2 viewer)", async () => {
    for (const viewer of [{ isOwner: true }, { isOwner: false, isGM: true }]) {
      const { unmount } = await mount(shen, { viewer });
      expect(card("freeAspect2")).toHaveTextContent(SECRET);
      expect(card("freeAspect2")).not.toHaveAttribute("data-hidden", "true");
      unmount();
    }
    for (const viewer of [{}, { isOwner: false }, { isOwner: false, isGM: false }]) {
      const { unmount } = await mount(shen, { viewer });
      expect(document.body.innerHTML).not.toContain(SECRET);
      expect(card("freeAspect2")).toHaveAttribute("data-hidden", "true");
      unmount();
    }
  });

  it("edits aspect text, name and notes in play through the schema setter", async () => {
    await mount();
    fireEvent.click(within(card("trouble")).getByRole("button", { name: "編輯麻煩" }));
    const input = within(card("trouble")).getByRole("textbox");
    fireEvent.change(input, { target: { value: "見不得欺負弱小" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(readFateAspects(state.data).rows.find((row) => row.id === "trouble")?.text).toBe("見不得欺負弱小");
    // The secret row keeps its text even though this viewer never saw it.
    expect(readFateAspects(state.data).rows.find((row) => row.id === "freeAspect2")?.text).toBe(SECRET);
    expect(state.onBlur).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "編輯筆記" }));
    const notes = within(view().querySelector("[data-fate-notes]") as HTMLElement).getByRole("textbox");
    fireEvent.change(notes, { target: { value: "新的筆記" } });
    fireEvent.blur(notes);
    expect(state.data.notes).toBe("新的筆記");

    // A used boost goes away in play: an ordinary edit, not a structural one.
    fireEvent.click(within(view().querySelector("[data-fate-held]") as HTMLElement).getByRole("button", { name: "移除推助：看穿他的破綻" }));
    expect(readFateAspects(state.data).rows.some((row) => row.id === "boost-1")).toBe(false);
  });

  it("keeps the strip's portrait for print only when the host header already shows one", async () => {
    const portraitIn = () => view().querySelector("[data-fate-identity] [data-fate-portrait]");
    for (const viewer of [undefined, {}, { isOwner: true }, { hostShowsPortrait: false }]) {
      const { unmount } = await mount(shen, { viewer });
      expect(portraitIn()).not.toBeNull();
      unmount();
    }
    const { unmount } = await mount(shen, { viewer: { isOwner: true, hostShowsPortrait: true } });
    // The host header is print:hidden, so the strip keeps a print-only copy (PR-F001).
    const printOnly = view().querySelector("[data-fate-identity] [data-fate-portrait-print]");
    expect(printOnly).not.toBeNull();
    expect(printOnly).toHaveClass("hidden", "print:block");
    expect(view().querySelector("[data-fate-high-concept]")).toHaveTextContent("遭東廠追殺的忠臣之女");
    unmount();
  });

  it("puts identity in a compact strip in play: no second name, one high concept line, no edit controls", async () => {
    await mount();
    const identity = view().querySelector("[data-fate-identity]") as HTMLElement;
    // The host's header already shows the name (frame 03): the view never repeats it.
    expect(view()).not.toHaveTextContent("沈青霜");
    expect(within(view()).queryByRole("heading", { name: "沈青霜" })).toBeNull();
    expect(identity.querySelectorAll("[data-fate-high-concept]")).toHaveLength(1);
    expect(identity.textContent?.split("遭東廠追殺的忠臣之女")).toHaveLength(2);
    expect(identity).toHaveTextContent("龍門客棧");
    expect(identity).toHaveTextContent("玩家 洪偉");
    expect(within(identity).getByRole("button", { name: "規則參照" })).toBeInTheDocument();
    expect(within(identity).queryAllByRole("button", { name: /編輯|上傳|頭像/ })).toEqual([]);
    expect(identity.querySelectorAll("input, textarea")).toHaveLength(0);
  });

  it("edits name, player and description in edit mode only", async () => {
    await mount(shen, { setupMode: true });
    const identity = () => view().querySelector("[data-fate-identity]") as HTMLElement;
    for (const [label, field, value] of [["編輯姓名", "name", "沈霜"], ["編輯玩家", "player", "阿偉"], ["編輯描述", "description", "大漠客棧"]] as const) {
      fireEvent.click(within(identity()).getByRole("button", { name: label }));
      const input = within(identity()).getByRole("textbox");
      fireEvent.change(input, { target: { value } });
      fireEvent.keyDown(input, { key: "Enter", metaKey: true });
      expect(state.data[field]).toBe(value);
    }
  });

  it("names a card's write and edit actions alike, numbered when the kind repeats", async () => {
    const data = { ...shen, aspects: { format: 2, aspects: [
      { id: "highConcept", kind: "highConcept", text: "遭東廠追殺的忠臣之女", freeInvokes: 0, secret: false },
      { id: "freeAspect1", kind: "free", text: "江湖上沒人認得我的劍法", freeInvokes: 0, secret: false },
      { id: "freeAspect2", kind: "free", text: "", freeInvokes: 0, secret: false },
    ] } };
    await mount(data);
    expect(within(card("freeAspect1")).getByRole("button", { name: "編輯自由 2" })).toBeInTheDocument();
    expect(within(card("freeAspect2")).getByRole("button", { name: "寫下自由 3" })).toBeInTheDocument();
    expect(within(card("highConcept")).getByRole("button", { name: "編輯高概念" })).toBeInTheDocument();
  });

  it("lays the aspect cards out by the view's own width: a two-up band, then 3 and 5 columns", async () => {
    await mount();
    const band = view().querySelector("[data-fate-aspect-band]") as HTMLElement;
    expect(band.className).toMatch(/@2xl:grid-cols-3/);
    expect(band.className).toMatch(/@5xl:grid-cols-5/);
    // Five columns in a 48rem table panel squeezed the text to a few characters a line.
    expect(band.className).not.toMatch(/@3xl:grid-cols-5/);
    expect(card("trouble").className).toMatch(/w-\[calc\(50%/);
  });

  it("puts each card's invoke and the trouble's compel in play only, never in edit mode or on an empty or hidden card", async () => {
    const AspectInvoke = ({ aspect, name }: { aspect: { id: string }; name: string }) => <button type="button" className="min-h-11" data-invoke={aspect.id}>{`援引${name}`}</button>;
    const AspectCompel = ({ aspect }: { aspect: { id: string } }) => <button type="button" className="min-h-11" data-compel={aspect.id}>compel</button>;
    const data = { ...shen, aspects: { format: 2, aspects: [
      ...(shen.aspects as { aspects: unknown[] }).aspects,
      { id: "freeAspect3", kind: "free", text: "", freeInvokes: 0, secret: false },
    ] } };
    const { unmount } = await mount(data, { slots: { AspectInvoke, AspectCompel } });
    expect([...view().querySelectorAll("[data-invoke]")].map((node) => node.getAttribute("data-invoke"))).toEqual(["highConcept", "trouble", "relationship", "freeAspect1"]);
    expect(within(card("trouble")).getByRole("button", { name: "援引麻煩" })).toBeInTheDocument();
    expect([...view().querySelectorAll("[data-compel]")].map((node) => node.getAttribute("data-compel"))).toEqual(["trouble"]);
    unmount();
    await mount(data, { setupMode: true, slots: { AspectInvoke, AspectCompel } });
    expect(view().querySelector("[data-invoke], [data-compel]")).toBeNull();
  });

  it("offers permanent-aspect and recipe operations only when editable in setup mode", async () => {
    const Presets = () => <div data-testid="presets-slot" />;
    const { unmount } = await mount(shen, { slots: { presets: Presets } });
    expect(screen.queryByRole("button", { name: "新增形象" })).not.toBeInTheDocument();
    expect(within(card("trouble")).queryByRole("button", { name: /移除|公開|祕密/ })).not.toBeInTheDocument();
    expect(screen.queryByTestId("presets-slot")).not.toBeInTheDocument();
    unmount();

    await mount(shen, { setupMode: true, slots: { presets: Presets } });
    expect(screen.getByTestId("presets-slot")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "新增形象" }));
    expect(readFateAspects(state.data).rows.filter((row) => row.kind === "free")).toHaveLength(3);

    fireEvent.click(within(card("relationship")).getByRole("button", { name: "設為祕密形象" }));
    const warning = await screen.findByRole("alertdialog");
    expect(warning).toHaveTextContent("內容仍會同步");
    fireEvent.click(within(warning).getByRole("button", { name: "設為祕密" }));
    expect(readFateAspects(state.data).rows.find((row) => row.id === "relationship")?.secret).toBe(true);
    await waitFor(() => expect(document.body.innerHTML).not.toContain("欠了掌櫃金鑲玉一條命"));

    fireEvent.click(within(card("trouble")).getByRole("button", { name: "移除麻煩" }));
    expect(readFateAspects(state.data).rows.some((row) => row.id === "trouble")).toBe(false);
  });

  it("shows a blank card with rules hints, every skill at +0 and the pyramid allowing blanks", async () => {
    const SkillTrigger = ({ skill, children }: { skill: { id: string; rating: number }; children: ReactNode }) => (
      <button type="button" data-trigger={skill.id} data-rating={skill.rating}>{children}</button>
    );
    await mount(defaultData, { slots: { SkillTrigger } });
    expect(card("highConcept")).toHaveTextContent("用一句話說你是誰");
    expect(within(card("highConcept")).getByRole("button", { name: "寫下高概念" })).toBeInTheDocument();
    expect(view().querySelector("[data-fate-pyramid]")).toHaveAttribute("data-complete", "false");
    expect(view().querySelector("[data-fate-pyramid]")).toHaveTextContent("0/1");
    expect(view()).not.toHaveTextContent("可以留白，邊玩邊填");
    const zero = view().querySelectorAll("[data-fate-rung='0'] [data-trigger]");
    expect(zero).toHaveLength(19);
    expect([...zero].every((node) => node.getAttribute("data-rating") === "0")).toBe(true);
    expect(view().querySelector("[data-fate-points]")).toHaveTextContent("3");
    expect(view().querySelector("[data-fate-held]")).toHaveTextContent("尚未取得");
  });

  it("renders each feature slot in its own region only when wired", async () => {
    const { unmount } = await mount();
    for (const slot of ["rolls", "session", "stunts", "vitals"]) expect(view().querySelector(`[data-fate-slot='${slot}']`)).toBeNull();
    expect(within(view().querySelector("[data-fate-rung='4']") as HTMLElement).queryByRole("button")).toBeNull();
    unmount();
    await mount(shen, { slots: {
      rollTray: () => <p>tray</p>,
      session: () => <p>session</p>,
      stunts: () => <p>stunts</p>,
      vitals: () => <p>vitals</p>,
    } });
    for (const [slot, text] of [["rolls", "tray"], ["session", "session"], ["stunts", "stunts"], ["vitals", "vitals"]]) {
      expect(view().querySelector(`[data-fate-slot='${slot}']`)).toHaveTextContent(text);
    }
  });

  it("opens the rules reader lazily at each section's rule", async () => {
    await mount();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "形象規則" }));
    expect(await screen.findByRole("dialog")).toHaveAttribute("data-rules-section", "character.aspects");
    fireEvent.click(screen.getByRole("button", { name: "close rules" }));
    fireEvent.click(screen.getByRole("button", { name: "技能梯度規則" }));
    expect(await screen.findByRole("dialog")).toHaveAttribute("data-rules-section", "character.skills.ladder");
    fireEvent.click(screen.getByRole("button", { name: "close rules" }));
    fireEvent.click(screen.getByRole("button", { name: "命運點規則" }));
    expect(await screen.findByRole("dialog")).toHaveAttribute("data-rules-section", "aspects.earning-fate-points");
    fireEvent.click(screen.getByRole("button", { name: "close rules" }));
    fireEvent.click(screen.getByRole("button", { name: "規則參照" }));
    expect(await screen.findByRole("dialog")).toHaveAttribute("data-rules-section", "intro");
  });

  it("works from a keyboard on a phone: scrollable aspect band, Enter commits, Escape cancels, sticky summary", async () => {
    const observers: Array<(entries: Array<Partial<IntersectionObserverEntry>>) => void> = [];
    vi.stubGlobal("IntersectionObserver", class {
      constructor(callback: (entries: Array<Partial<IntersectionObserverEntry>>) => void) {
        observers.push(callback);
      }
      observe() {}
      disconnect() {}
    });
    await mount();
    const band = view().querySelector("[data-fate-aspect-band]") as HTMLElement;
    expect(band).toHaveAttribute("tabindex", "0");
    expect(band).toHaveAccessibleName("形象");
    expect(band.className).toMatch(/overflow-x-auto/);
    for (const target of view().querySelectorAll("button")) expect(target.className).toMatch(/min-h-11|size-11|h-11/);

    const edit = within(card("trouble")).getByRole("button", { name: "編輯麻煩" });
    edit.focus();
    fireEvent.click(edit);
    const input = within(card("trouble")).getByRole("textbox");
    expect(input).toHaveFocus();
    expect(input).toHaveAttribute("enterkeyhint", "done");
    fireEvent.change(input, { target: { value: "不寫了" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(state.setData).not.toHaveBeenCalled();
    expect(within(card("trouble")).getByRole("button", { name: "編輯麻煩" })).toHaveFocus();

    const sticky = view().querySelector("[data-fate-sticky]") as HTMLElement;
    expect(sticky).toHaveAttribute("data-shown", "false");
    act(() => observers.forEach((callback) => callback([{ isIntersecting: false, boundingClientRect: { top: -200 } as DOMRectReadOnly }])));
    expect(sticky).toHaveAttribute("data-shown", "true");
    expect(sticky).toHaveTextContent("2");
    expect(sticky).toHaveTextContent("物理 1/4");
    expect(sticky).toHaveTextContent("肩頭的刀傷");
  });
});

/** A session slot that moves the balance the way the session commands do. */
function BalanceButtons() {
  const { update } = useFatePlay();
  const move = (by: number) => update((previous) => ({ ...previous, fatePoints: Number(previous.fatePoints) + by }));
  return (
    <>
      <button type="button" onClick={() => move(-1)}>spend</button>
      <button type="button" onClick={() => move(1)}>gain</button>
    </>
  );
}

function stubMotion(reduce: boolean) {
  vi.stubGlobal("matchMedia", vi.fn((query: string) => ({
    matches: reduce && query.includes("reduce"),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })));
}

const coins = () => [...view().querySelectorAll("[data-fate-points] [data-fate-coin]")];
const coinStates = () => coins().map((coin) => coin.getAttribute("data-fate-coin"));

describe("Fate point coins", () => {
  it("draws the refresh capacity: held points as metal coins, spent ones hollow, all decorative", async () => {
    await mount();
    expect(coinStates()).toEqual(["available", "available", "spent"]);
    const group = view().querySelector("[data-fate-coins]") as HTMLElement;
    expect(group).toHaveAttribute("role", "img");
    expect(group).toHaveAccessibleName("2 點命運點");
    expect(coins().every((coin) => coin.closest("[aria-hidden=true]"))).toBe(true);
    expect(coins().map((coin) => coin.tagName.toLowerCase())).toEqual(["svg", "svg", "svg"]);
  });

  it("marks points above refresh as extra coins of the same face", async () => {
    await mount({ ...shen, fatePoints: 5 });
    expect(coinStates()).toEqual(["available", "available", "available", "extra", "extra"]);
    expect(view().querySelector("[data-fate-coin-more]")).toBeNull();
  });

  it("stops at five coins and sums up the rest as +N", async () => {
    await mount({ ...shen, fatePoints: 8 });
    expect(coins()).toHaveLength(5);
    expect(view().querySelector("[data-fate-coin-more]")).toHaveTextContent("+3");
    expect(view().querySelector("[data-fate-points]")).toHaveTextContent("8");
  });

  it("settles a coin that turns on spend or gain, never on first render", async () => {
    stubMotion(false);
    await mount(shen, { slots: { session: BalanceButtons } });
    expect(view().querySelectorAll("[data-fate-coin-motion]")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "spend" }));
    expect(coinStates()).toEqual(["available", "spent", "spent"]);
    const spent = coins()[1]?.closest("[data-fate-coin-motion]");
    expect(spent).toHaveAttribute("data-fate-coin-motion", "spend");
    expect(spent?.className).toContain("animate-in");
    expect(spent?.className).toContain("duration-200");
    fireEvent.click(screen.getByRole("button", { name: "gain" }));
    expect(coins()[1]?.closest("[data-fate-coin-motion]")).toHaveAttribute("data-fate-coin-motion", "gain");
  });

  it("does not animate under prefers-reduced-motion", async () => {
    stubMotion(true);
    await mount(shen, { slots: { session: BalanceButtons } });
    fireEvent.click(screen.getByRole("button", { name: "spend" }));
    fireEvent.click(screen.getByRole("button", { name: "gain" }));
    fireEvent.click(screen.getByRole("button", { name: "gain" }));
    expect(coinStates()).toEqual(["available", "available", "available"]);
    expect(view().querySelectorAll("[data-fate-coin-motion]")).toHaveLength(0);
    expect(view().querySelector("[data-fate-points]")?.innerHTML).not.toContain("animate-in");
  });
});
