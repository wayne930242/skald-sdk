import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { useEffect, useRef, useState, type ReactNode } from "react";
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
import { RollProvider } from "@skald/sheet-sdk/modules/rolls/ui/context/roll-context";
import { readFateAspects, readFateStunts } from "../../domain/normalize";
import { lazySlot } from "./lazy-slots";
import { FatePlayView } from "./play-view";

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

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

type Data = Record<string, unknown>;
type Updater = Data | ((previous: Data) => Data);

const shen: Data = {
  ...defaultData,
  name: "沈青霜",
  fatePoints: 1,
  aspects: { format: 2, aspects: [
    { id: "highConcept", kind: "highConcept", text: "遭東廠追殺的忠臣之女", freeInvokes: 0, secret: false },
    { id: "trouble", kind: "trouble", text: "一句不平便拔劍", freeInvokes: 0, secret: false },
  ] },
  skills: { skills: [
    { id: "fight", name: "戰鬥", level: 4 }, { id: "physique", name: "體魄", level: 1 },
    { id: "approach-careful", level: 2 }, { id: "approach-quick", level: 3 },
  ] },
  physicalStress: [1],
  stunts: { stunts: [{ id: "stunt-1", type: "custom", title: "快劍", customText: "以戰鬥攻擊時 +2。" }] },
};

/** FAE approaches, unified stress and conditions: the mixed preset of frame 14. */
const mixed = (data: Data): Data => ({
  ...data,
  fateV2: {
    ...(data.fateV2 as Data),
    preset: { id: "condensed-standard", version: 1, selection: { skills: "short-approaches", allocation: "fae", stress: "unified", injuries: "conditions" } },
    harm: { unifiedStress: [1, 2], conditions: { "hurt:1": { text: "" } } },
  },
});

const state = { data: {} as Data, setData: vi.fn<(updater: Updater) => void>(), push: (_: Data) => {} };

interface HarnessProps {
  initial: Data;
  editable?: boolean;
  setupMode?: boolean;
  /**
   * The runtime's `setData` hands the updater its working copy (`workingDataRef.current`), which
   * need not be the object the view rendered from: a cloud write keeps the updater's output as the
   * working copy while the view renders Yjs's own snapshot. Model that with a structural clone.
   */
  divergentWorkingCopy?: boolean;
}

function Harness({ initial, editable = true, setupMode = false, divergentWorkingCopy = false }: HarnessProps) {
  const [data, setData] = useState(initial);
  const working = useRef(initial);
  useEffect(() => {
    state.data = data;
    working.current = divergentWorkingCopy ? structuredClone(data) : data;
    state.push = (next) => setData(next);
  });
  const write = (updater: Updater) => {
    state.setData(updater);
    const next = typeof updater === "function" ? updater(working.current) : updater;
    working.current = next;
    setData(next);
  };
  return (
    <SchemaStaticContext.Provider value={{ schema, editable, setupMode, printMode: false, viewMode: "web", setData: editable ? write : undefined, onBlur: () => {} }}>
      <SchemaDataContext.Provider value={{ data }}>
        <FatePlayView system={system} />
      </SchemaDataContext.Provider>
    </SchemaStaticContext.Provider>
  );
}

async function mount(props: HarnessProps) {
  state.setData = vi.fn<(updater: Updater) => void>();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <NextIntlClientProvider locale="zh-TW" messages={{ ...appZh, ...systemZh, roll: { ...appZh.roll, ...systemZh.roll } }} timeZone="UTC">{children}</NextIntlClientProvider>
  );
  let unmount = () => {};
  await act(async () => {
    unmount = render(<RollProvider characterId="char-1" characterName="沈青霜"><Harness {...props} /></RollProvider>, { wrapper }).unmount;
  });
  await screen.findByRole("region", { name: "形象" });
  return { unmount };
}

