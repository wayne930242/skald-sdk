import { useEffect, useRef, useState, type ReactNode } from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { toast } from "sonner";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Schema, SheetMode } from "@skald/types/schema";
import type { LoadedSystem } from "@skald/types/system";
import appEn from "@skald/sheet-sdk/messages/en.json";
import appZh from "@skald/sheet-sdk/messages/zh-TW.json";
import systemEn from "@skald/system-fate/data/fate-condensed/messages/en.json";
import systemZh from "@skald/system-fate/data/fate-condensed/messages/zh-TW.json";
import presetsEn from "@skald/system-fate/data/fate-condensed/messages/v2-presets/en.json";
import presetsZh from "@skald/system-fate/data/fate-condensed/messages/v2-presets/zh-TW.json";
import labelsEn from "@skald/system-fate/data/fate-condensed/presets/labels/en.json";
import labelsZh from "@skald/system-fate/data/fate-condensed/presets/labels/zh-TW.json";
import schemaJson from "@skald/system-fate/data/fate-condensed/schema.json";
import defaultData from "@skald/system-fate/data/fate-condensed/default-data.json";
import { SchemaDataContext, SchemaStaticContext } from "@skald/sheet-sdk/modules/character/ui/renderer/schema-context";
import { SheetModeProvider } from "@skald/sheet-sdk/modules/character/ui/renderer/sheet-mode";
import { RollProvider } from "@skald/sheet-sdk/modules/rolls/ui/context/roll-context";
import { LONG_PRESS_MS } from "@skald/sheet-sdk/modules/rolls/ui/dice/use-long-press";
import { readFateResources } from "../../domain/normalize";
import { FatePresetsEntry } from "../presets/presets-entry";
import { rollTray, SkillTrigger } from "../rolls";
import { loadFateRollMessages } from "../rolls/roll-messages";
import { resetFateRollStore } from "../rolls/roll-store";
import { loadFatePlayMessages } from "./play-messages";
import { loadFatePlayRules } from "./play-rules";
import { FatePlayView } from "./play-view";
import type { FatePlaySlots } from "./slots";

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(() => "toast-1"), { success: vi.fn(), error: vi.fn(), dismiss: vi.fn() }) }));
vi.mock("../../reference/fate-rules-dialog", () => ({
  FateRulesDialog: ({ initialSection }: { initialSection?: string }) => <div role="dialog" data-rules-section={initialSection} />,
}));

type Data = Record<string, unknown>;
type Updater = Data | ((previous: Data) => Data);

const schema = schemaJson as unknown as Schema;
const system = {
  config: { id: "fate-condensed", sheetComponent: "fate" },
  runtime: { systemId: "s", templateVersionId: "v", builtinTemplate: true },
  schema, template: { pages: [] }, defaultData, mappings: {}, gameData: {},
} as unknown as LoadedSystem;

const shen: Data = {
  ...defaultData,
  name: "沈青霜",
  fatePoints: 2,
  aspects: { format: 2, aspects: [
    { id: "highConcept", kind: "highConcept", text: "遭東廠追殺的忠臣之女", freeInvokes: 0, secret: false },
    { id: "trouble", kind: "trouble", text: "一句不平便拔劍", freeInvokes: 0, secret: false },
  ] },
  skills: { skills: [{ id: "fight", name: "戰鬥", level: 4 }, { id: "physique", name: "體魄", level: 1 }] },
  physicalStress: [1],
  mildConsequence: "肩上一刀",
  stunts: { stunts: [
    { id: "quick-blade", type: "bonus", title: "快劍", skillId: "fight", action: "attack", circumstance: "對手尚未出手" },
    { id: "once-a-night", type: "bonus", title: "一夜一次", skillId: "fight", circumstance: "月黑風高", oncePerSession: true },
  ] },
  fateV2: { session: { id: "session-1", sequence: 1 } },
};

const host = { data: {} as Data, writes: 0, replace: (_next: Data) => {} };

