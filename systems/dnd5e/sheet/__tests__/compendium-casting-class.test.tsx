import { act, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { zhWithheld } from "../../__tests__/zh-withheld";
import type { LoadedSystem } from "@skald/types/system";
import appZh from "@skald/sheet-sdk/messages/zh-TW.json";
import systemZh from "@skald/system-dnd5e/data/dnd5e-2024/messages/zh-TW.json";
import { presentRefs, spellCastersFor, type CompendiumStart } from "../compendium-rows";
import { sortClassFilter } from "../compendium-choices";
import type { ReferenceContextValue } from "../use-reference-context";

/** UAT M5 (a spell's class), M6 (已加入, no second add) and m11 (class filter order). */

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

Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.scrollIntoView ??= () => {};

const names = {
  class: { ranger: "遊俠", cleric: "牧師", wizard: "法師", "hb-ash": "灰燼守望" },
  spell: { "sacred-flame": "聖焰", "cure-wounds": "治療傷口", "hunters-mark": "獵人印記" },
  classFeature: { "cleric/divine-order-l1": "神聖職分" },
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
    ["sacred-flame", { id: "sacred-flame", level: 0, classes: ["cleric"] }],
    ["cure-wounds", { id: "cure-wounds", level: 1, classes: ["cleric", "ranger"] }],
    ["hunters-mark", { id: "hunters-mark", level: 1, classes: ["ranger"] }],
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
  gameData: { classes: [{ id: "ranger" }, { id: "cleric" }, { id: "wizard" }] },
} as unknown as LoadedSystem;

/** Ranger 5 / Cleric 1, as the spells tab's library preset builds it. */
const RANGER_CLERIC: CompendiumStart = {
  tab: "spells",
  classIds: ["ranger", "cleric"],
  castingClassOf: { ranger: "", cleric: "cleric" },
  spellClasses: [
    { castingClass: "", list: "ranger", name: "遊俠" },
    { castingClass: "cleric", list: "cleric", name: "牧師" },
  ],
};

async function open(start: CompendiumStart, initial: Record<string, unknown> = { spells: [] }) {
  let data = initial;
  const onUpdate = vi.fn((updater: (previous: Record<string, unknown>) => Record<string, unknown>) => {
    data = updater(data);
  });
  await act(async () => {
    render(
      <NextIntlClientProvider locale="zh-TW" messages={{ ...appZh, ...systemZh }} timeZone="UTC">
        <CompendiumDialog open system={system} context={context} onClose={() => {}} onUpdate={onUpdate} onPreview={() => {}} start={{ ...start, present: presentRefs(initial) }} />
      </NextIntlClientProvider>,
    );
  });
  await screen.findByRole("dialog");
  return { data: () => data };
}

const row = (ref: string) => document.querySelector(`[data-compendium-ref="${ref}"]`) as HTMLElement;
const addButton = (ref: string) => [...row(ref).querySelectorAll("button")].find((button) => button.textContent?.includes("加入"));
const spellRows = (data: Record<string, unknown>) => (data.spells as Array<Record<string, unknown>>).map((spell) => [spell.ref, spell.castingClass]);

describe("a multiclass sheet's spell class (UAT M5)", () => {
  it("picks the class whose list holds the spell, or offers the choice when several do", () => {
    expect(spellCastersFor(RANGER_CLERIC, ["cleric"])).toEqual([{ castingClass: "cleric", list: "cleric", name: "牧師" }]);
    expect(spellCastersFor(RANGER_CLERIC, ["cleric", "ranger"]).map((caster) => caster.castingClass)).toEqual(["", "cleric"]);
    expect(spellCastersFor(RANGER_CLERIC, ["cleric", "ranger"], "cleric").map((caster) => caster.castingClass)).toEqual(["cleric"]);
    expect(spellCastersFor(RANGER_CLERIC, ["wizard"])).toEqual([]);
    expect(spellCastersFor({ tab: "spells" }, ["cleric"])).toEqual([]);
  });

  it.skipIf(zhWithheld("messages/zh-TW.json"))("聖焰 added under 我的職業 on 遊俠 5 / 牧師 1 casts as 牧師", async () => {
    const { data } = await open(RANGER_CLERIC);
    expect(row("spell:sacred-flame").querySelector("[data-compendium-caster]")).toBeNull();
    fireEvent.click(addButton("spell:sacred-flame")!);
    expect(spellRows(data())).toEqual([["spell:sacred-flame", "cleric"]]);
  });

  it.skipIf(zhWithheld("messages/zh-TW.json"))("a spell on both lists asks which class casts it before 加入", async () => {
    const { data } = await open(RANGER_CLERIC);
    expect(row("spell:hunters-mark").querySelector("[data-compendium-caster]")).toBeNull();
    const chooser = row("spell:cure-wounds").querySelector("[data-compendium-caster]") as HTMLElement;
    expect(chooser).toHaveTextContent("遊俠");
    fireEvent.click(chooser);
    fireEvent.click(await screen.findByRole("option", { name: "牧師" }));
    fireEvent.click(addButton("spell:cure-wounds")!);
    fireEvent.click(addButton("spell:hunters-mark")!);
    expect(spellRows(data())).toEqual([
      ["spell:cure-wounds", "cleric"],
      ["spell:hunters-mark", ""],
    ]);
  });
});

describe("already on the sheet (UAT M6)", () => {
  it.skipIf(zhWithheld("messages/zh-TW.json"))("a spell on the sheet shows 已加入 and has no 加入", async () => {
    await open(RANGER_CLERIC, { spells: [{ id: "s1", ref: "spell:sacred-flame", name: "聖焰", castingClass: "cleric" }] });
    expect(row("spell:sacred-flame").querySelector("[data-compendium-present]")).toHaveTextContent("已加入");
    expect(addButton("spell:sacred-flame")).toBeUndefined();
    expect(addButton("spell:cure-wounds")).toBeDefined();
  });

  it.skipIf(zhWithheld("messages/zh-TW.json"))("a second 加入 of the same spell or feature is ignored", async () => {
    const { data } = await open(RANGER_CLERIC);
    const button = addButton("spell:sacred-flame")!;
    fireEvent.click(button);
    fireEvent.click(button);
    await act(async () => {});
    expect(spellRows(data())).toEqual([["spell:sacred-flame", "cleric"]]);
    expect(row("spell:sacred-flame").querySelector("[data-compendium-present]")).not.toBeNull();
  });

  it("presentRefs keys spells by ref and caster, features by ref (F003)", () => {
    expect(presentRefs({ spells: [{ ref: "spell:light" }, { ref: "spell:light", castingClass: "cleric" }, { ref: "spell:light", source: "magic-initiate", castingClass: "" }, { ref: "" }, {}], features: [{ ref: "classFeature:x" }], equipment: [{ ref: "item:y" }] })).toEqual({
      spells: ["spell:light|", "spell:light|cleric", "spell:light|@magic-initiate"],
      features: ["classFeature:x"],
    });
  });
});

describe("a spell is taken once per caster (F003)", () => {
  const CLERIC_ONLY: CompendiumStart = { tab: "spells", classId: "cleric" };
  const MAGIC_INITIATE = { id: "s0", ref: "spell:sacred-flame", name: "聖焰", source: "magic-initiate", castingClass: "" };

  it.skipIf(zhWithheld("messages/zh-TW.json"))("聖焰 from Magic Initiate does not block 聖焰 for the Cleric; a second add is blocked", async () => {
    const { data } = await open(CLERIC_ONLY, { spells: [MAGIC_INITIATE] });
    expect(row("spell:sacred-flame").querySelector("[data-compendium-present]")).toBeNull();
    fireEvent.click(addButton("spell:sacred-flame")!);
    await act(async () => {});
    expect(spellRows(data())).toEqual([["spell:sacred-flame", ""], ["spell:sacred-flame", ""]]);
    expect(row("spell:sacred-flame").querySelector("[data-compendium-present]")).not.toBeNull();
    expect(addButton("spell:sacred-flame")).toBeUndefined();
  });

  it.skipIf(zhWithheld("messages/zh-TW.json"))("on a multiclass sheet Magic Initiate 聖焰 leaves the Cleric's add open", async () => {
    const { data } = await open(RANGER_CLERIC, { spells: [MAGIC_INITIATE] });
    fireEvent.click(addButton("spell:sacred-flame")!);
    await act(async () => {});
    expect(spellRows(data())).toEqual([["spell:sacred-flame", ""], ["spell:sacred-flame", "cleric"]]);
    expect(addButton("spell:sacred-flame")).toBeUndefined();
  });

  it.skipIf(zhWithheld("messages/zh-TW.json"))("a spell two classes share is addable once per class", async () => {
    const { data } = await open(RANGER_CLERIC);
    fireEvent.click(addButton("spell:cure-wounds")!);
    await act(async () => {});
    // The ranger has it: only the cleric remains, so no chooser.
    expect(row("spell:cure-wounds").querySelector("[data-compendium-caster]")).toBeNull();
    fireEvent.click(addButton("spell:cure-wounds")!);
    await act(async () => {});
    expect(spellRows(data())).toEqual([["spell:cure-wounds", ""], ["spell:cure-wounds", "cleric"]]);
    expect(row("spell:cure-wounds").querySelector("[data-compendium-present]")).not.toBeNull();
  });
});

describe("class filter order (UAT m11)", () => {
  it("built-in classes by their name in the viewer's locale, then pack and homebrew classes", () => {
    const en = { ranger: "Ranger", cleric: "Cleric", wizard: "Wizard", "hb-ash": "Ash Warden", bard: "Bard" };
    const sorted = sortClassFilter(Object.keys(en), {
      builtin: new Set(["ranger", "cleric", "wizard", "bard"]),
      nameOf: (id) => en[id as keyof typeof en],
      locale: "en",
    });
    expect(sorted).toEqual({ ids: ["bard", "cleric", "ranger", "wizard", "hb-ash"], packStart: 4 });
    expect(sortClassFilter(["ranger"], { builtin: new Set(["ranger"]), nameOf: (id) => id, locale: "en" }).packStart).toBe(-1);
  });
});
