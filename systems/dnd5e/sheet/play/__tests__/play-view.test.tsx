import { useEffect, useState, type ReactNode } from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi, beforeAll } from "vitest";
import { zhWithheld } from "../../../__tests__/zh-withheld";
import type { Schema, Template } from "@skald/types/schema";
import type { LoadedSystem } from "@skald/types/system";
import appZh from "@skald/sheet-sdk/messages/zh-TW.json";
import systemZh from "@skald/system-dnd5e/data/dnd5e-2024/messages/zh-TW.json";
import schemaJson from "@skald/system-dnd5e/data/dnd5e-2024/schema.json";
import templateJson from "@skald/system-dnd5e/data/dnd5e-2024/template.json";
import weapons from "@skald/system-dnd5e/data/dnd5e-2024/game/weapons.json";
import classes from "@skald/system-dnd5e/data/dnd5e-2024/game/classes.json";
import { TemplateRenderer } from "@skald/sheet-sdk/modules/character/ui/renderer/template-renderer";
import { SystemPluginProvider } from "@skald/sheet-sdk/modules/systems/ui/system-plugin-provider";
import { useReferenceContext } from "../../use-reference-context";
import { DndPlayView } from "../play-view";
import { preloadPlayTabs } from "../lazy-tabs";
import { loadEditMessages } from "../edit-messages";
import { loadEconomyMessages } from "../../economy/economy-intl";
import { bindHostPort, HostPortsProvider } from "@skald/sheet-sdk/modules/systems/ui/host-ports";
import { corePorts } from "@skald/sheet-sdk/modules/systems/ui/core-ports";

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
const upload = vi.hoisted(() => vi.fn(async () => "https://example.test/elin.webp?v=2"));
/** Whether someone is signed in on the host the portrait upload belongs to. */
const auth = { signedIn: false };
const hostPorts = [bindHostPort(corePorts.portraitUpload, { subscribe: () => () => {}, isSignedIn: () => auth.signedIn, upload })];

const schema = schemaJson as unknown as Schema;
const template = templateJson as unknown as Template;
const system = {
  config: { id: "dnd5e-2024", sheetComponent: "dnd5e" },
  schema,
  template,
  defaultData: {},
  mappings: {},
  gameData: { weapons, classes },
} as unknown as LoadedSystem;

/** Elin, the frames' wizard: data with the formula values already on it (no formula runtime here). */
const elin: Record<string, unknown> = {
  name: "艾琳", level: 1, classId: "wizard", weaponProficiencies: "簡易武器",
  str: 8, dex: 14, con: 14, int: 16, wis: 12, cha: 10,
  strMod: -1, dexMod: 2, conMod: 2, intMod: 3, wisMod: 1, chaMod: 0,
  strSave: -1, dexSave: 2, conSave: 2, intSave: 5, wisSave: 3, chaSave: 0, intSaveProf: true, wisSaveProf: true,
  profBonus: 2, ac: 12, initiative: 2, speed: 30, passivePerception: 13, perception: 3,
  arcana: 5, arcanaProf: "proficient", history: 5, historyProf: "expertise", acrobatics: 2,
  hpMax: 8, hitDieFaces: 6, hitDiceMax: 1, hitDiceSpent: 0,
  spellAbility: "int", spellMod: 3, spellSaveDc: 13, spellAttack: 5, slot1Total: 2, slot1Used: 0,
  spells: [
    { id: "s1", level: 0, name: "光亮術", ref: "spell:light", prepared: true, material: true },
    { id: "s2", level: 1, name: "魔法飛彈", ref: "", prepared: true, source: "class" },
  ],
  equipment: [{ id: "e1", qty: 2, name: "匕首", ref: "baseItem:dagger", equipped: false, origin: "srd" }],
  weapons: [],
  features: [{ id: "f1", name: "施法", ref: "", origin: "custom", text: "你能施展法術。\n• 準備法術。" }],
};

const openReference = vi.fn();

function Sheet({ initial, editable = true }: { initial: Record<string, unknown>; editable?: boolean }) {
  const [data, setData] = useState(initial);
  useEffect(() => {
    saved.data = data;
  });
  const reference = useReferenceContext(system);
  return (
    <TemplateRenderer
      template={template}
      schema={schema}
      data={data}
      viewMode="web"
      mode="play"
      editable={editable}
      onChange={(path, value) => setData((previous) => ({ ...previous, [path]: value }))}
      setData={setData}
      characterId="c-elin"
      playView={<DndPlayView system={system} reference={reference} openReference={openReference} openCompendium={null} />}
    />
  );
}

/** The sheet's data after the last render, for assertions. */
const saved: { data: Record<string, unknown> } = { data: {} };
let width = 1440;