function Harness({ initial, editable, mode, slots }: { initial: Data; editable: boolean; mode: SheetMode; slots?: FatePlaySlots }) {
  const [data, setData] = useState(initial);
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
    const next = typeof updater === "function" ? updater(working.current) : updater;
    working.current = next;
    setData(next);
  };
  return (
    <SchemaStaticContext.Provider value={{ schema, editable, setupMode: mode === "edit", printMode: false, viewMode: "web", setData: write, onBlur: () => {} }}>
      <SchemaDataContext.Provider value={{ data }}>
        <SheetModeProvider mode={mode}>
          <FatePlayView system={system} slots={slots} />
        </SheetModeProvider>
      </SchemaDataContext.Provider>
    </SchemaStaticContext.Provider>
  );
}

// A chip needs both the roll trigger and the recipe entry's registered editor. Use the real
// components without their lazy slot boundaries; assembly.test covers lazy wiring separately.
const editInteractionSlots: FatePlaySlots = { rollTray, SkillTrigger, presets: FatePresetsEntry };
const rosterSlots: FatePlaySlots = { presets: FatePresetsEntry };

async function mount({ data = shen, editable = true, mode = "edit" as SheetMode, slots, locale = "zh-TW" }: { data?: Data; editable?: boolean; mode?: SheetMode; slots?: FatePlaySlots; locale?: "en" | "zh-TW" } = {}) {
  host.writes = 0;
  const [app, systemMessages] = locale === "en" ? [appEn, systemEn] : [appZh, systemZh];
  const wrapper = ({ children }: { children: ReactNode }) => (
    <NextIntlClientProvider locale={locale} messages={{ ...app, ...systemMessages, roll: { ...app.roll, ...systemMessages.roll } }} timeZone="UTC">{children}</NextIntlClientProvider>
  );
  const tree = (sheetMode: SheetMode) => (
    <RollProvider characterId="char-1" characterName="沈青霜">
      <Harness initial={data} editable={editable} mode={sheetMode} slots={slots} />
    </RollProvider>
  );
  let mounted!: ReturnType<typeof render>;
  await act(async () => {
    mounted = render(tree(mode), { wrapper });
  });
  await waitFor(() => expect(document.querySelector("[data-fate-play-view]")).not.toBeNull());
  return async (next: SheetMode) => {
    await act(async () => {
      mounted.rerender(tree(next));
    });
  };
}

const view = () => document.querySelector("[data-fate-play-view]") as HTMLElement;
const slot = (id: string) => view().querySelector(`[data-fate-slot='${id}']`) as HTMLElement;
const chip = () => view().querySelector("[data-fate-roll-trigger='fight']") as HTMLElement | null;
const trayIsEmpty = () => view().querySelector("[data-fate-roll-tray]")?.hasAttribute("data-empty") === true;
const derived = (id: string) => view().querySelector(`[data-derived-value='${id}']`) as HTMLElement | null;
const refresh = () => (host.data.fateV2 as Data | undefined)?.refresh as Data | undefined;

beforeAll(async () => {
  await Promise.all([
    ...(["en", "zh-TW"] as const).flatMap(locale => [loadFatePlayMessages(locale), loadFatePlayRules(locale), loadFateRollMessages(locale)]),
    // The real recipe entry still lazy-loads its dialog on first open.
    import("../presets/preset-dialog"),
  ]);
});

