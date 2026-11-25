import { useEffect, useState, type ReactNode } from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
import classes from "@skald/system-dnd5e/data/dnd5e-2024/game/classes.json";
import languages from "@skald/system-dnd5e/data/dnd5e-2024/game/languages.json";
import { TemplateRenderer } from "@skald/sheet-sdk/modules/character/ui/renderer/template-renderer";
import { SystemPluginProvider } from "@skald/sheet-sdk/modules/systems/ui/system-plugin-provider";
import { HostPortsProvider, bindHostPort } from "@skald/sheet-sdk/modules/systems/ui/host-ports";
import { dndHomebrewStorePort, type DndHomebrewStore } from "../../../homebrew/store-port";
import { createMemoryHomebrewStore } from "../../../homebrew/testing/memory-store";
import type { EffectivePacks } from "../../../content-pack/domain/types";
import { mergePacks } from "../../../content-pack/domain/merge-packs";
import { useReferenceContext } from "../../use-reference-context";
import { buildCustomRow, formFields, removeRow, restoreRow } from "../../custom-rows";
import { rowDefaults } from "../../compendium-rows";
import { DndPlayView } from "../play-view";
import { preloadPlayTabs } from "../lazy-tabs";
import { loadEditMessages } from "../edit-messages";
import { loadEconomyMessages } from "../../economy/economy-intl";

/** plan-uat2 §3.2–§3.4: adding and changing rows in play. */

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

const schema = schemaJson as unknown as Schema;
const template = templateJson as unknown as Template;
const system = {
  config: { id: "dnd5e-2024", sheetComponent: "dnd5e" },
  schema,
  template,
  defaultData: {},
  mappings: {},
  gameData: { weapons, classes, languages },
} as unknown as LoadedSystem;

const fighter: Record<string, unknown> = {
  name: "布蘭", level: 3, classId: "fighter", str: 16, dex: 12, strMod: 3, dexMod: 1, profBonus: 2,
  hpMax: 28, hitDieFaces: 10, hitDiceMax: 3, spellAbility: "int", slot1Total: 2,
  features: [
    { id: "f1", name: "回氣", ref: "", origin: "custom", text: "一個附贈動作恢復生命值。" },
    { id: "f2", name: "動作如潮", ref: "", origin: "custom", text: "多一個動作。" },
    { id: "f3", name: "戰鬥風格", ref: "", origin: "custom", text: "選一種戰鬥風格。" },
  ],
  speciesTraits: [],
  feats: [{ id: "t1", name: "警覺", ref: "feat:alert", origin: "pack", text: "包內的警覺全文。" }],
  spells: [
    { id: "s1", level: 1, name: "護盾術", ref: "", origin: "custom", prepared: false, source: "class" },
    { id: "s2", level: 1, name: "魔法飛彈", ref: "", origin: "custom", prepared: true, source: "class" },
  ],
  weapons: [],
  languages: [{ id: "l1", name: "通用語", ref: "language:common", origin: "srd" }],
  toolProficiencies: [],
  equipment: [],
};

const openReference = vi.fn();
const openCompendium = vi.fn();
const saved: { data: Record<string, unknown> } = { data: {} };

function Sheet({ initial, editable, packs }: { initial: Record<string, unknown>; editable: boolean; packs?: EffectivePacks }) {
  const [data, setData] = useState(initial);
  useEffect(() => {
    saved.data = data;
  });
  const reference = useReferenceContext(system, packs);
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
      characterId="c-bran"
      playView={<DndPlayView system={system} reference={reference} openReference={openReference} openCompendium={openCompendium} />}
    />
  );
}

let width = 1440;
async function mount(initial = fighter, editable = true, packs?: EffectivePacks, store?: DndHomebrewStore) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <NextIntlClientProvider locale="zh-TW" messages={{ ...appZh, ...systemZh }} timeZone="UTC">
      <SystemPluginProvider catalog={{}}><HostPortsProvider ports={store ? [bindHostPort(dndHomebrewStorePort, store)] : []}>{children}</HostPortsProvider></SystemPluginProvider>
    </NextIntlClientProvider>
  );
  await act(async () => {
    render(<Sheet initial={initial} editable={editable} packs={packs} />, { wrapper });
  });
  await screen.findByRole("tab", { name: "戰鬥" });
}

