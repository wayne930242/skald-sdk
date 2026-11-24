import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { useEffect } from "react";
import { describe, expect, it, vi } from "vitest";
import { zhWithheld } from "../../__tests__/zh-withheld";
import type { LoadedSystem } from "@skald/types/system";
import appZh from "@skald/sheet-sdk/messages/zh-TW.json";
import systemZh from "@skald/system-dnd5e/data/dnd5e-2024/messages/zh-TW.json";
import weapons from "@skald/system-dnd5e/data/dnd5e-2024/game/weapons.json";
import type { CompendiumStart } from "../compendium-rows";
import type { ReferenceContextValue } from "../use-reference-context";

/** plan-uat2 §3.2: the library opens on the list it was opened from. */

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock("../../reference/load-corpus", async () => ({
  loadReferenceMessages: async () => (await import("@skald/system-dnd5e/data/dnd5e-2024/messages/reference/zh-TW.json")).default,
  loadEnglishCorpus: async (part: string) =>
    part === "baseItem" ? { "baseItem:dagger": { meta: { type: "M" } }, "baseItem:chain-mail": { meta: { type: "HA" } } } : {},
}));
vi.mock("../play/edit-messages", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../play/edit-messages")>()),
  loadEditMessages: async () => ({ edit: {}, play: { damageType: { P: "穿刺" } } }),
}));

const { CompendiumDialog } = await import("../compendium-dialog");

const names = {
  baseItem: { dagger: "匕首", "chain-mail": "鏈甲" },
  class: { wizard: "法師", fighter: "戰士" },
  spell: { light: "光亮術", "fire-bolt": "火焰箭" },
  classFeature: { "wizard/spellcasting-l1": "施法", "fighter/second-wind-l1": "回氣" },
  feat: { alert: "警覺" },
};
const context = {
  locale: "zh-TW",
  names,
  englishNames: {},
  nameOf: (ref: string) => {
    const [kind, id] = ref.split(":");
    return (names as Record<string, Record<string, string>>)[kind]?.[id] ?? id;
  },
  gameSpells: new Map([
    ["light", { id: "light", level: 0, classes: ["wizard"] }],
    ["fire-bolt", { id: "fire-bolt", level: 0, classes: ["sorcerer"] }],
  ]),
  packRefs: new Set(),
  packSupplier: () => undefined,
  packText: null,
  token: (value: unknown) => String(value),
} as unknown as ReferenceContextValue;
const system = {
  config: { id: "dnd5e-2024" },
  schema: { fields: {} },
  gameData: { weapons },
} as unknown as LoadedSystem;

async function open(start?: CompendiumStart, onTabChange = vi.fn()) {
  await act(async () => {
    render(
      <NextIntlClientProvider locale="zh-TW" messages={{ ...appZh, ...systemZh }} timeZone="UTC">
        <CompendiumDialog open system={system} context={context} onClose={() => {}} onUpdate={vi.fn()} onPreview={() => {}} start={start} onTabChange={onTabChange} />
      </NextIntlClientProvider>,
    );
  });
  await screen.findByRole("dialog");
  return onTabChange;
}

const selected = () => screen.getAllByRole("tab").find((tab) => tab.getAttribute("aria-selected") === "true")?.textContent;
const listed = () => [...document.querySelectorAll("[data-compendium-ref]")].map((row) => row.getAttribute("data-compendium-ref"));

describe("the compendium's start (plan-uat2 §3.2)", () => {
  it.skipIf(zhWithheld("messages/zh-TW.json"))("opens 法術 by default", async () => {
    await open();
    expect(selected()).toBe("法術");
  });

  it.skipIf(zhWithheld("messages/zh-TW.json"))("from 法術: the spells tab with the character's class filter", async () => {
    await open({ tab: "spells", classId: "wizard" });
    expect(selected()).toBe("法術");
    expect(screen.getByRole("combobox", { name: "職業" })).toHaveTextContent("法師");
    expect(listed()).toEqual(["spell:light"]);
  });

  it.skipIf(zhWithheld("messages/zh-TW.json"))("from 職業特性: the features tab with the class filter", async () => {
    await open({ tab: "features", classId: "fighter" });
    expect(selected()).toBe("特性");
    expect(listed()).toEqual(["classFeature:fighter/second-wind-l1"]);
  });

  it.skipIf(zhWithheld("messages/zh-TW.json"))("from 專長: the feats tab", async () => {
    await open({ tab: "feats" });
    expect(selected()).toBe("專長");
    expect(listed()).toEqual(["feat:alert"]);
  });

  it.skipIf(zhWithheld("messages/zh-TW.json"))("from 裝備: the equipment tab", async () => {
    await open({ tab: "equipment" });
    expect(selected()).toBe("裝備");
    await waitFor(() => expect(listed()).toEqual(expect.arrayContaining(["baseItem:dagger", "baseItem:chain-mail"])));
  });

  it.skipIf(zhWithheld("messages/zh-TW.json"))("from 戰鬥: weapons, with 加為攻擊 as the main action", async () => {
    await open({ tab: "equipment", category: "weapon", intent: "attack" });
    expect(selected()).toBe("裝備");
    await waitFor(() => expect(listed()).toEqual(["baseItem:dagger"]));
    expect(screen.getByRole("button", { name: "加為攻擊 · 匕首" })).toHaveAttribute("data-main-action", "true");
  });

  it.skipIf(zhWithheld("messages/zh-TW.json"))("reports a tab change, so the toolbar can reopen on it", async () => {
    const onTabChange = await open();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "專長" }));
    fireEvent.click(screen.getByRole("tab", { name: "專長" }));
    expect(onTabChange).toHaveBeenCalledWith("feats");
  });
});

describe("the adapter's compendium start", () => {
  it("opens the toolbar's 資料庫 on the last tab used, 法術 at first", async () => {
    vi.resetModules();
    const seen: { start?: CompendiumStart; onTabChange?: (tab: string) => void } = {};
    vi.doMock("../compendium-dialog", () => ({
      CompendiumDialog: (props: { start?: CompendiumStart; onTabChange?: (tab: string) => void; onClose: () => void }) => {
        seen.start = props.start;
        seen.onTabChange = props.onTabChange;
        return <button type="button" onClick={props.onClose}>close</button>;
      },
    }));
    vi.doMock("../use-reference-context", () => ({ useReferenceContext: () => ({}) }));
    const { useDnd5eSheetAdapter } = await import("../dnd-sheet-adapter");
    const host: { open?: () => void } = {};
    function Host() {
      const output = useDnd5eSheetAdapter({ system: { ...system, runtime: {} } as LoadedSystem });
      useEffect(() => {
        host.open = () => void output.handlers.openCompendium({}, () => {});
      });
      return <>{output.dialogs}</>;
    }
    await act(async () => {
      render(
        <NextIntlClientProvider locale="zh-TW" messages={{}} timeZone="UTC">
          <Host />
        </NextIntlClientProvider>,
      );
    });
    await act(async () => host.open!());
    await waitFor(() => expect(seen.start).toEqual({ tab: "spells" }));
    act(() => seen.onTabChange!("monsters"));
    fireEvent.click(screen.getByRole("button", { name: "close" }));
    await act(async () => host.open!());
    await waitFor(() => expect(seen.start).toEqual({ tab: "monsters" }));
    vi.doUnmock("../compendium-dialog");
    vi.doUnmock("../use-reference-context");
  });
});
