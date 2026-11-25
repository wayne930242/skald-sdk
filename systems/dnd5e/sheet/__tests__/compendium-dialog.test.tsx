import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { zhWithheld } from "../../__tests__/zh-withheld";
import type { LoadedSystem } from "@skald/types/system";
import appZh from "@skald/sheet-sdk/messages/zh-TW.json";
import systemZh from "@skald/system-dnd5e/data/dnd5e-2024/messages/zh-TW.json";
import weapons from "@skald/system-dnd5e/data/dnd5e-2024/game/weapons.json";
import feats from "@skald/system-dnd5e/data/dnd5e-2024/game/feats.json";
import { CompendiumDialog } from "../compendium-dialog";
import type { ReferenceContextValue } from "../use-reference-context";

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock("../../reference/load-corpus", async () => ({
  // The reference labels ride the lazy catalog (plan T2b §5.10).
  loadReferenceMessages: async () => (await import("@skald/system-dnd5e/data/dnd5e-2024/messages/reference/zh-TW.json")).default,
  loadEnglishCorpus: async (part: string) =>
    part === "baseItem"
      ? { "baseItem:dagger": { meta: { type: "M" } }, "baseItem:chain-mail": { meta: { type: "HA" } } }
      : { "item:elephant": { meta: { type: "MNT" } }, "item:airship": { meta: { type: "AIR|XPHB" } }, "item:rope": { meta: { type: "G" } } },
}));
vi.mock("../play/edit-messages", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../play/edit-messages")>()),
  loadEditMessages: async () => ({ edit: {}, play: { damageType: { P: "穿刺" } } }),
}));

const ash = "paladin/oath-of-ash";
const devotion = "paladin/oath-of-devotion";
const ward = `subclassFeature:${ash}/ash-ward-l7`;
const names = {
  class: { paladin: "聖騎士" },
  subclass: { [ash]: "灰燼之誓", [devotion]: "奉獻之誓" },
  subclassFeature: { [`${ash}/ash-ward-l7`]: "Ash Ward", [`${devotion}/oath-of-devotion-l3`]: "Oath of Devotion" },
  baseItem: { dagger: "匕首", "chain-mail": "鏈甲" },
  item: { elephant: "大象", airship: "飛空艇", rope: "繩索" },
  feat: { alert: "警覺", archery: "箭術", "boon-of-combat-prowess": "戰鬥神威恩賜" },
};
const context = {
  locale: "zh-TW",
  names,
  englishNames: { subclass: { [ash]: "Oath of Ash" } },
  nameOf: (ref: string) => {
    const [kind, id] = ref.split(":");
    return (names as Record<string, Record<string, string>>)[kind]?.[id] ?? id;
  },
  gameSpells: new Map(),
  packRefs: new Set([`subclass:${ash}`, ward]),
  packSupplier: () => undefined,
  packText: null,
  token: (value: unknown) => String(value),
} as unknown as ReferenceContextValue;

const system = {
  config: { id: "dnd5e-2024" },
  schema: { fields: { features: { id: "features", type: "list", rowTemplate: { children: [] } }, equipment: { id: "equipment", type: "list", rowTemplate: { children: [] } }, feats: { id: "feats", type: "list", rowTemplate: { children: [] } } } },
  gameData: { weapons, feats },
} as unknown as LoadedSystem;

async function open() {
  let data: Record<string, unknown> = { dexMod: 3, strMod: 0, profBonus: 2, weaponProficiencies: "Simple weapons" };
  const onUpdate = vi.fn((updater: (previous: Record<string, unknown>) => Record<string, unknown>) => {
    data = updater(data);
  });
  await act(async () => {
    render(
      <NextIntlClientProvider locale="zh-TW" messages={{ ...appZh, ...systemZh }} timeZone="UTC">
        <CompendiumDialog open system={system} context={context} onClose={() => {}} onUpdate={onUpdate} onPreview={() => {}} />
      </NextIntlClientProvider>,
    );
  });
  // The dialog shows once its lazy reference labels have loaded (plan T2b §5.10).
  await screen.findByRole("dialog");
  return { data: () => data };
}