async function openTab(name: string) {
  fireEvent.mouseDown(screen.getByRole("tab", { name }));
  await act(async () => {
    fireEvent.click(screen.getByRole("tab", { name }));
  });
}

async function openMenu(name: string) {
  const trigger = screen.getByRole("button", { name: `${name}的選項` });
  await act(async () => {
    fireEvent.keyDown(trigger, { key: "Enter" });
  });
  return screen.findByRole("menu");
}

beforeAll(() => {
  // Radix Select measures its trigger.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  return Promise.all([preloadPlayTabs(), loadEditMessages("zh-TW"), loadEconomyMessages("zh-TW")]);
});
beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => ({ width, height: 800, top: 0, left: 0, right: width, bottom: 800, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect);
  openCompendium.mockClear();
  vi.mocked(toast).mockClear();
});
afterEach(() => {
  vi.restoreAllMocks();
  width = 1440;
});

const view = () => document.querySelector("[data-dnd-play-view]") as HTMLElement;
const lastStart = () => openCompendium.mock.calls.at(-1)?.[2];

describe("＋ 新增 opens the library on the calling list (plan-uat2 §3.2)", () => {
  it.skipIf(zhWithheld("messages/edit/zh-TW.json", "messages/play/zh-TW.json"))("法術: the spells tab, with the character's class", async () => {
    await mount();
    await openTab("法術");
    fireEvent.click(screen.getByRole("button", { name: "新增法術" }));
    expect(lastStart()).toEqual({ tab: "spells", classId: "fighter" });
  });

  it.skipIf(zhWithheld("messages/edit/zh-TW.json", "messages/play/zh-TW.json", "messages/zh-TW.json"))("職業特性: the features tab, with the character's class", async () => {
    await mount();
    await openTab("特性");
    fireEvent.click(screen.getByRole("button", { name: "新增職業特性" }));
    expect(lastStart()).toEqual({ tab: "features", classId: "fighter" });
  });

  it.skipIf(zhWithheld("messages/edit/zh-TW.json", "messages/play/zh-TW.json", "messages/zh-TW.json"))("專長: the feats tab", async () => {
    await mount();
    await openTab("特性");
    fireEvent.click(screen.getByRole("button", { name: "新增專長" }));
    expect(lastStart()).toEqual({ tab: "feats" });
  });

  it.skipIf(zhWithheld("messages/play-tabs/zh-TW.json", "messages/play/zh-TW.json"))("裝備: the equipment tab", async () => {
    await mount();
    await openTab("物品");
    fireEvent.click(screen.getByRole("button", { name: "從資料庫加入" }));
    expect(lastStart()).toEqual({ tab: "equipment" });
  });

  it.skipIf(zhWithheld("messages/edit/zh-TW.json", "messages/play-tabs/zh-TW.json", "messages/play/zh-TW.json"))("戰鬥: weapons, adding attacks; the empty table says so and offers it", async () => {
    await mount();
    await openTab("戰鬥");
    expect(view().querySelector("[data-play-attacks]")).toHaveTextContent("尚無攻擊。");
    fireEvent.click(screen.getByRole("button", { name: "新增攻擊" }));
    expect(lastStart()).toEqual({ tab: "equipment", category: "weapon", intent: "attack" });
  });
});