beforeEach(() => {
  resetFateRollStore();
  vi.mocked(toast).mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

async function closeRecipe(dialog: HTMLElement) {
  await act(async () => {
    fireEvent.click(within(dialog).getByRole("button", { name: "關閉" }));
  });
  await waitFor(() => expect(dialog).not.toBeInTheDocument());
}

describe("skill chips in edit mode (B-023 q1: every tap edits)", () => {
  const gestures: [string, (target: HTMLElement) => void][] = [
    ["tap", (target) => fireEvent.click(target)],
    ["Enter", (target) => fireEvent.keyDown(target, { key: "Enter" })],
    ["Space", (target) => fireEvent.keyDown(target, { key: " " })],
    ["Shift+Enter", (target) => fireEvent.keyDown(target, { key: "Enter", shiftKey: true })],
    ["menu key", (target) => fireEvent.keyDown(target, { key: "ContextMenu" })],
  ];

  it.each(gestures)("%s opens the roster editor at that skill, never a roll", async (_name, gesture) => {
    await mount({ slots: editInteractionSlots });
    // The edit button only replaces the plain chip after the roster editor registers.
    const opener = await screen.findByRole("button", { name: "編輯戰鬥" });
    expect(opener).not.toHaveAttribute("aria-haspopup");
    expect(opener).not.toHaveAttribute("aria-keyshortcuts");

    await act(async () => { gesture(opener); });
    const dialog = await screen.findByRole("dialog", { name: "規則配方" });
    const rename = within(dialog).getByLabelText("重新命名「戰鬥」", { selector: "input" });
    await waitFor(() => expect(rename).toHaveFocus());
    expect(screen.queryByRole("dialog", { name: "擲骰選項" })).toBeNull();
    expect(trayIsEmpty()).toBe(true);
    expect(host.writes).toBe(0);
  });

  it("returns focus to the clicked chip when the browser leaves focus on body", async () => {
    await mount({ slots: editInteractionSlots });
    await waitFor(() => expect(chip()).toHaveAccessibleName("編輯戰鬥"));
    const opener = chip() as HTMLElement;
    expect(document.activeElement).toBe(document.body);
    fireEvent.click(opener);
    await closeRecipe(await screen.findByRole("dialog", { name: "規則配方" }));
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it("returns focus to the clicked chip when another control held focus before the click", async () => {
    await mount({ slots: editInteractionSlots });
    await waitFor(() => expect(chip()).toHaveAccessibleName("編輯戰鬥"));
    const opener = chip() as HTMLElement;
    const elsewhere = document.createElement("button");
    document.body.append(elsewhere);
    elsewhere.focus();
    expect(document.activeElement).toBe(elsewhere);
    fireEvent.click(opener);
    await closeRecipe(await screen.findByRole("dialog", { name: "規則配方" }));
    await waitFor(() => expect(opener).toHaveFocus());
    elsewhere.remove();
  });

  it("a long press does nothing and a right click keeps the browser menu", async () => {
    await mount({ slots: editInteractionSlots });
    await waitFor(() => expect(chip()).toHaveAccessibleName("編輯戰鬥"));
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    fireEvent.pointerDown(chip() as HTMLElement, { button: 0, clientX: 10, clientY: 10 });
    act(() => {
      vi.advanceTimersByTime(LONG_PRESS_MS + 100);
    });
    fireEvent.pointerUp(chip() as HTMLElement);
    vi.useRealTimers();
    let menuAllowed = false;
    await act(async () => {
      // `fireEvent` returns false when a handler called preventDefault.
      menuAllowed = fireEvent.contextMenu(chip() as HTMLElement);
    });
    expect(menuAllowed).toBe(true);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trayIsEmpty()).toBe(true);
  });

  it("with no skill editor on the sheet, an edit-mode chip is plain text, not a roll button", async () => {
    await mount({ slots: { rollTray, SkillTrigger } });
    await waitFor(() => expect(view().querySelector("[data-fate-roll-tray]")).not.toBeNull());
    expect(within(view().querySelector("[data-fate-ladder]") as HTMLElement).getByText("戰鬥")).toBeTruthy();
    expect(chip()).toBeNull();
    expect(screen.queryByRole("button", { name: /^擲 戰鬥/ })).toBeNull();
  });

  it("play mode keeps the roll trigger and its name", async () => {
    await mount({ mode: "play", slots: editInteractionSlots });
    await waitFor(() => expect(chip()).toHaveAccessibleName("擲 戰鬥 +4"));
    expect(chip()?.getAttribute("aria-haspopup")).toBe("dialog");
  });
});

describe("recipe roster names", () => {
  const locales = [
    { locale: "en", messages: presetsEn.fatePresets, names: systemEn.skill, labels: labelsEn },
    { locale: "zh-TW", messages: presetsZh.fatePresets, names: systemZh.skill, labels: labelsZh },
  ] as const;

  async function openRoster(messages: typeof presetsEn.fatePresets) {
    const button = await screen.findByRole("button", { name: messages.open });
    await act(async () => { fireEvent.click(button); });
    const dialog = within(await screen.findByRole("dialog", { name: messages.open }));
    fireEvent.click(dialog.getByText(messages.roster));
    return dialog;
  }

  it.each(locales)("uses the ladder’s default skill names and preserves renames in $locale", async ({ locale, messages, names }) => {
    await mount({ data: defaultData, locale, slots: rosterSlots });
    const dialog = await openRoster(messages);
    const renameInput = (name: string) => dialog.getByLabelText(messages.renameLabel.replace("{skill}", name), { selector: "input" });
    for (const { id } of schemaJson.fields.skills.defaultSkills) {
      const name = names[id as keyof typeof names];
      expect(view().querySelector(`[data-fate-skill="${id}"]`)).toHaveTextContent(name);
      expect(renameInput(name)).toHaveValue(name);
    }
    const name = names.academics;
    const rename = (input: HTMLElement, value: string) => {
      fireEvent.change(input, { target: { value } });
      fireEvent.submit(input.closest("form") as HTMLFormElement);
    };
    rename(renameInput(name), "Astronomy");
    expect(view().querySelector('[data-fate-skill="academics"]')).toHaveTextContent("Astronomy");
    rename(renameInput("Astronomy"), name);
    expect(JSON.stringify(host.data.skills)).not.toContain(JSON.stringify(name));
    expect(JSON.stringify(host.data.skills)).not.toContain("isCustomName");
    expect(view().querySelector('[data-fate-skill="academics"]')).toHaveTextContent(name);
    expect(renameInput(name)).toHaveValue(name);
  });

  it.each(locales)("localizes hidden skills and preview labels in $locale", async ({ locale, messages, names }) => {
    const data = { ...defaultData, skills: { skills: [{ id: "fight", level: 1 }], hiddenSkillIds: ["academics"] } };
    await mount({ data, locale, slots: rosterSlots });
    const dialog = await openRoster(messages);
    expect(dialog.getByRole("button", { name: messages.restoreLabel.replace("{skill}", names.academics) })).toHaveTextContent(names.academics);
    fireEvent.change(dialog.getByRole("combobox", { name: messages.axis.skills }), { target: { value: "short-approaches" } });
    expect(dialog.getByRole("region", { name: messages.preview })).toHaveTextContent(names.fight);
  });

  it.each(locales)("uses preset labels for namespaced skills in $locale", async ({ locale, messages, labels }) => {
    await mount({ data: { ...defaultData, fateV2: { ...defaultData.fateV2, preset: { selection: { skills: "short-approaches" } } } }, locale, slots: rosterSlots });
    const dialog = await openRoster(messages);
    const name = labels.skills["approach-careful"];
    expect(view().querySelector('[data-fate-skill="approach-careful"]')).toHaveTextContent(name);
    expect(dialog.getByRole("textbox", { name: messages.renameLabel.replace("{skill}", name) })).toHaveValue(name);
    fireEvent.click(dialog.getByRole("button", { name: messages.hideLabel.replace("{skill}", name) }));
    expect(dialog.getByRole("button", { name: messages.restoreLabel.replace("{skill}", name) })).toHaveTextContent(name);
  });

  it("opts all recipe text inputs out of autofill and password managers", async () => {
    await mount({ data: defaultData, slots: rosterSlots });
    const dialog = await openRoster(presetsZh.fatePresets);
    const inputs = dialog.getAllByRole("textbox");
    expect(inputs).toHaveLength(schemaJson.fields.skills.defaultSkills.length + 1);
    for (const input of inputs) {
      expect(input).toHaveAttribute("autocomplete", "off");
      expect(input).toHaveAttribute("data-1p-ignore");
      expect(input).toHaveAttribute("data-lpignore", "true");
    }
  });
});

describe("refresh as a derived value (B-024)", () => {
  function findRefreshEditor() {
    return waitFor(() => {
      const editor = derived("refresh");
      expect(editor).toBeInTheDocument();
      return editor as HTMLElement;
    });
  }

  it("edit mode overrides refresh in fateV2.refresh.override and restores the auto value", async () => {
    await mount();
    const value = await findRefreshEditor();
    expect(value).toHaveAttribute("data-derived-mode", "overridable");
    expect(value).toHaveTextContent("自動計算");
    const input = within(value).getByRole("spinbutton", { name: "覆寫重振" }) as HTMLInputElement;
    expect(input.value).toBe("3");
    expect(within(value).getByRole("button", { name: "重振恢復自動計算" })).toBeDisabled();

    await act(async () => {
      fireEvent.focus(input);
      fireEvent.change(input, { target: { value: "5" } });
      fireEvent.blur(input);
    });
    expect(refresh()?.override).toBe(5);
    expect(host.data.refresh).toBe(5);
    expect(readFateResources(host.data).effectiveRefresh).toBe(5);
    expect(derived("refresh")).toHaveAttribute("data-overridden", "true");
    expect(derived("refresh")).toHaveTextContent("已覆寫");
    expect(derived("refresh")).toHaveTextContent("自動計算：3");

    await act(async () => {
      fireEvent.click(within(derived("refresh") as HTMLElement).getByRole("button", { name: "重振恢復自動計算" }));
    });
    expect(refresh()).toBeDefined();
    expect(refresh()?.override).toBeUndefined();
    expect(readFateResources(host.data).effectiveRefresh).toBe(3);
    expect(derived("refresh")).not.toHaveAttribute("data-overridden");
  });

  it("keeps an override at least 1 and restores a legacy saved refresh to the auto value", async () => {
    await mount({ data: { ...shen, refresh: 5, fateV2: { session: { id: "session-1", sequence: 1 } } } });
    const value = await findRefreshEditor();
    expect(value).toHaveAttribute("data-overridden", "true");
    const input = within(value).getByRole("spinbutton", { name: "覆寫重振" }) as HTMLInputElement;
    await act(async () => {
      fireEvent.focus(input);
      fireEvent.change(input, { target: { value: "0" } });
      fireEvent.blur(input);
    });
    expect(refresh()?.override).toBe(1);
    await act(async () => {
      fireEvent.click(within(derived("refresh") as HTMLElement).getByRole("button", { name: "重振恢復自動計算" }));
    });
    expect(readFateResources(host.data)).toMatchObject({ refreshOverride: undefined, effectiveRefresh: 3 });
  });

  it("play mode marks an overridden refresh and offers no input", async () => {
    const overridden = { ...shen, fateV2: { ...(shen.fateV2 as Data), refresh: { base: 3, earned: 0, override: 4 } } };
    const switchMode = await mount({ data: overridden, mode: "play" });
    const points = view().querySelector("[data-fate-points]") as HTMLElement;
    expect(points.querySelector("[data-derived-overridden='refresh']")).not.toBeNull();
    expect(within(points).getByText("已覆寫")).toBeTruthy();
    expect(derived("refresh")).toBeNull();
    await switchMode("edit");
    await waitFor(() => expect(derived("refresh")).not.toBeNull());
    host.replace({ ...overridden, fateV2: { ...(shen.fateV2 as Data), refresh: { base: 3, earned: 0 } } });
    await switchMode("play");
    expect(view().querySelector("[data-derived-overridden='refresh']")).toBeNull();
  });

  it("a read-only sheet never shows the refresh editor", async () => {
    await mount({ editable: false, mode: "play" });
    expect(derived("refresh")).toBeNull();
  });
});

describe("stress boxes and the extra mild slot (auto-only)", () => {
  it("edit mode shows each track's box count and the extra mild slots as auto values with no input", async () => {
    const strong = { ...shen, skills: { skills: [{ id: "fight", level: 4 }, { id: "physique", level: 5 }, { id: "will", level: 1 }] } };
    await mount({ data: strong });
    await waitFor(() => expect(derived("extraMild-mental")).toBeInTheDocument());
    const physical = derived("stress:physical");
    for (const [id, shown] of [["stress:physical", "6"], ["stress:mental", "4"], ["extraMild-physical", "1"], ["extraMild-mental", "0"]] as const) {
      const value = derived(id) as HTMLElement;
      expect(value, id).toHaveAttribute("data-derived-mode", "auto-only");
      expect(value, id).not.toHaveTextContent("自動計算（不可覆寫）");
      expect(value.querySelector("input"), id).toBeNull();
      expect(within(value).getAllByRole("button").map((button) => button.getAttribute("aria-label")), id).toEqual(["自動計算（不可覆寫）"]);
      expect(value, id).toHaveTextContent(shown);
    }
    expect(physical).toHaveTextContent("物理壓力格數");
  });

  it("play mode keeps the vitals card free of derived rows", async () => {
    await mount({ mode: "play" });
    await waitFor(() => expect(slot("vitals")).toHaveTextContent("生命力"));
    await screen.findByRole("button", { name: "物理壓力第 1 格" });
    expect(slot("vitals").querySelector("[data-derived-value]")).toBeNull();
  });
});

describe("play controls in edit mode never record play state", () => {
  it("stress, hits, recovery, session boundaries, compels and a stunt's used marker are inert", async () => {
    await mount();
    await waitFor(() => expect(slot("vitals")).toHaveTextContent("肩上一刀"));
    const cell = within(slot("vitals")).getByRole("checkbox", { name: "物理壓力第 1 格" });
    expect(cell).toHaveAttribute("aria-readonly", "true");
    expect(within(slot("vitals")).queryByRole("button", { name: /物理壓力第/ })).toBeNull();
    expect(within(slot("vitals")).queryByRole("button", { name: "受擊分配" })).toBeNull();
    expect(within(slot("vitals")).queryByRole("button", { name: /記錄治療|清除已恢復/ })).toBeNull();

    const session = await waitFor(() => within(slot("session")).getByRole("button", { name: "新場次（補到重振）" }));
    expect(session).toBeDisabled();
    expect(within(slot("session")).getByRole("button", { name: "場景結束（清壓力）" })).toBeDisabled();
    expect(within(slot("session")).queryByText("切換到遊玩模式才能記錄場次與命運點")).toBeNull();
    fireEvent.click(within(slot("session")).getByRole("button", { name: "新場次與場景結束的效果" }));
    expect(await screen.findByText("切換到遊玩模式才能記錄場次與命運點")).toBeTruthy();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    fireEvent.click(within(slot("session")).getByRole("button", { name: "場次管理" }));
    const manage = await screen.findByRole("dialog", { name: "場次管理" });
    expect(within(manage).getByRole("button", { name: "接受強迫 +1" })).toBeDisabled();
    expect(within(manage).getByRole("button", { name: "拒絕強迫 −1" })).toBeDisabled();
    expect(within(manage).getByRole("button", { name: "確認套用" })).toBeDisabled();
    // A milestone edits the character, so it stays available in edit mode.
    expect(within(manage).getByRole("button", { name: "大里程碑" })).toBeEnabled();
    fireEvent.keyDown(manage, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "場次管理" })).toBeNull());

    await waitFor(() => expect(slot("stunts")).toHaveTextContent("一夜一次"));
    expect(within(slot("stunts")).getByRole("button", { name: "標為已使用" })).toBeDisabled();
    expect(host.writes).toBe(0);
  });
});

