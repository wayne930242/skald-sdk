import { useEffect, useState, type ReactNode } from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { zhWithheld } from "../../../__tests__/zh-withheld";
import { toast } from "sonner";
import type { Schema, Template } from "@skald/types/schema";
import type { LoadedSystem } from "@skald/types/system";
import appZh from "@skald/sheet-sdk/messages/zh-TW.json";
import systemZh from "@skald/system-dnd5e/data/dnd5e-2024/messages/zh-TW.json";
import schemaJson from "@skald/system-dnd5e/data/dnd5e-2024/schema.json";
import templateJson from "@skald/system-dnd5e/data/dnd5e-2024/template.json";
import weapons from "@skald/system-dnd5e/data/dnd5e-2024/game/weapons.json";
import { TemplateRenderer } from "@skald/sheet-sdk/modules/character/ui/renderer/template-renderer";
import { SystemPluginProvider } from "@skald/sheet-sdk/modules/systems/ui/system-plugin-provider";
import { useReferenceContext } from "../../use-reference-context";
import { DndPlayView } from "../play-view";
import { preloadPlayTabs } from "../lazy-tabs";
import { loadEditMessages } from "../edit-messages";
import { loadEconomyMessages } from "../../economy/economy-intl";

/** The 物品 tab's items and economy (plan-uat2 §3.3, §3.5; §5 W2). */

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), warning: vi.fn() }) }));

const schema = schemaJson as unknown as Schema;
const template = templateJson as unknown as Template;
const system = {
  config: { id: "dnd5e-2024", sheetComponent: "dnd5e" },
  schema,
  template,
  defaultData: {},
  mappings: {},
  gameData: { weapons },
} as unknown as LoadedSystem;

type Row = Record<string, unknown>;

/** A level 1 fighter as the wizard leaves it, derived values written in (no formula runtime here). */
const fighter: Row = {
  name: "布倫希爾", level: 1, classId: "fighter", weaponProficiencies: "簡易武器與軍用武器",
  str: 12, dex: 14, con: 14, int: 8, wis: 12, cha: 10,
  strMod: 1, dexMod: 2, conMod: 2, intMod: -1, wisMod: 1, chaMod: 0, profBonus: 2, ac: 13, speed: 30, size: "medium",
  armorLight: true, armorMedium: true, armorHeavy: false, armorShields: true,
  armorType: "medium", armorBase: 13, shield: false, gp: 20, sp: 5, cp: 0, ep: 0, pp: 0,
  equipment: [
    { id: "e1", qty: 1, name: "鎖子衫", ref: "baseItem:chain-shirt", equipped: true, origin: "srd" },
    { id: "e2", qty: 1, name: "板甲", ref: "baseItem:plate-armor", equipped: false, origin: "srd" },
    { id: "e3", qty: 1, name: "長劍", ref: "baseItem:longsword", equipped: false, origin: "srd" },
  ],
  weapons: [{ id: "w1", name: "長劍", ref: "baseItem:longsword", itemId: "e3", magic: 0, ability: "str", proficient: true }],
};

function Sheet({ initial, editable = true }: { initial: Row; editable?: boolean }) {
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
      characterId="c-fighter"
      playView={<DndPlayView system={system} reference={reference} openReference={vi.fn()} openCompendium={null} />}
    />
  );
}

const saved: { data: Row } = { data: {} };

async function mount(initial: Row, editable = true) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <NextIntlClientProvider locale="zh-TW" messages={{ ...appZh, ...systemZh }} timeZone="UTC">
      <SystemPluginProvider catalog={{}}>{children}</SystemPluginProvider>
    </NextIntlClientProvider>
  );
  await act(async () => {
    render(<Sheet initial={initial} editable={editable} />, { wrapper });
  });
  // A modal (the starting shop) hides the sheet from the accessibility tree.
  await screen.findByRole("tab", { name: "戰鬥", hidden: true });
}