const view = () => document.querySelector("[data-fate-play-view]") as HTMLElement;
const slot = (id: string) => view().querySelector(`[data-fate-slot='${id}']`) as HTMLElement | null;
const card = (id: string) => view().querySelector(`[data-fate-aspect='${id}']`) as HTMLElement;
const ledger = () => (((state.data.fateV2 as Data | undefined)?.ledger ?? []) as Data[]);
const ladderNames = () => [...view().querySelectorAll("[data-fate-ladder] [data-fate-skill]")].map((node) => node.getAttribute("data-fate-skill"));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Fate B assembly (F9)", () => {
  it("mounts every wired feature slot in its region, and the recipe entry only in setup", async () => {
    const { unmount } = await mount({ initial: shen });
    await waitFor(() => expect(slot("rolls")).toHaveTextContent("擲骰盤"));
    await waitFor(() => expect(within(slot("session") as HTMLElement).getByRole("button", { name: "場次管理" })).toBeInTheDocument());
    await waitFor(() => expect(slot("stunts")).toHaveTextContent("快劍"));
    await waitFor(() => expect(slot("vitals")).toHaveTextContent("生命力"));
    await waitFor(() => expect(view().querySelector("[data-fate-roll-trigger='fight']")).not.toBeNull());
    expect(screen.queryByRole("button", { name: "規則配方" })).not.toBeInTheDocument();
    unmount();

    await mount({ initial: shen, setupMode: true });
    expect(await screen.findByRole("button", { name: "規則配方" })).toBeInTheDocument();
  });

  it("gives every assembled control a phone touch target and lets the held list wrap under its title", async () => {
    const data: Data = {
      ...shen,
      aspects: { format: 2, aspects: [
        ...((shen.aspects as Data).aspects as Data[]),
        { id: "boost-1", kind: "boost", text: "看穿他的破綻", freeInvokes: 1, secret: false },
      ] },
      stunts: { stunts: [{ id: "stunt-1", type: "custom", title: "快劍", customText: "以戰鬥攻擊時 +2。", oncePerSession: true }] },
    };
    await mount({ initial: data });
    await waitFor(() => expect(slot("stunts")).toHaveTextContent("快劍"));
    await waitFor(() => expect(view().querySelector("[data-fate-roll-trigger='fight']")).not.toBeNull());
    await screen.findByRole("button", { name: "場次管理" });
    await waitFor(() => expect(slot("vitals")).toHaveTextContent("生命力"));
    await waitFor(() => expect(within(card("trouble")).getByRole("button", { name: "接受強迫 +1 命運點" })).toBeInTheDocument());
    await waitFor(() => expect(within(card("trouble")).getByRole("button", { name: "援引麻煩" })).toBeInTheDocument());
    const small = [...view().querySelectorAll("button")]
      .filter((target) => !/min-h-11|size-11|h-11/.test(target.className))
      .map((target) => target.getAttribute("aria-label") ?? target.textContent);
    expect(small).toEqual([]);
    // On a 320px card the title and the chips cannot share a row: the list must wrap, not squeeze.
    expect((view().querySelector("[data-fate-held] ul") as HTMLElement).className).toMatch(/basis-full/);
  });

  it("follows the active preset: ladder roster, shape hint and the sticky strip's stress", async () => {
    const observers: Array<(entries: Array<Partial<IntersectionObserverEntry>>) => void> = [];
    vi.stubGlobal("IntersectionObserver", class {
      constructor(callback: (entries: Array<Partial<IntersectionObserverEntry>>) => void) {
        observers.push(callback);
      }
      observe() {}
      disconnect() {}
    });
    await mount({ initial: shen });
    await waitFor(() => expect(ladderNames()).toContain("academics"));
    expect(ladderNames()).not.toContain("approach-careful");
    act(() => observers.forEach((callback) => callback([{ isIntersecting: false, boundingClientRect: { top: -200 } as DOMRectReadOnly }])));
    const sticky = () => view().querySelector("[data-fate-sticky]") as HTMLElement;
    expect(sticky()).toHaveTextContent("物理 1/4");
    expect(sticky()).toHaveTextContent("心靈 0/3");

    act(() => state.push(mixed(shen)));
    await waitFor(() => expect(ladderNames()).toEqual(expect.arrayContaining(["approach-careful", "approach-quick", "approach-sneaky"])));
    expect(ladderNames()).not.toContain("academics");
    expect(ladderNames()).not.toContain("fight");
    expect(view().querySelector("[data-fate-rung='3']")).toHaveTextContent("迅捷");
    expect(view().querySelector("[data-fate-rung='2']")).toHaveTextContent("謹慎");
    // The FAE spread (+3×1, +2×2, +1×2, +0×1), not the pyramid.
    const hint = view().querySelector("[data-fate-pyramid]") as HTMLElement;
    expect(hint).toHaveTextContent("1/1");
    expect(hint).toHaveTextContent("1/2");
    expect(hint).not.toHaveTextContent("1/4");
    expect(sticky()).toHaveTextContent("壓力 2/6");
    expect(sticky()).not.toHaveTextContent("物理");
    expect(sticky()).toHaveTextContent("輕傷");
  });

  it("lets a player add a situation aspect or a boost in play, but not on a read-only sheet", async () => {
    const { unmount } = await mount({ initial: shen });
    const held = () => view().querySelector("[data-fate-held]") as HTMLElement;
    fireEvent.click(within(held()).getByRole("button", { name: "新增情境或推助" }));
    fireEvent.change(within(held()).getByRole("textbox", { name: "內容" }), { target: { value: "地上滿是碎瓷" } });
    fireEvent.change(within(held()).getByRole("spinbutton", { name: "免費援引" }), { target: { value: "2" } });
    fireEvent.click(within(held()).getByRole("button", { name: "加入" }));
    const situation = readFateAspects(state.data).rows.find((row) => row.text === "地上滿是碎瓷");
    expect(situation).toMatchObject({ kind: "situation", freeInvokes: 2, secret: false });

    fireEvent.click(within(held()).getByRole("button", { name: "新增情境或推助" }));
    fireEvent.click(within(held()).getByRole("radio", { name: "推助" }));
    expect(within(held()).queryByRole("spinbutton")).toBeNull();
    fireEvent.change(within(held()).getByRole("textbox", { name: "內容" }), { target: { value: "他腳下一滑" } });
    fireEvent.click(within(held()).getByRole("button", { name: "加入" }));
    expect(readFateAspects(state.data).rows.find((row) => row.text === "他腳下一滑")).toMatchObject({ kind: "boost", freeInvokes: 1 });
    expect(held()).toHaveTextContent("地上滿是碎瓷");
    expect(held()).toHaveTextContent("他腳下一滑");
    unmount();

    await mount({ initial: shen, editable: false });
    expect(within(held()).queryByRole("button", { name: "新增情境或推助" })).toBeNull();
  });

  it("keeps a read-only sheet untouched with every slot mounted", async () => {
    await mount({ initial: shen, editable: false, setupMode: true });
    await waitFor(() => expect(slot("vitals")).toHaveTextContent("生命力"));
    await waitFor(() => expect(slot("stunts")).toHaveTextContent("快劍"));
    await waitFor(() => expect(slot("session")).not.toBeNull());
    expect(screen.queryByRole("button", { name: "規則配方" })).not.toBeInTheDocument();
    for (const button of view().querySelectorAll("button:not([disabled])")) fireEvent.click(button);
    for (const button of document.querySelectorAll("[role='dialog'] button:not([disabled])")) fireEvent.click(button);
    expect(state.setData).not.toHaveBeenCalled();
    expect(state.data).toBe(shen);
  });

  it("starts a session and ends a scene from the fate point card, each after a preview and a confirm", async () => {
    await mount({ initial: shen });
    const session = await waitFor(() => slot("session") as HTMLElement);
    fireEvent.click(await within(session).findByRole("button", { name: "新場次（補到重振）" }));
    let confirm = await screen.findByRole("alertdialog", { name: "新場次" });
    expect(confirm).toHaveTextContent("命運點 1 → 3");
    fireEvent.click(within(confirm).getByRole("button", { name: "取消" }));
    expect(state.setData).not.toHaveBeenCalled();
    fireEvent.click(within(session).getByRole("button", { name: "新場次（補到重振）" }));
    confirm = await screen.findByRole("alertdialog", { name: "新場次" });
    fireEvent.click(within(confirm).getByRole("button", { name: "確認開始新場次" }));
    expect(state.data.fatePoints).toBe(3);
    expect(ledger().at(-1)).toMatchObject({ reason: "sessionStart", delta: 2 });

    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    fireEvent.click(within(session).getByRole("button", { name: "場景結束（清壓力）" }));
    confirm = await screen.findByRole("alertdialog", { name: "場景結束" });
    expect(confirm).toHaveTextContent("物理 1 → 0");
    fireEvent.click(within(confirm).getByRole("button", { name: "結束並清除壓力" }));
    expect(state.data.physicalStress).toEqual([]);

    // Ledger, milestones and adjustments stay behind 場次管理, without a second copy of the two actions.
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    fireEvent.click(within(session).getByRole("button", { name: "場次管理" }));
    const manage = await screen.findByRole("dialog", { name: "場次管理" });
    expect(within(manage).getByText("命運點紀錄")).toBeInTheDocument();
    expect(within(manage).getByRole("button", { name: "小里程碑" })).toBeInTheDocument();
    expect(within(manage).queryByRole("button", { name: /確認開始新場次|結束並清除壓力/ })).toBeNull();
  });

  it("accepts a compel on the trouble card for +1 fate point with a ledger entry, and not when read-only or in edit mode", async () => {
    const { unmount } = await mount({ initial: shen });
    const accept = await waitFor(() => within(card("trouble")).getByRole("button", { name: "接受強迫 +1 命運點" }));
    expect(within(card("highConcept")).queryByRole("button", { name: /接受強迫/ })).toBeNull();
    const before = ledger().length;
    fireEvent.click(accept);
    fireEvent.click(accept);
    expect(state.data.fatePoints).toBe(2);
    expect(ledger().length).toBe(before + 1);
    expect(ledger().at(-1)).toMatchObject({ reason: "compel", delta: 1, aspectId: "trouble" });
    unmount();

    const readOnly = await mount({ initial: shen, editable: false });
    await waitFor(() => expect(within(card("trouble")).getByRole("button", { name: "接受強迫 +1 命運點" })).toBeDisabled());
    expect(within(card("trouble")).getByRole("button", { name: "援引麻煩" })).toBeDisabled();
    readOnly.unmount();

    await mount({ initial: shen, setupMode: true });
    await screen.findByRole("button", { name: "規則配方" });
    expect(within(card("trouble")).queryByRole("button", { name: /接受強迫|援引/ })).toBeNull();
  });

  it("applies session, stunt and milestone writes when the runtime's working copy is not the rendered object", async () => {
    await mount({ initial: shen, divergentWorkingCopy: true });
    fireEvent.click(await within(await waitFor(() => slot("session") as HTMLElement)).findByRole("button", { name: "新場次（補到重振）" }));
    fireEvent.click(await screen.findByRole("button", { name: "確認開始新場次" }));
    expect(state.setData).toHaveBeenCalled();
    expect(state.data.fatePoints).toBe(3);

    await waitFor(() => expect(slot("stunts")).toHaveTextContent("快劍"));
    fireEvent.click(within(slot("stunts") as HTMLElement).getByRole("button", { name: "編輯絕技" }));
    const dialog = await screen.findByRole("dialog", { name: "編輯絕技" });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "名稱" }), { target: { value: "快劍・改" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "儲存絕技" }));
    expect(readFateStunts(state.data).find((row) => row.id === "stunt-1")?.title).toBe("快劍・改");

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.click(within(slot("session") as HTMLElement).getByRole("button", { name: "場次管理" }));
    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: "小里程碑" }));
    });
    const before = state.data;
    fireEvent.click(await screen.findByRole("button", { name: "確認套用" }));
    expect(state.data).not.toBe(before);
    expect(JSON.stringify(state.data)).toMatch(/"kind":"minor"/);
  });
});