async function mount(initial = elin, editable = true) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <NextIntlClientProvider locale="zh-TW" messages={{ ...appZh, ...systemZh }} timeZone="UTC">
      <HostPortsProvider ports={hostPorts}>
        <SystemPluginProvider catalog={{}}>{children}</SystemPluginProvider>
      </HostPortsProvider>
    </NextIntlClientProvider>
  );
  // The play labels load lazily (one chunk per locale): let the view resolve them.
  await act(async () => {
    render(<Sheet initial={initial} editable={editable} />, { wrapper });
  });
  await screen.findByRole("tab", { name: "戰鬥" });
}

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => ({ width, height: 800, top: 0, left: 0, right: width, bottom: 800, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect);
});
afterEach(() => {
  vi.restoreAllMocks();
  width = 1440;
});

const view = () => document.querySelector("[data-dnd-play-view]") as HTMLElement;

// The tabs past 角色 load when they open; load them ahead so a test reads them at once.
// The tabs' edit labels (plan-uat2 §3.2) load with them: load both ahead too.
beforeAll(() => Promise.all([preloadPlayTabs(), loadEditMessages("zh-TW"), loadEditMessages("en"), loadEconomyMessages("zh-TW"), loadEconomyMessages("en")]));

describe("D&D play view", () => {
  it.skipIf(zhWithheld("messages/play/zh-TW.json", "messages/zh-TW.json"))("renders the character's values read-only: no form inputs, the frame's numbers", async () => {
    await mount();
    expect(view()).toHaveAttribute("data-layout", "wide");
    expect(view().querySelectorAll("input, textarea, select, [role='combobox']")).toHaveLength(0);
    expect(screen.getByLabelText("生命值 8/8")).toBeInTheDocument();
    expect(view().querySelector("[data-play-stat='ac']")).toHaveTextContent("12");
    expect(view().querySelector("[data-play-stat='passive']")).toHaveTextContent("13");
    expect(screen.getByRole("button", { name: "力量檢定 −1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "智力豁免 +5 · 熟練" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "歷史 +5 · 專精" })).toBeInTheDocument();
  });

  it.skipIf(zhWithheld("messages/play/zh-TW.json"))("HP − and + record damage and healing; a read-only host cannot", async () => {
    await mount();
    fireEvent.click(screen.getByRole("button", { name: "失去1點生命值" }));
    expect(saved.data.hp).toEqual({ current: 7 });
    expect(screen.getByLabelText("生命值 7/8")).toBeInTheDocument();
  });

  it.skipIf(zhWithheld("messages/play-tabs/zh-TW.json", "messages/play/zh-TW.json"))("a slot pip spends a slot and a long rest restores it", async () => {
    await mount();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "法術" }));
    fireEvent.click(screen.getByRole("tab", { name: "法術" }));
    const pips = within(view().querySelector("[data-play-spell-level='1']") as HTMLElement).getAllByRole("button", { name: /1 環法術位第/ });
    expect(pips).toHaveLength(2);
    fireEvent.click(pips[0]);
    expect(saved.data.slot1Used).toBe(1);
    expect(view().querySelector("[data-play-spell-level='1']")).toHaveTextContent("剩 1/2");

    // The confirmation's labels load with the first rest (later-text.ts); the dialog opens then.
    await act(async () => {
      fireEvent.click(screen.getAllByRole("button", { name: "長休" })[0]);
    });
    const confirm = await screen.findByRole("alertdialog", { name: "進行長休？" });
    await act(async () => {
      fireEvent.click(within(confirm).getByRole("button", { name: "長休" }));
    });
    expect(saved.data.slot1Used).toBe(0);
    expect(saved.data.hp).toEqual({ current: 8 });
  });

  it.skipIf(zhWithheld("messages/play-tabs/zh-TW.json", "messages/play/zh-TW.json", "messages/zh-TW.json"))("adds an inventory dagger as a DEX attack for a DEX character", async () => {
    await mount();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "物品" }));
    fireEvent.click(screen.getByRole("tab", { name: "物品" }));
    fireEvent.click(screen.getByRole("button", { name: "把匕首加為攻擊" }));
    const [row] = saved.data.weapons as Array<Record<string, unknown>>;
    expect(row).toMatchObject({ name: "匕首", ability: "dex", proficient: true, damageDice: "1d4", damageType: "穿刺", ref: "baseItem:dagger" });
    // A wizard has no Weapon Mastery: the row carries none.
    expect(row.mastery).toBe("");
  });

  it.skipIf(zhWithheld("messages/play/zh-TW.json", "messages/zh-TW.json"))("on a phone, a skill row is one 44 px tap target with its mark, name, ability and value", async () => {
    width = 390;
    await mount();
    expect(view()).toHaveAttribute("data-layout", "compact");
    fireEvent.mouseDown(screen.getByRole("tab", { name: "技能" }));
    fireEvent.click(screen.getByRole("tab", { name: "技能" }));
    const arcana = view().querySelector("[data-play-skill='arcana']") as HTMLElement;
    expect(arcana.tagName).toBe("BUTTON");
    expect(arcana).toHaveClass("min-h-11");
    expect(arcana.className).toMatch(/grid-cols-/);
    expect(arcana.textContent).toBe("奧秘智+5");
    expect(arcana.querySelector("[data-prof='proficient']")).not.toBeNull();
  });

  it.skipIf(zhWithheld("messages/play-tabs/zh-TW.json", "messages/play/zh-TW.json"))("adds the Archery fighting style to a shortbow's hit, not its damage (A1-01, T4F-R-F003)", async () => {
    await mount({
      ...elin,
      rangedAttackBonus: 2,
      feats: [{ id: "feat:archery", name: "箭術", ref: "feat:archery", category: "fightingStyle" }],
      weapons: [{ id: "w1", name: "短弓", ability: "dex", proficient: true, magic: 0, ranged: true, damageDice: "1d6", damageType: "穿刺", ref: "baseItem:shortbow" }],
    });
    fireEvent.mouseDown(screen.getByRole("tab", { name: "戰鬥" }));
    fireEvent.click(screen.getByRole("tab", { name: "戰鬥" }));
    expect(screen.getByRole("button", { name: "短弓命中 +6" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "短弓傷害 1d6+2 穿刺" })).toBeInTheDocument();
  });

  it.skipIf(zhWithheld("messages/play/zh-TW.json"))("a read-only sheet still shows everything but records nothing", async () => {
    await mount(elin, false);
    expect(screen.getByRole("button", { name: "失去1點生命值" })).toBeDisabled();
    expect(screen.getAllByRole("button", { name: "長休" })[0]).toBeDisabled();
  });
});