describe("custom entries", () => {
  it.skipIf(zhWithheld("messages/edit/zh-TW.json", "messages/play/zh-TW.json"))("does not offer save as homebrew without the store", async () => {
    await mount();
    await openTab("法術");
    expect(within(await openMenu("護盾術")).queryByRole("menuitem", { name: "存成自製" })).toBeNull();
  });

  it.skipIf(zhWithheld("messages/edit/zh-TW.json", "messages/play/zh-TW.json", "messages/zh-TW.json"))("can add a custom feat and save it to the account in one step", async () => {
    const store = createMemoryHomebrewStore();
    await mount(fighter, true, undefined, store);
    await openTab("特性");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "找不到？自訂一筆專長" })); });
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("名稱"), { target: { value: "Steady footing" } });
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "同時存進我的自製內容" }));
    await act(async () => { fireEvent.click(within(dialog).getByRole("button", { name: "加入" })); });
    await waitFor(() => expect(store.snapshot().items).toMatchObject([{ kind: "feat", key: "steady-footing" }]));
    expect((saved.data.feats as object[]).at(-1)).toMatchObject({ ref: "feat:steady-footing", homebrewRev: 1, origin: "custom" });
  });

  it.skipIf(zhWithheld("messages/edit/zh-TW.json", "messages/play/zh-TW.json"))("saves a custom spell and links its existing sheet row to the stored item", async () => {
    const store = createMemoryHomebrewStore();
    await mount({ ...fighter, spells: [{ id: "s", name: "Ember", origin: "custom", text: "A spark.", level: 1, castingTime: "At dawn", range: "A valley" }] }, true, undefined, store);
    await openTab("法術");
    const menu = await openMenu("Ember");
    await act(async () => { fireEvent.click(within(menu).getByRole("menuitem", { name: "存成自製" })); });
    await waitFor(() => expect(store.snapshot().items).toHaveLength(1));
    const [item] = store.snapshot().items;
    expect(item.payload).toMatchObject({ entry: { name: "Ember", entries: ["A spark."] }, wizard: { spells: [{ level: 1, w: { castingTime: "At dawn", range: "A valley" } }] } });
    expect(saved.data.spells).toMatchObject([{ id: "s", ref: "spell:ember", origin: "custom", homebrewItem: item.id, homebrewRev: item.revision }]);
  });

  it.skipIf(zhWithheld("messages/edit/zh-TW.json", "messages/play/zh-TW.json"))("updates only on request and only once per revision", async () => {
    const ref = "spell:ember";
    const packs = mergePacks([{ key: "homebrew/p", pack: { entries: [{ kind: "spell", id: "ember", ref, name: "Ember", entries: ["New body"], meta: {} }], wizard: { spells: [{ id: "ember", ref, origin: "pack", level: 2, w: { range: "new range" } }] }, zhTW: {}, overlays: {} } }])!;
    packs.homebrew = { [ref]: { pack: "p", item: "i", rev: 2 } };
    const row = { id: "s", name: "Ember", ref, origin: "custom", level: 1, text: "Old body", playerText: "My text", homebrewPack: "p", homebrewItem: "i", homebrewRev: 1 };
    await mount({ ...fighter, spells: [row] }, true, packs, createMemoryHomebrewStore());
    await openTab("法術");
    expect(screen.getByText("自製")).toBeVisible();
    const menu = await openMenu("Ember");
    expect(saved.data.spells).toEqual([row]);
    await act(async () => { fireEvent.click(within(menu).getByRole("menuitem", { name: "更新為最新版" })); });
    expect(saved.data.spells).toMatchObject([{ text: "New body", playerText: "My text", level: 2, range: "new range", homebrewRev: 2 }]);
    expect(within(await openMenu("Ember")).queryByRole("menuitem", { name: "更新為最新版" })).toBeNull();
  });
  it("a custom row is the list's template defaults plus the form's values and origin custom", () => {
    const row = buildCustomRow(schema, "features", { name: "家傳劍術", level: 2, text: "自訂。", origin: "srd", ref: "x" });
    const { id, ...rest } = row;
    expect(id).toMatch(/^feature_/);
    const list = schema.fields.features as Parameters<typeof rowDefaults>[0];
    expect(rest).toEqual({ ...rowDefaults(list), name: "家傳劍術", level: 2, text: "自訂。", origin: "custom" });
  });

  it("each form mirrors its list's rowTemplate", () => {
    expect(formFields(schema, "spells").map((field) => field.id)).toEqual(["name", "level", "castingTime", "range", "concentration", "ritual", "material", "source", "notes", "text"]);
    expect(formFields(schema, "weapons").map((field) => field.id)).toEqual(["name", "ability", "proficient", "magic", "ranged", "damageDice", "damageType", "mastery", "notes"]);
    expect(formFields(schema, "feats").map((field) => field.id)).toEqual(["name", "category", "text"]);
  });

  it.skipIf(zhWithheld("messages/edit/zh-TW.json", "messages/play/zh-TW.json", "messages/zh-TW.json"))("「找不到？自訂一筆職業特性」 adds a custom feature from the form", async () => {
    await mount();
    await openTab("特性");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "找不到？自訂一筆職業特性" }));
    });
    const dialog = await screen.findByRole("dialog", { name: "自訂職業特性" });
    fireEvent.click(within(dialog).getByRole("button", { name: "加入" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent("請填寫名稱。");
    fireEvent.change(within(dialog).getByLabelText("名稱"), { target: { value: "家傳劍術" } });
    fireEvent.change(within(dialog).getByLabelText("等級"), { target: { value: "2" } });
    fireEvent.change(within(dialog).getByLabelText("內容"), { target: { value: "祖傳的劍法。" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "加入" }));
    const added = (saved.data.features as Array<Record<string, unknown>>).at(-1);
    expect(added).toMatchObject({ name: "家傳劍術", level: 2, text: "祖傳的劍法。", origin: "custom", ref: "" });
    expect(screen.getByText("家傳劍術")).toBeInTheDocument();
  });

  it.skipIf(zhWithheld("messages/edit/zh-TW.json", "messages/play/zh-TW.json", "messages/zh-TW.json"))("a number typed and then cleared stays blank: a new feature without a level, an edited one loses its level", async () => {
    await mount({ ...fighter, features: [{ id: "f1", name: "回氣", ref: "", origin: "custom", text: "", level: 3 }] });
    await openTab("特性");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "找不到？自訂一筆職業特性" }));
    });
    const dialog = await screen.findByRole("dialog", { name: "自訂職業特性" });
    fireEvent.change(within(dialog).getByLabelText("名稱"), { target: { value: "家傳劍術" } });
    fireEvent.change(within(dialog).getByLabelText("等級"), { target: { value: "2" } });
    fireEvent.change(within(dialog).getByLabelText("等級"), { target: { value: "" } });
    expect(within(dialog).getByLabelText("等級")).toHaveValue(null);
    fireEvent.click(within(dialog).getByRole("button", { name: "加入" }));
    const added = (saved.data.features as Array<Record<string, unknown>>).at(-1)!;
    expect(added.name).toBe("家傳劍術");
    expect(added.level).toBeUndefined();

    const menu = await openMenu("回氣");
    await act(async () => {
      fireEvent.click(within(menu).getByRole("menuitem", { name: "編輯欄位" }));
    });
    const edit = await screen.findByRole("dialog", { name: "編輯回氣" });
    fireEvent.change(within(edit).getByLabelText("等級"), { target: { value: "" } });
    fireEvent.click(within(edit).getByRole("button", { name: "儲存" }));
    expect((saved.data.features as Array<Record<string, unknown>>)[0].level).toBeUndefined();
  });

  it.skipIf(zhWithheld("messages/edit/zh-TW.json", "messages/play/zh-TW.json", "messages/zh-TW.json"))("species traits open the form directly", async () => {
    await mount();
    await openTab("特性");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "新增種族特性" }));
    });
    const dialog = await screen.findByRole("dialog", { name: "自訂種族特性" });
    fireEvent.change(within(dialog).getByLabelText("名稱"), { target: { value: "夜眼" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "加入" }));
    expect(saved.data.speciesTraits).toEqual([expect.objectContaining({ name: "夜眼", origin: "custom" })]);
    expect(openCompendium).not.toHaveBeenCalled();
  });

  it.skipIf(zhWithheld("messages/edit/zh-TW.json", "messages/play-tabs/zh-TW.json", "messages/play/zh-TW.json", "messages/zh-TW.json"))("a custom attack rolls from its own fields", async () => {
    await mount();
    await openTab("戰鬥");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "找不到？自訂一筆攻擊" }));
    });
    const dialog = await screen.findByRole("dialog", { name: "自訂攻擊" });
    fireEvent.change(within(dialog).getByLabelText("名稱"), { target: { value: "家傳長劍" } });
    fireEvent.change(within(dialog).getByLabelText("魔法"), { target: { value: "1" } });
    fireEvent.change(within(dialog).getByLabelText("傷害骰"), { target: { value: "1d8" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "加入" }));
    expect(saved.data.weapons).toEqual([expect.objectContaining({ name: "家傳長劍", ability: "str", proficient: true, magic: 1, damageDice: "1d8", origin: "custom" })]);
    // STR +3, proficiency +2, magic +1.
    expect(screen.getByRole("button", { name: "家傳長劍命中 +6" })).toBeInTheDocument();
  });
});

