import { act, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { zhWithheld } from "../../__tests__/zh-withheld";
import type { LoadedSystem } from "@skald/types/system";
import appZh from "@skald/sheet-sdk/messages/zh-TW.json";
import systemZh from "@skald/system-dnd5e/data/dnd5e-2024/messages/zh-TW.json";
import type { CompendiumStart } from "../compendium-rows";
import type { ReferenceContextValue } from "../use-reference-context";

/** CLASS-IMPL §7.5 M5: a multiclass sheet's library opens on 「我的職業」. */

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock("../../reference/load-corpus", async () => ({
  loadReferenceMessages: async () => (await import("@skald/system-dnd5e/data/dnd5e-2024/messages/reference/zh-TW.json")).default,
  loadEnglishCorpus: async () => ({}),
}));
vi.mock("../play/edit-messages", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../play/edit-messages")>()),
  loadEditMessages: async () => ({ edit: {}, play: { damageType: {} } }),
}));

const { CompendiumDialog } = await import("../compendium-dialog");

// Radix Select measures and scrolls its items; jsdom has neither.
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.scrollIntoView ??= () => {};

const names = {
  class: { wizard: "法師", cleric: "牧師", fighter: "戰士", sorcerer: "術士" },
  spell: { light: "光亮術", "fire-bolt": "火焰箭", "sacred-flame": "聖火術", "magic-missile": "魔法飛彈" },
  classFeature: { "wizard/spellcasting-l1": "施法", "cleric/divine-order-l1": "神聖職能", "fighter/second-wind-l1": "回氣" },
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
    ["light", { id: "light", level: 0, classes: ["wizard", "cleric"] }],
    ["fire-bolt", { id: "fire-bolt", level: 0, classes: ["wizard", "sorcerer"] }],
    ["sacred-flame", { id: "sacred-flame", level: 0, classes: ["cleric"] }],
    ["magic-missile", { id: "magic-missile", level: 1, classes: ["sorcerer"] }],
  ]),
  packRefs: new Set(),
  packSupplier: () => undefined,
  packText: null,
  token: (value: unknown) => String(value),
} as unknown as ReferenceContextValue;
const system = {
  config: { id: "dnd5e-2024" },
  schema: {
    fields: {
      spells: { id: "spells", type: "list", idPrefix: "spell", rowTemplate: { children: [{ id: "castingClass", type: "text", defaultValue: "" }] } },
      features: { id: "features", type: "list", rowTemplate: { children: [] } },
    },
  },
  gameData: {},
} as unknown as LoadedSystem;

async function open(start: CompendiumStart) {
  let data: Record<string, unknown> = { spells: [] };
  const onUpdate = vi.fn((updater: (previous: Record<string, unknown>) => Record<string, unknown>) => {
    data = updater(data);
  });
  await act(async () => {
    render(
      <NextIntlClientProvider locale="zh-TW" messages={{ ...appZh, ...systemZh }} timeZone="UTC">
        <CompendiumDialog open system={system} context={context} onClose={() => {}} onUpdate={onUpdate} onPreview={() => {}} start={start} />
      </NextIntlClientProvider>,
    );
  });
  await screen.findByRole("dialog");
  return { data: () => data };
}

const listed = () => [...document.querySelectorAll("[data-compendium-ref]")].map((row) => row.getAttribute("data-compendium-ref"));

async function choose(label: string, option: string) {
  fireEvent.click(screen.getByRole("combobox", { name: label }));
  fireEvent.click(await screen.findByRole("option", { name: option }));
}

function addRow(ref: string) {
  const row = document.querySelector(`[data-compendium-ref="${ref}"]`) as HTMLElement;
  fireEvent.click([...row.querySelectorAll("button")].find((button) => button.textContent?.includes("加入"))!);
}

const MULTICLASS: CompendiumStart = { tab: "spells", classIds: ["cleric", "wizard"], castingClassOf: { cleric: "", wizard: "wizard" } };

describe("「我的職業」 (CLASS-IMPL §7.5 M5)", () => {
  it.skipIf(zhWithheld("messages/zh-TW.json"))("opens 法術 on 我的職業: the union of the sheet's lists", async () => {
    await open(MULTICLASS);
    expect(screen.getByRole("combobox", { name: "職業" })).toHaveTextContent("我的職業");
    expect(listed().sort()).toEqual(["spell:fire-bolt", "spell:light", "spell:sacred-flame"]);
  });

  it.skipIf(zhWithheld("messages/zh-TW.json"))("a spell added while 法師 is filtered gets castingClass wizard; under 我的職業 none", async () => {
    const { data } = await open(MULTICLASS);
    addRow("spell:light");
    await choose("職業", "法師");
    expect(listed().sort()).toEqual(["spell:fire-bolt", "spell:light"]);
    addRow("spell:fire-bolt");
    const spells = data().spells as Array<Record<string, unknown>>;
    expect(spells.map((row) => [row.ref, row.castingClass])).toEqual([
      ["spell:light", ""],
      ["spell:fire-bolt", "wizard"],
    ]);
  });

  it.skipIf(zhWithheld("messages/zh-TW.json"))("features on 我的職業 list every sheet class's features", async () => {
    await open({ tab: "features", classIds: ["cleric", "wizard"] });
    expect(listed().sort()).toEqual(["classFeature:cleric/divine-order-l1", "classFeature:wizard/spellcasting-l1"]);
  });

  it.skipIf(zhWithheld("messages/zh-TW.json"))("a single-class preset shows no 我的職業", async () => {
    await open({ tab: "spells", classId: "wizard" });
    fireEvent.click(screen.getByRole("combobox", { name: "職業" }));
    expect(screen.queryByRole("option", { name: "我的職業" })).toBeNull();
  });
});