describe("recalculation on leaving edit mode (B-024 q3)", () => {
  const recalcRows = async () => {
    await waitFor(() => expect(toast).toHaveBeenCalled());
    const [title, options] = vi.mocked(toast).mock.calls.at(-1) as unknown as [string, { description: ReactNode }];
    expect(title).toBe("已重新計算");
    const { container, unmount } = render(<>{options.description}</>);
    const rows = [...container.querySelectorAll("[data-recalc-row]")].map((row) => [row.getAttribute("data-recalc-row"), row.textContent]);
    unmount();
    return rows;
  };

  it("lists a lower stress capacity and the marks kept beyond it, and never drops a mark", async () => {
    const data = { ...shen, skills: { skills: [{ id: "fight", level: 4 }, { id: "physique", level: 3 }] }, physicalStress: [1, 6] };
    const switchMode = await mount({ data });
    await waitFor(() => expect(derived("stress:physical")).toHaveTextContent("6"));
    host.replace({ ...data, skills: { skills: [{ id: "fight", level: 4 }, { id: "physique", level: 1 }] } });
    await switchMode("play");
    expect(await recalcRows()).toEqual([
      ["changed", "物理壓力格數：6 → 4"],
      ["keptOutOfCap", "物理壓力格數：保留 6（上限 4）"],
    ]);
    expect(host.data.physicalStress).toEqual([1, 6]);
  });

  it("does not relist existing over-cap stress when only refresh changes", async () => {
    const data = { ...shen, physicalStress: [6] };
    const switchMode = await mount({ data });
    await waitFor(() => expect(derived("stress:physical")).toHaveTextContent("4"));
    const stunts = { stunts: Array.from({ length: 4 }, (_, i) => ({ id: `s${i}`, type: "custom", title: `Stunt ${i}`, customText: "+2" })) };
    await act(async () => host.replace({ ...data, stunts }));
    await switchMode("play");
    expect(await recalcRows()).toEqual([["changed", "重振：3 → 2"]]);
    expect(host.data.physicalStress).toEqual([6]);
  });

  it("lists retained condition marks only for the condition whose capacity fell", async () => {
    const conditions = { "hurt:3": { text: "Sprained ankle" }, "injured:2": { text: "Broken arm" } };
    const data = {
      ...shen,
      skills: { skills: [{ id: "physique", level: 5 }] },
      fateV2: { preset: { id: "condensed-standard", version: 1, selection: { injuries: "conditions" } }, harm: { conditions } },
    };
    const switchMode = await mount({ data });
    await act(async () => host.replace({ ...data, skills: { skills: [{ id: "physique", level: 4 }] } }));
    await switchMode("play");
    const kept = (await recalcRows()).filter(([kind]) => kind === "keptOutOfCap");
    expect(kept).toHaveLength(1);
    expect(kept[0][1]).toContain("保留 3（上限 1）");
    expect(host.data.fateV2).toEqual(data.fateV2);
  });

  it("lists a lost extra mild slot whose consequence is kept", async () => {
    const data = {
      ...shen,
      skills: { skills: [{ id: "fight", level: 4 }, { id: "physique", level: 5 }] },
      fateV2: { ...(shen.fateV2 as Data), harm: { extraMild: { physical: { text: "斷了一根肋骨" } } } },
    };
    const switchMode = await mount({ data });
    await waitFor(() => expect(derived("extraMild-physical")).toHaveTextContent("1"));
    host.replace({ ...data, skills: { skills: [{ id: "fight", level: 4 }, { id: "physique", level: 4 }] } });
    await switchMode("play");
    const rows = await recalcRows();
    expect(rows).toContainEqual(["changed", "額外輕微（物理）後果槽：1 → 0"]);
    expect(rows).toContainEqual(["keptOutOfCap", "額外輕微（物理）後果槽：保留 1（上限 0）"]);
  });

  it("an overridden refresh whose auto value moved offers 恢復自動計算 that writes fateV2 only", async () => {
    const stunts = (count: number) => ({ stunts: Array.from({ length: count }, (_, i) => ({ id: `s${i}`, type: "custom", title: `絕技${i}`, customText: "＋2" })) });
    const data = { ...shen, stunts: stunts(3), fateV2: { ...(shen.fateV2 as Data), refresh: { base: 3, earned: 0, override: 5 } } };
    const switchMode = await mount({ data });
    await waitFor(() => expect(derived("refresh")).not.toBeNull());
    host.replace({ ...data, stunts: stunts(4) });
    await switchMode("play");
    await waitFor(() => expect(toast).toHaveBeenCalled());
    const [, options] = vi.mocked(toast).mock.calls.at(-1) as unknown as [string, { description: ReactNode }];
    const { container, unmount } = render(<>{options.description}</>);
    const row = container.querySelector("[data-recalc-row='overridden']") as HTMLElement;
    expect(row).toHaveTextContent("重振維持覆寫 5（自動計算 3 → 2）");
    await act(async () => {
      fireEvent.click(within(row).getByRole("button", { name: "恢復自動計算" }));
    });
    unmount();
    expect(readFateResources(host.data)).toMatchObject({ refreshOverride: undefined, effectiveRefresh: 2 });
  });

  it("says nothing when no trigger changed while editing", async () => {
    const switchMode = await mount();
    await waitFor(() => expect(derived("refresh")).not.toBeNull());
    await act(async () => host.replace({ ...shen, name: "沈青霜・改" }));
    await switchMode("play");
    // Drain the lazy notice import if leaving edit mode mistakenly requested it.
    await vi.dynamicImportSettled();
    expect(toast).not.toHaveBeenCalled();
  });
});