async function openItems() {
  fireEvent.mouseDown(screen.getByRole("tab", { name: "物品" }));
  fireEvent.click(screen.getByRole("tab", { name: "物品" }));
  await screen.findByRole("button", { name: "商店" });
}

const equipment = () => saved.data.equipment as Row[];

beforeAll(() => Promise.all([preloadPlayTabs(), loadEditMessages("zh-TW"), loadEconomyMessages("zh-TW"), import("../shop-dialog"), import("../purse-dialog"), import("../item-config"), import("../magic-item-dialog")]));
beforeEach(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => ({ width: 1440, height: 800, top: 0, left: 0, right: 1440, bottom: 800, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect);
  vi.mocked(toast).mockClear();
  vi.mocked(toast.success).mockClear();
  vi.mocked(toast.warning).mockClear();
});
afterEach(() => vi.restoreAllMocks());

describe("starting shop (plan-uat2 §3.5, D1 = A)", () => {
  it.skipIf(zhWithheld("messages/economy/zh-TW.json", "messages/play/zh-TW.json", "messages/zh-TW.json"))("a new character opens on 物品 with the shop; a purchase spends, merges and links the attack, then clears the flag", async () => {
    await mount({ ...fighter, startingShop: true });
    const shop = await screen.findByRole("dialog", { name: "用初始錢幣購買裝備" });
    expect(screen.getByRole("tab", { name: "物品", selected: true, hidden: true })).toBeInTheDocument();
    fireEvent.click(within(shop).getByRole("button", { name: "武器" }));
    fireEvent.click(within(shop).getByRole("button", { name: "多買一個匕首" }));
    fireEvent.click(within(shop).getByRole("button", { name: "多買一個長劍" }));
    expect(within(shop).getByText("合計 17 金幣")).toBeInTheDocument();
    fireEvent.click(within(shop).getByRole("button", { name: "完成購買" }));
    expect(saved.data).toMatchObject({ startingShop: false, gp: 3, sp: 5 });
    // The unequipped longsword row takes one more; the dagger is a new row with its own attack.
    expect(equipment().find((row) => row.id === "e3")).toMatchObject({ qty: 2 });
    const dagger = equipment().find((row) => row.ref === "baseItem:dagger")!;
    expect(dagger).toMatchObject({ qty: 1, origin: "srd", equipped: false });
    expect((saved.data.weapons as Row[]).filter((attack) => attack.itemId === dagger.id)).toHaveLength(1);
    expect((saved.data.weapons as Row[]).filter((attack) => attack.itemId === "e3")).toHaveLength(1);
    // An item with its attack offers no second 「加為攻擊」.
    expect(screen.queryByRole("button", { name: "把匕首加為攻擊" })).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it.skipIf(zhWithheld("messages/economy/zh-TW.json", "messages/play/zh-TW.json"))("略過 clears the flag and buys nothing", async () => {
    await mount({ ...fighter, startingShop: true });
    const shop = await screen.findByRole("dialog", { name: "用初始錢幣購買裝備" });
    fireEvent.click(within(shop).getByRole("button", { name: "略過" }));
    expect(saved.data).toMatchObject({ startingShop: false, gp: 20 });
    expect(equipment()).toHaveLength(3);
  });

  it.skipIf(zhWithheld("messages/economy/zh-TW.json", "messages/play/zh-TW.json"))("an older character and a read-only sheet show no shop", async () => {
    await mount(fighter);
    expect(screen.getByRole("tab", { name: "角色", selected: true })).toBeInTheDocument();
    await openItems();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it.skipIf(zhWithheld("messages/economy/zh-TW.json", "messages/play/zh-TW.json"))("a read-only host never opens it", async () => {
    await mount({ ...fighter, startingShop: true }, false);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "物品" }));
    fireEvent.click(screen.getByRole("tab", { name: "物品" }));
    await screen.findByText(/^負重 /);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("button", { name: "商店" })).toBeNull();
    expect(screen.queryByRole("button", { name: "管理錢幣" })).toBeNull();
  });

  it.skipIf(zhWithheld("messages/economy/zh-TW.json", "messages/play/zh-TW.json", "messages/zh-TW.json"))("the shop refuses a cart the purse cannot pay", async () => {
    await mount(fighter);
    await openItems();
    fireEvent.click(screen.getByRole("button", { name: "商店" }));
    const shop = await screen.findByRole("dialog", { name: "商店" });
    fireEvent.change(within(shop).getByRole("textbox", { name: "搜尋物品" }), { target: { value: "板甲" } });
    fireEvent.click(within(shop).getByRole("button", { name: "多買一個板甲" }));
    expect(within(shop).getByText("・錢幣不足")).toBeInTheDocument();
    expect(within(shop).getByRole("button", { name: "購買" })).toBeDisabled();
  });
});

