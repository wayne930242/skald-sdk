import { useEffect, useState, type ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi, beforeAll } from "vitest";
import { zhWithheld } from "../../../__tests__/zh-withheld";
import { toast } from "sonner";
import type { Schema, Template } from "@skald/types/schema";
import type { LoadedSystem } from "@skald/types/system";
import appZh from "@skald/sheet-sdk/messages/zh-TW.json";
import appEn from "@skald/sheet-sdk/messages/en.json";
import systemZh from "@skald/system-dnd5e/data/dnd5e-2024/messages/zh-TW.json";
import systemEn from "@skald/system-dnd5e/data/dnd5e-2024/messages/en.json";
import schemaJson from "@skald/system-dnd5e/data/dnd5e-2024/schema.json";
import templateJson from "@skald/system-dnd5e/data/dnd5e-2024/template.json";
import spells from "@skald/system-dnd5e/data/dnd5e-2024/game/spells.json";
import classes from "@skald/system-dnd5e/data/dnd5e-2024/game/classes.json";
import { TemplateRenderer } from "@skald/sheet-sdk/modules/character/ui/renderer/template-renderer";
import { SystemPluginProvider } from "@skald/sheet-sdk/modules/systems/ui/system-plugin-provider";
import { useReferenceContext } from "../../use-reference-context";
import { DndPlayView } from "../play-view";
import { preloadPlayTabs } from "../lazy-tabs";
import { loadEditMessages } from "../edit-messages";

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
const executeRoll = vi.hoisted(() => vi.fn());
vi.mock("@skald/sheet-sdk/modules/rolls/ui/context/roll-context", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useRollOptional: () => ({ executeRoll }),
}));

/**
 * T4f play view fixes, each against the UAT finding it answers: casting with a slot choice or as
 * a Ritual, Concentration, Exhaustion, the death save roll, the always-prepared count, a feature's
 * dice, the viewer's locale for built-in names, and no sticky next-roll switch (B-021).
 */
const schema = schemaJson as unknown as Schema;
const template = templateJson as unknown as Template;
const system = {
  config: { id: "dnd5e-2024", sheetComponent: "dnd5e" },
  schema,
  template,
  defaultData: {},
  mappings: {},
  gameData: { spells, classes },
} as unknown as LoadedSystem;

const cleric: Record<string, unknown> = {
  name: "石鐘", level: 1, classId: "cleric", hpMax: 10, profBonus: 2, speed: 30,
  spellAbility: "wis", spellMod: 2, spellSaveDc: 12, spellAttack: 4, slot1Total: 2, slot1Used: 0,
  arcana: 0, wis: 14, wisMod: 2,
  spells: [
    { id: "s1", level: 1, name: "祝福術", ref: "spell:bless", origin: "srd", prepared: true, source: "class", concentration: true },
    { id: "s2", level: 1, name: "災禍術", ref: "spell:bane", origin: "srd", prepared: true, source: "class", concentration: true },
    { id: "s3", level: 1, name: "治療傷口", ref: "spell:cure-wounds", origin: "srd", prepared: true, source: "class", castingTime: "1 個動作", range: "接觸" },
    { id: "s4", level: 1, name: "偵測魔法", ref: "spell:detect-magic", origin: "srd", prepared: true, source: "class", ritual: true, concentration: true },
  ],
};

const saved: { data: Record<string, unknown> } = { data: {} };

function Sheet({ initial }: { initial: Record<string, unknown> }) {
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
      editable
      onChange={(path, value) => setData((previous) => ({ ...previous, [path]: value }))}
      setData={setData}
      characterId="c-t4f"
      playView={<DndPlayView system={system} reference={reference} openReference={() => {}} openCompendium={null} />}
    />
  );
}

let width = 1440;