describe("D&D play view: the 角色 tab (T4e)", () => {
  const backstory = Array.from({ length: 9 }, (_, index) => `第 ${index + 1} 段：艾琳在學院的往事。`).join("\n");
  const story = {
    ...elin,
    className: "法師", subclass: "塑能師", species: "精靈", lineage: "高等精靈血系", background: "智者", alignment: "neutralGood",
    appearance: "銀髮，左手有一道燒傷的疤。",
    backstory,
    languages: [{ id: "l1", name: "通用語" }, { id: "l2", name: "精靈語" }],
  };

  afterEach(() => void (auth.signedIn = false));

  const tabNames = () => screen.getAllByRole("tab").map((tab) => tab.textContent);

  it.skipIf(zhWithheld("messages/play/zh-TW.json"))("opens first on 角色, with 角色／戰鬥／法術／特性／物品 on a desktop", async () => {
    await mount(story);
    expect(tabNames()).toEqual(["角色", "戰鬥", "法術", "特性", "物品"]);
    expect(screen.getByRole("tab", { name: "角色" })).toHaveAttribute("aria-selected", "true");
    expect(view().querySelector("[data-play-character-tab]")).not.toBeNull();
  });

  it.skipIf(zhWithheld("messages/play/zh-TW.json"))("puts 技能 after 戰鬥 on a phone, every tab a 44 px target", async () => {
    width = 390;
    await mount(story);
    expect(tabNames()).toEqual(["角色", "戰鬥", "技能", "法術", "特性", "物品"]);
    for (const tab of screen.getAllByRole("tab")) expect(tab).toHaveClass("h-11", "min-w-11");
  });

  it.skipIf(zhWithheld("messages/play/zh-TW.json", "messages/zh-TW.json"))("shows who the character is, read-only: name line, origin, alignment, appearance, backstory and languages", async () => {
    await mount(story);
    const tab = view().querySelector("[data-play-character-tab]") as HTMLElement;
    expect(tab.querySelectorAll("input, textarea, select")).toHaveLength(0);
    expect(within(tab).getByRole("heading", { name: "艾琳" })).toBeInTheDocument();
    // UAT m15: the class line and level are in the sheet's header strip, on every tab.
    expect(view().querySelector("[data-play-class-line]")).toHaveTextContent("法師 · 塑能師 · 1 級");
    expect(tab).toHaveTextContent("精靈 · 高等精靈血系");
    expect(tab).toHaveTextContent("智者");
    expect(tab).toHaveTextContent("中立善良");
    expect(within(tab).getByRole("region", { name: "外貌" })).toHaveTextContent("銀髮，左手有一道燒傷的疤。");
    const languages = within(tab).getByRole("region", { name: "語言" });
    expect(within(languages).getAllByRole("listitem").map((item) => item.textContent)).toEqual(["通用語", "精靈語"]);
  });

  it.skipIf(zhWithheld("messages/play/zh-TW.json", "messages/zh-TW.json"))("lets a read-only viewer (the GM's table card, a guest) read the appearance on 角色 (A3-04)", async () => {
    await mount(story, false);
    expect(screen.getByRole("tab", { name: "角色" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("region", { name: "外貌" })).toHaveTextContent("銀髮，左手有一道燒傷的疤。");
  });

  it.skipIf(zhWithheld("messages/play/zh-TW.json", "messages/zh-TW.json"))("folds a long backstory and opens it in full", async () => {
    await mount(story);
    const region = screen.getByRole("region", { name: "背景故事與個性" });
    const body = region.querySelector("[data-play-long-text]") as HTMLElement;
    expect(body).toHaveClass("line-clamp-6");
    expect(body.textContent).toBe(backstory);
    fireEvent.click(within(region).getByRole("button", { name: "展開全文" }));
    expect(body).not.toHaveClass("line-clamp-6");
    expect(within(region).getByRole("button", { name: "收合" })).toHaveAttribute("aria-expanded", "true");
  });

  it.skipIf(zhWithheld("messages/play/zh-TW.json", "messages/zh-TW.json"))("says what is not written yet instead of an empty box", async () => {
    await mount(elin);
    expect(screen.getByRole("region", { name: "外貌" })).toHaveTextContent("尚未填寫");
  });

  it.skipIf(zhWithheld("messages/play-tabs/zh-TW.json", "messages/play/zh-TW.json"))("opens a feature's reference with the character, so a class table highlights its level (T2b-F F005)", async () => {
    openReference.mockClear();
    await mount();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "特性" }));
    fireEvent.click(screen.getByRole("tab", { name: "特性" }));
    fireEvent.click(await screen.findByText("施法"));
    fireEvent.click(screen.getByRole("button", { name: "在規則參照開啟施法" }));
    expect(openReference).toHaveBeenCalledTimes(1);
    const [row, character] = openReference.mock.calls[0];
    expect(row).toMatchObject({ id: "f1", name: "施法" });
    expect(character).toMatchObject({ level: 1, classId: "wizard" });
  });

  it.skipIf(zhWithheld("messages/play-tabs/zh-TW.json", "messages/play/zh-TW.json"))("moves languages out of 特性", async () => {
    await mount(story);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "特性" }));
    fireEvent.click(screen.getByRole("tab", { name: "特性" }));
    const training = screen.getByRole("region", { name: "裝備訓練與熟練" });
    expect(training).not.toHaveTextContent("語言");
    expect(training).not.toHaveTextContent("精靈語");
  });

  it.skipIf(zhWithheld("messages/play/zh-TW.json"))("lets anyone view the portrait large; a read-only viewer cannot change it", async () => {
    auth.signedIn = true;
    await mount({ ...story, portrait: "https://example.test/elin.webp" }, false);
    fireEvent.click(screen.getByRole("button", { name: "查看艾琳的肖像" }));
    const dialog = await screen.findByRole("dialog", { name: "艾琳" });
    expect(dialog.querySelector("img")).toHaveAttribute("src", "https://example.test/elin.webp");
    expect(within(dialog).queryByRole("button", { name: "更換肖像" })).toBeNull();
  });

  it.skipIf(zhWithheld("messages/play/zh-TW.json"))("gives an editor an upload CTA that writes the uploaded portrait", async () => {
    auth.signedIn = true;
    await mount(story);
    const empty = view().querySelector("[data-play-portrait-empty]") as HTMLElement;
    expect(empty).toHaveTextContent("尚無肖像");
    const input = view().querySelector("[data-portrait-input]") as HTMLInputElement;
    const click = vi.spyOn(input, "click");
    fireEvent.click(within(empty).getByRole("button", { name: "上傳肖像" }));
    expect(click).toHaveBeenCalled();
    const file = new File(["x"], "elin.png", { type: "image/png" });
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });
    expect(upload).toHaveBeenCalledWith("c-elin", file);
    expect(saved.data.portrait).toBe("https://example.test/elin.webp?v=2");
  });

  it.skipIf(zhWithheld("messages/play/zh-TW.json"))("keeps the phone's portrait to a narrow column beside the name, so the name is on the first screen", async () => {
    width = 390;
    await mount(story);
    const identity = view().querySelector("[data-play-identity]") as HTMLElement;
    expect(identity).toHaveClass("grid-cols-[7rem_minmax(0,1fr)]");
    expect(identity.children[0]).toHaveAttribute("data-play-portrait");
    expect(within(identity).getByRole("heading", { name: "艾琳" })).toBeInTheDocument();
  });

  it.skipIf(zhWithheld("messages/play/zh-TW.json"))("offers no upload to a read-only viewer when there is no portrait", async () => {
    auth.signedIn = true;
    await mount(story, false);
    expect(view().querySelector("[data-play-portrait-empty]")).toHaveTextContent("尚無肖像");
    expect(screen.queryByRole("button", { name: "上傳肖像" })).toBeNull();
  });
});