describe("the row ⋯ menu", () => {
  it.skipIf(zhWithheld("messages/edit/zh-TW.json", "messages/play/zh-TW.json"))("編輯文字 on an attack shows the saved text on the attack row", async () => {
    await mount({ ...fighter, weapons: [{ id: "w1", name: "長劍", ref: "item:longsword", origin: "srd", ability: "str", proficient: true, damageDice: "1d8", playerText: "" }] });
    await openTab("戰鬥");
    const menu = await openMenu("長劍");
    await act(async () => {
      fireEvent.click(within(menu).getByRole("menuitem", { name: "編輯文字" }));
    });
    const dialog = await screen.findByRole("dialog", { name: "編輯長劍的文字" });
    fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: "家傳，劍柄刻著家徽。" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "儲存" }));
    expect((saved.data.weapons as Array<Record<string, unknown>>)[0]).toMatchObject({ playerText: "家傳，劍柄刻著家徽。" });
    expect(view().querySelector("[data-play-weapon] [data-play-weapon-text]")).toHaveTextContent("家傳，劍柄刻著家徽。");
  });

  it.skipIf(zhWithheld("messages/edit/zh-TW.json", "messages/play/zh-TW.json"))("delete removes at once; 復原 restores the row at its index", async () => {
    await mount();
    await openTab("特性");
    const menu = await openMenu("動作如潮");
    await act(async () => {
      fireEvent.click(within(menu).getByRole("menuitem", { name: "刪除" }));
    });
    expect((saved.data.features as Array<{ id: string }>).map((row) => row.id)).toEqual(["f1", "f3"]);
    const [message, options] = vi.mocked(toast).mock.calls.at(-1) as [string, { action: { label: string; onClick: () => void } }];
    expect(message).toBe("已刪除動作如潮");
    expect(options.action.label).toBe("復原");
    await act(async () => options.action.onClick());
    expect((saved.data.features as Array<{ id: string }>).map((row) => row.id)).toEqual(["f1", "f2", "f3"]);
  });

  it("undo puts a row back at its index, or at the end when the list has shrunk", () => {
    const data = { features: [{ id: "a" }, { id: "b" }, { id: "c" }] };
    const { data: after, removed } = removeRow(data, "features", 1);
    expect(restoreRow(after, removed!).features).toEqual(data.features);
    expect(restoreRow({ features: [] }, removed!).features).toEqual([{ id: "b" }]);
    // A second undo does not add it twice.
    expect(restoreRow(restoreRow(after, removed!), removed!).features).toHaveLength(3);
  });

  it.skipIf(zhWithheld("messages/edit/zh-TW.json", "messages/play/zh-TW.json", "messages/zh-TW.json"))("edits a custom row's fields", async () => {
    await mount();
    await openTab("特性");
    const menu = await openMenu("回氣");
    await act(async () => {
      fireEvent.click(within(menu).getByRole("menuitem", { name: "編輯欄位" }));
    });
    const dialog = await screen.findByRole("dialog", { name: "編輯回氣" });
    fireEvent.change(within(dialog).getByLabelText("名稱"), { target: { value: "回氣（改）" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "儲存" }));
    expect((saved.data.features as Array<Record<string, unknown>>)[0]).toMatchObject({ id: "f1", name: "回氣（改）", text: "一個附贈動作恢復生命值。", origin: "custom" });
  });

  it.skipIf(zhWithheld("messages/edit/zh-TW.json", "messages/play/zh-TW.json"))("offers no field edit for a pack row in play", async () => {
    await mount();
    await openTab("特性");
    const menu = await openMenu("警覺");
    expect(within(menu).queryByRole("menuitem", { name: "編輯欄位" })).toBeNull();
    expect(within(menu).getByRole("menuitem", { name: "編輯文字" })).toBeInTheDocument();
  });

  it.skipIf(zhWithheld("messages/edit/zh-TW.json", "messages/play/zh-TW.json"))("edits a pack row's text into playerText, starting empty beside the pack text, and 還原 clears it", async () => {
    await mount();
    await openTab("特性");
    const menu = await openMenu("警覺");
    await act(async () => {
      fireEvent.click(within(menu).getByRole("menuitem", { name: "編輯文字" }));
    });
    const dialog = await screen.findByRole("dialog", { name: "編輯警覺的文字" });
    const box = within(dialog).getByRole("textbox", { name: "編輯警覺的文字" });
    expect(box).toHaveValue("");
    expect(dialog.querySelector("[data-text-beside]")).toHaveTextContent("包內的警覺全文。");
    fireEvent.change(box, { target: { value: "先攻＋熟練加值。" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "儲存" }));
    const feat = (saved.data.feats as Array<Record<string, unknown>>)[0];
    expect(feat).toMatchObject({ playerText: "先攻＋熟練加值。", text: "包內的警覺全文。" });
    expect(view().querySelector("[data-play-rule='t1'] [data-play-summary]")).toHaveTextContent("先攻＋熟練加值。");

    const again = await openMenu("警覺");
    await act(async () => {
      fireEvent.click(within(again).getByRole("menuitem", { name: "編輯文字" }));
    });
    const second = await screen.findByRole("dialog", { name: "編輯警覺的文字" });
    fireEvent.click(within(second).getByRole("button", { name: "還原" }));
    expect((saved.data.feats as Array<Record<string, unknown>>)[0]).toMatchObject({ playerText: "", text: "包內的警覺全文。" });
  });
});