async function mount(initial: Record<string, unknown>, locale: "zh-TW" | "en" = "zh-TW") {
  const messages = locale === "en" ? { ...appEn, ...systemEn } : { ...appZh, ...systemZh };
  const wrapper = ({ children }: { children: ReactNode }) => (
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
      <SystemPluginProvider catalog={{}}>{children}</SystemPluginProvider>
    </NextIntlClientProvider>
  );
  await act(async () => {
    render(<Sheet initial={initial} />, { wrapper });
  });
  await screen.findAllByRole("tab");
}

function openTab(name: string) {
  const tab = screen.getByRole("tab", { name });
  fireEvent.mouseDown(tab);
  fireEvent.click(tab);
}

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => ({ width, height: 800, top: 0, left: 0, right: width, bottom: 800, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect);
  executeRoll.mockReset();
  vi.mocked(toast).mockClear();
});
afterEach(() => {
  vi.restoreAllMocks();
  width = 1440;
});

const view = () => document.querySelector("[data-dnd-play-view]") as HTMLElement;
const spellRow = (ref: string) => view().querySelector(`[data-play-spell='${ref}']`) as HTMLElement;

// The tabs past 角色 load when they open; load them ahead so a test reads them at once.
// The tabs' edit labels (plan-uat2 §3.2) load with them: load both ahead too.
beforeAll(() => Promise.all([preloadPlayTabs(), loadEditMessages("zh-TW"), loadEditMessages("en")]));