describe("equip slots, AC inputs and the Strength chip (plan-uat2 §3.3)", () => {
  it.skipIf(zhWithheld("messages/economy/zh-TW.json", "messages/play-tabs/zh-TW.json", "messages/play/zh-TW.json", "messages/zh-TW.json"))("equipping plate takes off the chain shirt and writes the AC inputs; Speed shows −10 with the chip", async () => {
    await mount(fighter);
    await openItems();
    fireEvent.click(screen.getByRole("switch", { name: "板甲：未裝備" }));
    expect(equipment().map((row) => row.equipped)).toEqual([false, true, false]);
    expect(saved.data).toMatchObject({ armorType: "heavy", armorBase: 18, armorStrReq: 15, armorStealth: true });
    expect(toast).toHaveBeenCalledWith("已換下鎖子衫");
    // B-024 Q7: the recalc notice replaced 「AC 已依裝備更新」 (no formula runtime here, so no notice)
    expect(toast.success).not.toHaveBeenCalledWith("AC 已依裝備更新");
    // No heavy armor training: a warning only.
    expect(toast.warning).toHaveBeenCalledWith(expect.stringContaining("未受此護甲訓練"));
    const speed = document.querySelector("[data-play-stat='speed']") as HTMLElement;
    expect(speed).toHaveTextContent("20呎");
    expect(speed).toHaveTextContent("力量不足 −10");
    expect(document.querySelector("[data-play-skill='stealth']")).toHaveTextContent("劣勢（護甲）");
  });
});