describe("spells", () => {
  it.skipIf(zhWithheld("messages/edit/zh-TW.json", "messages/play/zh-TW.json", "messages/zh-TW.json"))("編輯欄位 edits a spell's source and notes, and the row shows the notes", async () => {
    await mount();
    await openTab("法術");
    const menu = await openMenu("護盾術");
    await act(async () => {
      fireEvent.click(within(menu).getByRole("menuitem", { name: "編輯欄位" }));
    });
    const dialog = await screen.findByRole("dialog", { name: "編輯護盾術" });
    expect(within(dialog).getByRole("combobox", { name: "來源" })).toHaveTextContent("職業");
    fireEvent.change(within(dialog).getByLabelText("備註"), { target: { value: "戒指給的。" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "儲存" }));
    expect((saved.data.spells as Array<Record<string, unknown>>)[0]).toMatchObject({ id: "s1", notes: "戒指給的。", source: "class" });
    expect(view().querySelector("[data-play-spell='護盾術'] [data-play-spell-notes]")).toHaveTextContent("戒指給的。");
  });

  it.skipIf(zhWithheld("messages/edit/zh-TW.json", "messages/play/zh-TW.json"))("the 準備 toggle prepares a spell and the prepared counter follows it", async () => {
    await mount();
    await openTab("法術");
    const counter = () => view().querySelector("[data-play-stat='prepared']")!.textContent;
    expect(counter()).toContain("1");
    // One name in both states; the state is aria-pressed, read once (not 「取消準備…, on」).
    const toggle = screen.getByRole("button", { name: "準備護盾術" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(toggle);
    expect((saved.data.spells as Array<Record<string, unknown>>)[0].prepared).toBe(true);
    expect(counter()).toContain("2");
    expect(screen.getByRole("button", { name: "準備護盾術" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "準備護盾術" }));
    expect(counter()).toContain("1");
  });
});

describe("the 角色 tab", () => {
  it.skipIf(zhWithheld("messages/edit/zh-TW.json", "messages/play/zh-TW.json", "messages/zh-TW.json"))("✎ edits the appearance in place", async () => {
    await mount();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "編輯 外貌" }));
    });
    const box = await screen.findByRole("textbox", { name: "外貌" });
    fireEvent.change(box, { target: { value: "紅髮，臉上有疤。" } });
    fireEvent.click(within(screen.getByRole("region", { name: "外貌" })).getByRole("button", { name: "儲存" }));
    expect(saved.data.appearance).toBe("紅髮，臉上有疤。");
    expect(screen.getByRole("region", { name: "外貌" })).toHaveTextContent("紅髮，臉上有疤。");
  });

  it.skipIf(zhWithheld("messages/edit/zh-TW.json", "messages/play/zh-TW.json", "messages/zh-TW.json"))("✎ gets the focus back when its editor closes, on 儲存 and on 取消", async () => {
    await mount();
    for (const close of ["儲存", "取消"]) {
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "編輯 外貌" }));
      });
      await screen.findByRole("textbox", { name: "外貌" });
      await act(async () => {
        fireEvent.click(within(screen.getByRole("region", { name: "外貌" })).getByRole("button", { name: close }));
      });
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "編輯 外貌" }));
    }
  });

  it.skipIf(zhWithheld("messages/play/zh-TW.json", "messages/zh-TW.json"))("shows the notes, editable in play", async () => {
    await mount({ ...fighter, notes: "欠酒館老闆 3 金幣。" });
    expect(screen.getByRole("region", { name: "筆記" })).toHaveTextContent("欠酒館老闆 3 金幣。");
    expect(screen.getByRole("button", { name: "編輯 筆記" })).toBeInTheDocument();
  });

  it.skipIf(zhWithheld("messages/edit/zh-TW.json", "messages/play/zh-TW.json", "messages/zh-TW.json"))("languages: ✎ gives each chip × and ＋ offers the SRD languages", async () => {
    await mount();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "編輯 語言" }));
    });
    const region = screen.getByRole("region", { name: "語言" });
    await act(async () => {
      fireEvent.click(await within(region).findByRole("button", { name: "新增語言" }));
    });
    const dialog = await screen.findByRole("dialog", { name: "自訂語言" });
    expect(dialog.querySelector("[data-chip='language:common']")).toBeNull();
    fireEvent.click(dialog.querySelector("[data-chip='language:elvish']") as HTMLElement);
    expect(saved.data.languages).toEqual([
      expect.objectContaining({ ref: "language:common" }),
      expect.objectContaining({ ref: "language:elvish", origin: "srd", text: "" }),
    ]);
    fireEvent.click(within(region).getByRole("button", { name: "移除通用語" }));
    await waitFor(() => expect((saved.data.languages as unknown[]).length).toBe(1));
  });
});

describe("a read-only host", () => {
  it.skipIf(zhWithheld("messages/play/zh-TW.json"))("renders no new control", async () => {
    await mount(fighter, false);
    for (const tab of ["角色", "戰鬥", "法術", "特性"]) {
      await openTab(tab);
      expect(view().querySelectorAll("[data-add-list], [data-custom-link], [data-row-menu], [data-prepare-toggle]")).toHaveLength(0);
    }
    await openTab("角色");
    expect(screen.queryByRole("button", { name: /^編輯 / })).toBeNull();
  });
});