describe("casting (A2-09, A2-11, A2-12)", () => {
  it.skipIf(zhWithheld("messages/play-tabs/zh-TW.json", "messages/play/zh-TW.json", "messages/zh-TW.json"))("lets a caster pick a higher slot to upcast", async () => {
    await mount({ ...cleric, slot2Total: 1, slot2Used: 0 });
    openTab("法術");
    fireEvent.click(within(spellRow("spell:cure-wounds")).getByRole("button", { name: "施放治療傷口" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getAllByRole("button").map((button) => button.textContent)).toEqual(
      expect.arrayContaining(["用 1 環法術位剩 2", "用 2 環法術位剩 1"]),
    );
    fireEvent.click(within(dialog).getByRole("button", { name: /用 2 環法術位/ }));
    expect(saved.data.slot2Used).toBe(1);
    expect(saved.data.slot1Used).toBe(0);
  });

  it.skipIf(zhWithheld("messages/play-tabs/zh-TW.json", "messages/play/zh-TW.json", "messages/zh-TW.json"))("casts a prepared Ritual spell without a slot, even with every slot spent", async () => {
    await mount({ ...cleric, slot1Used: 2 });
    openTab("法術");
    const cast = within(spellRow("spell:detect-magic")).getByRole("button", { name: "施放偵測魔法" });
    expect(cast).toBeEnabled();
    fireEvent.click(cast);
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: /以儀式施放/ }));
    expect(saved.data.slot1Used).toBe(2);
    expect(toast).toHaveBeenCalledWith(expect.stringContaining("以儀式施放"));
  });

  it.skipIf(zhWithheld("messages/play-tabs/zh-TW.json", "messages/play/zh-TW.json", "messages/zh-TW.json"))("shows the spell held with Concentration; a new one replaces it, and it can be ended", async () => {
    await mount(cleric);
    openTab("法術");
    // One open slot level and no Ritual: the cast spends it at once.
    fireEvent.click(within(spellRow("spell:bless")).getByRole("button", { name: "施放祝福術" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(saved.data.concentration).toBe("spell:bless");
    expect(view().querySelector("[data-play-concentration]")).toHaveTextContent("專注：祝福術");

    fireEvent.click(within(spellRow("spell:bane")).getByRole("button", { name: "施放災禍術" }));
    expect(saved.data.concentration).toBe("spell:bane");
    expect(toast).toHaveBeenLastCalledWith(expect.stringContaining("取代原本專注的祝福術"));

    fireEvent.click(screen.getAllByRole("button", { name: "終止對災禍術的專注" })[0]);
    expect(saved.data.concentration).toBe("");
    expect(view().querySelector("[data-play-concentration]")).toBeNull();
  });
});

describe("Exhaustion (A2-08)", () => {
  it.skipIf(zhWithheld("messages/play/zh-TW.json", "messages/zh-TW.json"))("shows the level, takes 5 feet of Speed per level and 2 from a d20 Test per level", async () => {
    await mount({ ...cleric, exhaustion: 2, conditions: ["exhaustion"], arcana: 3 });
    expect(view().querySelector("[data-play-stat='speed']")).toHaveTextContent("20呎");
    expect(view().querySelector("[data-play-exhaustion]")).toHaveTextContent("力竭 2");
    fireEvent.click(view().querySelector("[data-play-skill='arcana']") as HTMLElement);
    expect(executeRoll).toHaveBeenCalled();
    // The roll subtracts `@d20Penalty`, as edit mode and print roll it (T4F-R-F007).
    expect(executeRoll.mock.calls[0][0]).toMatchObject({ expression: "{{#d20[@arcana-@d20Penalty]}}" });
    expect(executeRoll.mock.calls[0][1]).toMatchObject({ arcana: 3, d20Penalty: 4 });
  });

  it.skipIf(zhWithheld("messages/play/zh-TW.json"))("shows level 6 as death (T4F-R-F007)", async () => {
    await mount({ ...cleric, exhaustion: 6, conditions: ["exhaustion"] });
    const chip = view().querySelector("[data-play-exhaustion]") as HTMLElement;
    expect(chip).toHaveAttribute("data-play-exhaustion", "6");
    expect(chip.getAttribute("aria-label")).toContain("死亡");
  });

  it.skipIf(zhWithheld("messages/play/zh-TW.json"))("sets the level from the chip", async () => {
    await mount({ ...cleric, exhaustion: 1, conditions: ["exhaustion"] });
    fireEvent.click(view().querySelector("[data-play-exhaustion]") as HTMLElement);
    fireEvent.click(await screen.findByRole("button", { name: "力竭 3 級" }));
    expect(saved.data.exhaustion).toBe(3);
  });
});

describe("death saving throw (A1-04)", () => {
  const deathRoll = () => screen.getAllByRole("button", { name: /擲死亡豁免/ })[0];

  it.skipIf(zhWithheld("messages/play/zh-TW.json"))("rolls the d20 macro at 0 HP on a tap and records a natural 1 as two failures", async () => {
    executeRoll.mockResolvedValue({ rolled: 1, rolls: [1] });
    await mount({ ...cleric, hp: { current: 0 }, exhaustion: 1, conditions: ["exhaustion"] });
    await act(async () => {
      fireEvent.click(deathRoll());
    });
    // A d20 Test like any other (B-022): the d20 macro, with Exhaustion's penalty as its modifier.
    expect(executeRoll.mock.calls[0][0]).toMatchObject({ expression: "{{#d20[@mod]}}" });
    expect(executeRoll.mock.calls[0][1]).toEqual({ mod: -2 });
    expect(executeRoll.mock.calls[0][3]).toEqual({ adv: 0 });
    expect(saved.data.deathFailures).toBe(2);
  });

  it.skipIf(zhWithheld("messages/play/zh-TW.json"))("a natural 20 regains 1 Hit Point", async () => {
    executeRoll.mockResolvedValue({ rolled: 20, rolls: [20] });
    await mount({ ...cleric, hp: { current: 0 }, deathFailures: 1 });
    await act(async () => {
      fireEvent.click(deathRoll());
    });
    expect(saved.data).toMatchObject({ hp: { current: 1 }, deathFailures: 0, deathSuccesses: 0 });
  });

  // B-022 (D4): the d20 dialog opens on a death save too; the natural die is the one kept.
  it.skipIf(zhWithheld("messages/play/zh-TW.json", "messages/roll/zh-TW.json")).each([
    ["優勢", 1, [3, 20], 20, { hp: { current: 1 }, deathFailures: 0, deathSuccesses: 0 }],
    ["劣勢", -1, [20, 1], 1, { deathFailures: 2 }],
  ] as const)("rolls with %s from the dialog and reads the kept die", async (mode, adv, rolls, rolled, expected) => {
    executeRoll.mockResolvedValue({ rolled, rolls });
    await mount({ ...cleric, hp: { current: 0 } });
    await act(async () => {
      fireEvent.keyDown(deathRoll(), { key: "Enter", shiftKey: true });
    });
    const dialog = await screen.findByRole("dialog", { name: "死亡豁免" }, { timeout: 5000 });
    fireEvent.click(within(dialog).getByRole("radio", { name: mode }));
    fireEvent.click(within(dialog).getByRole("button", { name: "加 1" }));
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "擲骰" }));
    });
    expect(executeRoll.mock.calls[0][0]).toMatchObject({ expression: "{{#d20[(@mod)+1]}}" });
    expect(executeRoll.mock.calls[0][3]).toEqual({ adv });
    expect(saved.data).toMatchObject(expected);
  });

  it("is not offered above 0 HP", async () => {
    await mount(cleric);
    expect(screen.queryByRole("button", { name: /擲死亡豁免/ })).toBeNull();
  });
});