describe("item settings and magic items (plan-uat2 §3.3, B-019)", () => {
  it.skipIf(zhWithheld("messages/economy/zh-TW.json", "messages/play/zh-TW.json", "messages/zh-TW.json"))("a +1 and a new name reach the attack made from the item, not other attacks", async () => {
    await mount({ ...fighter, weapons: [...(fighter.weapons as Row[]), { id: "w2", name: "長劍", ref: "baseItem:longsword", magic: 0 }] });
    await openItems();
    fireEvent.click(screen.getByRole("button", { name: "設定長劍" }));
    const dialog = await screen.findByRole("dialog", { name: "設定長劍" });
    fireEvent.change(within(dialog).getByLabelText("名稱"), { target: { value: "黎明之刃" } });
    fireEvent.change(within(dialog).getByLabelText("魔法加值（+N）"), { target: { value: "1" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "儲存" }));
    expect(equipment()[2]).toMatchObject({ name: "黎明之刃", bonus: 1, origin: "custom", ref: "baseItem:longsword" });
    expect(saved.data.weapons).toEqual([
      expect.objectContaining({ id: "w1", name: "黎明之刃", magic: 1 }),
      expect.objectContaining({ id: "w2", name: "長劍", magic: 0 }),
    ]);
    expect(document.querySelector("[data-play-equipment='e3'] [data-item-bonus]")).toHaveTextContent("+1");
  });

  it.skipIf(zhWithheld("messages/economy/zh-TW.json", "messages/play/zh-TW.json", "messages/zh-TW.json"))("同調 takes a free slot and refuses a fourth item", async () => {
    await mount({ ...fighter, attunement1: "甲", attunement2: "乙", attunement3: "丙" });
    await openItems();
    fireEvent.click(screen.getByRole("button", { name: "設定長劍" }));
    const dialog = await screen.findByRole("dialog", { name: "設定長劍" });
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "需要同調" }));
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "同調中" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "儲存" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent("最多同調三件");
  });

  it.skipIf(zhWithheld("messages/economy/zh-TW.json", "messages/play/zh-TW.json"))("新增魔法物品 → 魔法護甲: +1 plate keeps the base ref and its +N", async () => {
    await mount(fighter);
    await openItems();
    fireEvent.click(screen.getByRole("button", { name: "新增魔法物品" }));
    const dialog = await screen.findByRole("dialog", { name: "新增魔法物品" });
    fireEvent.mouseDown(within(dialog).getByRole("tab", { name: "魔法護甲" }));
    fireEvent.click(within(dialog).getByRole("tab", { name: "魔法護甲" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "新增" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent("請填寫名稱");
    fireEvent.change(within(dialog).getByLabelText("名稱"), { target: { value: "矮人板甲" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "新增" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent("請選擇基礎物品");
  });
});

describe("coin purse and carried weight (plan-uat2 §3.5, SRD p.89, p.178)", () => {
  it.skipIf(zhWithheld("messages/economy/zh-TW.json", "messages/play/zh-TW.json"))("spends with change and converts at SRD rates; 復原 puts the purse back", async () => {
    await mount(fighter);
    await openItems();
    fireEvent.click(screen.getByRole("button", { name: "管理錢幣" }));
    const purse = await screen.findByRole("dialog", { name: "錢袋" });
    expect(purse).toHaveTextContent("約 20.5 金幣");
    fireEvent.mouseDown(within(purse).getByRole("tab", { name: "花費" }));
    fireEvent.click(within(purse).getByRole("tab", { name: "花費" }));
    fireEvent.change(within(purse).getByLabelText("金額"), { target: { value: "3" } });
    fireEvent.click(within(purse).getByRole("button", { name: "花費" }));
    expect(saved.data).toMatchObject({ gp: 17, sp: 5 });
    fireEvent.change(within(purse).getByLabelText("金額"), { target: { value: "30" } });
    fireEvent.click(within(purse).getByRole("button", { name: "花費" }));
    expect(within(purse).getByRole("alert")).toHaveTextContent("錢幣不足");
    fireEvent.mouseDown(within(purse).getByRole("tab", { name: "兌換" }));
    fireEvent.click(within(purse).getByRole("tab", { name: "兌換" }));
    fireEvent.change(within(purse).getByLabelText("枚數"), { target: { value: "2" } });
    fireEvent.click(within(purse).getByRole("button", { name: "兌換" }));
    expect(saved.data).toMatchObject({ gp: 15, sp: 25 });
    const [, options] = vi.mocked(toast.success).mock.calls.at(-1) as unknown as [string, { action: { onClick: () => void } }];
    act(() => options.action.onClick());
    expect(saved.data).toMatchObject({ gp: 17, sp: 5 });
  });

  it.skipIf(zhWithheld("messages/economy/zh-TW.json", "messages/play/zh-TW.json"))("shows the carried weight and warns over capacity, never changing Speed", async () => {
    await mount({ ...fighter, str: 8, strMod: -1, equipment: [...(fighter.equipment as Row[]), { id: "e4", qty: 1, ref: "item:explorers-pack", origin: "srd" }] });
    await openItems();
    const footer = document.querySelector("[data-carry-status]") as HTMLElement;
    // 20 + 65 + 3 + 55 lb of gear and 25 coins (0.5 lb) against Str 8 × 15 = 120.
    expect(footer).toHaveTextContent("負重 143.5 / 120 磅（拖舉推上限 240 磅）");
    expect(footer).toHaveAttribute("data-carry-status", "over");
    expect(footer).toHaveTextContent("超過負重：只拖、舉、推，速度最多 5 呎");
    expect(document.querySelector("[data-play-stat='speed']")).toHaveTextContent("30呎");
  });
});