describe("lazy slot", () => {
  it("offers a retry after its chunk fails to load, then mounts the surface", async () => {
    const load = vi.fn<() => Promise<() => ReactNode>>()
      .mockRejectedValueOnce(new Error("ChunkLoadError"))
      .mockResolvedValue(() => <p>loaded surface</p>);
    const Slot = lazySlot(load);
    vi.spyOn(console, "error").mockImplementation(() => {});
    await act(async () => {
      render(<NextIntlClientProvider locale="zh-TW" messages={appZh} timeZone="UTC"><Slot /></NextIntlClientProvider>);
    });
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("發生錯誤");
    await act(async () => {
      fireEvent.click(within(alert).getByRole("button", { name: "重試" }));
    });
    expect(await screen.findByText("loaded surface")).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// The shell chunk: its static import graph reaches no feature surface, corpus or library.
// ---------------------------------------------------------------------------

// The graph stays inside the plugin and its data, so it runs from the plugin root alone: here and in
// the open-source export, which maps `@/plugins/fate/…` to `@skald/system-fate/…` and
// `@/data/fate-condensed/…` to `@skald/system-fate/data/fate-condensed/…`.
const FATE = resolve(__dirname, "../..");
const STATIC_IMPORT = /^\s*(?:import|export)\s+(?!type\b)(?:[^"';]*?\sfrom\s+)?["']([^"']+)["']/gm;
const PLUGIN_SPECIFIER = /^(?:@\/plugins\/fate|@skald\/system-fate)\/(?!data\/)(.+)$/;
const DATA_SPECIFIER = /^(?:@\/|@skald\/system-fate\/)data\/fate-condensed\/(.+)$/;

/** A plugin source file on disk, or null. */
function pluginFile(base: string): string | null {
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/** Where a static import lands: a plugin file (`plugins/fate/…`, followed), a data file (`data/fate-condensed/…`, a leaf), or outside both. */
function target(from: string, specifier: string): { label: string; file: string | null } | null {
  const data = DATA_SPECIFIER.exec(specifier);
  if (data) return { label: `data/fate-condensed/${data[1]}`, file: null };
  const plugin = PLUGIN_SPECIFIER.exec(specifier);
  const base = plugin ? join(FATE, plugin[1]) : specifier.startsWith(".") ? resolve(dirname(from), specifier) : null;
  if (!base || !base.startsWith(`${FATE}/`)) return null;
  const file = pluginFile(base);
  return file ? { label: `plugins/fate/${relative(FATE, file)}`, file } : null;
}

function staticGraph(entry: string): Set<string> {
  const seen = new Set<string>();
  const queue: { label: string; file: string | null }[] = [{ label: `plugins/fate/${relative(FATE, entry)}`, file: entry }];
  while (queue.length) {
    const { label, file } = queue.pop()!;
    if (seen.has(label)) continue;
    seen.add(label);
    if (!file || !/\.tsx?$/.test(file)) continue;
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(STATIC_IMPORT)) {
      const next = target(file, match[1]);
      if (next) queue.push(next);
    }
  }
  return seen;
}

describe("Fate B shell chunk", () => {
  it("statically imports no slot surface, rules corpus, preset catalog or stunt library", () => {
    const graph = [...staticGraph(join(FATE, "sheet/fate-sheet-adapter.tsx"))];
    const forbidden = [
      /^plugins\/fate\/sheet\/rolls\//,
      /^plugins\/fate\/sheet\/session\//,
      /^plugins\/fate\/sheet\/stunts\//,
      /^plugins\/fate\/sheet\/harm\//,
      /^plugins\/fate\/sheet\/presets\/(presets-entry|preset-dialog|roster-editor|feature-scope)/,
      /^plugins\/fate\/reference\/(fate-rules-dialog|corpus|load-rules|blocks)/,
      /^data\/fate-condensed\/(rules|stunts|presets)\//,
      /^data\/fate-condensed\/messages\/v2-/,
    ];
    expect(graph.filter((file) => forbidden.some((pattern) => pattern.test(file)))).toEqual([]);
    expect(graph).toContain("plugins/fate/sheet/play/play-view.tsx");
  });
});