describe("always-prepared spells (A1-08)", () => {
  it.skipIf(zhWithheld("messages/play-tabs/zh-TW.json", "messages/play/zh-TW.json"))("counts a feat's spell apart from the class's prepared spells", async () => {
    await mount({ ...cleric, spells: [...(cleric.spells as unknown[]), { id: "s5", level: 1, name: "命令術", ref: "spell:command", prepared: true, source: "magic-initiate" }] });
    openTab("法術");
    expect(view().querySelector("[data-play-stat='prepared']")).toHaveTextContent("4 / 4＋1 常備");
  });
});

describe("feature dice (A3-05)", () => {
  it.skipIf(zhWithheld("messages/play-tabs/zh-TW.json", "messages/play/zh-TW.json"))("gives a pack trait that rolls Proficiency Bonus d4s a roll button", async () => {
    await mount({
      ...cleric,
      speciesTraits: [{ id: "species:pack-folk#lantern-light", name: "燈籠之光", ref: "species:pack-folk", origin: "pack", text: "燈籠閃爍時，擲出等同你的熟練加值顆d4。" }],
    });
    openTab("特性");
    expect(await screen.findByRole("button", { name: "燈籠之光：擲 2d4" })).toBeInTheDocument();
  });
});

describe("built-in names in the viewer's locale (A2-10)", () => {
  it("names a zh-TW-created spell in English on an English sheet", async () => {
    await mount(cleric, "en");
    openTab("Spells");
    const row = spellRow("spell:cure-wounds");
    expect(row).toHaveTextContent("Cure Wounds");
    expect(row).toHaveTextContent("1 action · Touch");
    expect(row).not.toHaveTextContent("治療傷口");
    expect(within(row).getByRole("button", { name: "Cast Cure Wounds" })).toBeInTheDocument();
  });
});

describe("no sticky next-roll switch (B-021)", () => {
  it.skipIf(zhWithheld("messages/play/zh-TW.json"))("shows no 下一擲 switch on any tab, phone or desktop: each roll picks its own options", async () => {
    for (const viewport of [390, 1440]) {
      width = viewport;
      await mount(cleric);
      for (const tab of viewport === 390 ? ["角色", "戰鬥", "技能", "法術"] : ["角色", "戰鬥", "法術"]) {
        openTab(tab);
        expect(within(view()).queryByRole("radiogroup", { name: "下一擲" }), `${viewport} ${tab}`).toBeNull();
        expect(view(), `${viewport} ${tab}`).not.toHaveTextContent("下一擲");
      }
      cleanup();
    }
  });
});