const listed = () => [...document.querySelectorAll("[data-compendium-ref]")].map((row) => row.getAttribute("data-compendium-ref"));

describe("compendium (P6, S13)", () => {
  it.skipIf(zhWithheld("messages/zh-TW.json"))("orders subclass features by level and searches both subclass names", async () => {
    const { data } = await open();
    const tab = screen.getByRole("tab", { name: "特性" });
    fireEvent.mouseDown(tab);
    fireEvent.click(tab);
    expect(listed()).toEqual([`subclassFeature:${devotion}/oath-of-devotion-l3`, ward]);
    expect([...document.querySelectorAll("[data-feature-subclass]")].map(el => el.textContent)).toEqual(["奉獻之誓", "灰燼之誓"]);
    for (const value of ["oath of ash", "灰燼"]) {
      fireEvent.change(screen.getByRole("textbox"), { target: { value } });
      expect(listed()).toEqual([ward]);
    }
    const row = document.querySelector<HTMLElement>(`[data-compendium-ref="${ward}"]`)!;
    expect(row.querySelector("[data-feature-class]")).toHaveTextContent("聖騎士");
    expect(row.querySelector("[data-feature-level]")).toHaveTextContent("7");
    expect(row.querySelector("[data-pack-badge]")).toBeInTheDocument();
    fireEvent.click(within(row).getByRole("button", { name: "加入" }));
    expect(data().features).toEqual([expect.objectContaining({ ref: ward, level: 7 })]);
  });

  it.skipIf(zhWithheld("messages/zh-TW.json"))("lists no mounts or vehicles as equipment, and filters by category", async () => {
    await open();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "裝備" }));
    fireEvent.click(screen.getByRole("tab", { name: "裝備" }));
    await waitFor(() => expect(listed()).not.toContain("item:elephant"));
    expect(listed()).not.toContain("item:airship");
    expect(listed()).toEqual(expect.arrayContaining(["baseItem:dagger", "item:rope"]));
    expect(screen.getByRole("combobox", { name: "類別" })).toBeInTheDocument();
  });

  it.skipIf(zhWithheld("messages/zh-TW.json"))("adds a dagger as an attack for a DEX character", async () => {
    const { data } = await open();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "裝備" }));
    fireEvent.click(screen.getByRole("tab", { name: "裝備" }));
    fireEvent.click(await screen.findByRole("button", { name: "加為攻擊 · 匕首" }));
    expect(data().weapons).toEqual([expect.objectContaining({ name: "匕首", ability: "dex", damageDice: "1d4", ref: "baseItem:dagger" })]);
    expect(screen.queryByRole("button", { name: "加為攻擊 · 鏈甲" })).toBeNull();
  });

  it.skipIf(zhWithheld("messages/zh-TW.json"))("offers the feat categories on the feats tab", async () => {
    await open();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "專長" }));
    fireEvent.click(screen.getByRole("tab", { name: "專長" }));
    expect(screen.getByRole("combobox", { name: "類別" })).toBeInTheDocument();
    expect(listed()).toEqual(expect.arrayContaining(["feat:alert", "feat:archery"]));
  });

  it.skipIf(zhWithheld("messages/zh-TW.json"))("adding Archery also sets the sheet's ranged attack bonus, which the attack formula reads (T4F-R-F003)", async () => {
    const { data } = await open();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "專長" }));
    fireEvent.click(screen.getByRole("tab", { name: "專長" }));
    const row = document.querySelector("[data-compendium-ref='feat:archery']") as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: "加入" }));
    expect(data()).toMatchObject({ rangedAttackBonus: 2, feats: [expect.objectContaining({ ref: "feat:archery" })] });
  });
});