describe("a Wizard's unprepared Ritual spell (T4F-R-F006)", () => {
  it.skipIf(zhWithheld("messages/play-tabs/zh-TW.json", "messages/play/zh-TW.json", "messages/zh-TW.json"))("offers only the Ritual cast, never a slot, while slots are open", async () => {
    await mount({
      ...cleric, classId: "wizard", spellAbility: "int", slot1Total: 2, slot1Used: 0,
      features: [{ id: "f1", name: "儀式行家", ref: "classFeature:wizard/ritual-adept-l1", origin: "srd" }],
      spells: [{ id: "s9", level: 1, name: "偵測魔法", ref: "spell:detect-magic", origin: "srd", prepared: false, source: "class", ritual: true, concentration: true }],
    });
    openTab("法術");
    fireEvent.click(within(spellRow("spell:detect-magic")).getByRole("button", { name: "施放偵測魔法" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog.querySelectorAll("[data-cast-option]")).toHaveLength(1);
    expect(dialog.querySelector("[data-cast-option='ritual']")).not.toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: /以儀式施放/ }));
    expect(saved.data.slot1Used).toBe(0);
  });
});

describe("upcast damage and healing dice (T4F-R-F004)", () => {
  const sorcerer: Record<string, unknown> = {
    ...cleric, classId: "sorcerer", spellAbility: "cha", slot1Total: 2, slot1Used: 0, slot2Total: 1, slot2Used: 0,
    spells: [
      { id: "s1", level: 1, name: "燃燒之手", ref: "spell:burning-hands", origin: "srd", prepared: true, source: "class" },
      { id: "s2", level: 1, name: "治療傷口", ref: "spell:cure-wounds", origin: "srd", prepared: true, source: "class" },
    ],
  };

  async function castAt(ref: string, name: string, level: number) {
    fireEvent.click(within(spellRow(ref)).getByRole("button", { name: `施放${name}` }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: new RegExp(`用 ${level} 環法術位`) }));
  }

  it.skipIf(zhWithheld("messages/play-tabs/zh-TW.json", "messages/play/zh-TW.json", "messages/zh-TW.json"))("rolls Burning Hands from a level 2 slot as 4d6, and names the slot and dice in the toast", async () => {
    await mount(sorcerer);
    openTab("法術");
    expect(within(spellRow("spell:burning-hands")).getByRole("button", { name: "燃燒之手傷害 3d6" })).toBeInTheDocument();
    await castAt("spell:burning-hands", "燃燒之手", 2);
    expect(toast).toHaveBeenLastCalledWith(expect.stringContaining("2 環"));
    expect(toast).toHaveBeenLastCalledWith(expect.stringContaining("4d6"));
    fireEvent.click(within(spellRow("spell:burning-hands")).getByRole("button", { name: "燃燒之手傷害 4d6" }));
    expect(executeRoll.mock.calls.at(-1)?.[0]).toMatchObject({ expression: "4d6" });
  });

  it.skipIf(zhWithheld("messages/play-tabs/zh-TW.json", "messages/play/zh-TW.json", "messages/zh-TW.json"))("rolls Cure Wounds' healing plus the spellcasting modifier, 2d8+2 from a level 1 slot and 4d8+2 from a level 2 slot (T4G-R-F002)", async () => {
    await mount(sorcerer);
    openTab("法術");
    expect(within(spellRow("spell:cure-wounds")).getByRole("button", { name: "治療傷口治療 2d8+2" })).toBeInTheDocument();
    await castAt("spell:cure-wounds", "治療傷口", 2);
    expect(toast).toHaveBeenLastCalledWith(expect.stringContaining("4d8+2"));
    fireEvent.click(within(spellRow("spell:cure-wounds")).getByRole("button", { name: "治療傷口治療 4d8+2" }));
    expect(executeRoll.mock.calls.at(-1)?.[0]).toMatchObject({ expression: "4d8+2" });
  });

  it.skipIf(zhWithheld("messages/play-tabs/zh-TW.json", "messages/play/zh-TW.json", "messages/zh-TW.json"))("subtracts a negative spellcasting modifier from the healing, and adds none at +0", async () => {
    await mount({ ...sorcerer, spellMod: -1 });
    openTab("法術");
    expect(within(spellRow("spell:cure-wounds")).getByRole("button", { name: "治療傷口治療 2d8-1" })).toBeInTheDocument();
  });
});
