import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { zhWithheld } from "../../../__tests__/zh-withheld";
import type { CompendiumStart } from "../../compendium-rows";
import { loadDndHarness, mountDnd, openTab, type DndHarness } from "./dnd-harness";

/** CLASS-IMPL §7.5 M5: per-class spellcasting on a multiclass sheet. */

const roll = vi.hoisted(() => ({ executeRoll: vi.fn(async () => null) }));
vi.mock("@skald/sheet-sdk/modules/rolls/ui/context/roll-context", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@skald/sheet-sdk/modules/rolls/ui/context/roll-context")>()),
  useRollOptional: () => ({ executeRoll: roll.executeRoll, nextModifier: 0 }),
}));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), warning: vi.fn(), dismiss: vi.fn() }) }));

let harness: DndHarness;
beforeAll(async () => {
  harness = await loadDndHarness();
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.scrollIntoView ??= () => {};
});

const fireBolt = { id: "spell_fb", ref: "spell:fire-bolt", name: "火焰箭", level: 0, source: "class", origin: "srd", text: "", castingClass: "wizard" };
const sacredFlame = { id: "spell_sf", ref: "spell:sacred-flame", name: "聖火術", level: 0, source: "class", origin: "srd", text: "", castingClass: "" };

/** Cleric 3 (WIS 16) / Wizard 2 (INT 14), character level 5 (proficiency +3). */
const CLERIC_WIZARD = {
  level: 5,
  classId: "cleric",
  className: "牧師",
  spellAbility: "wis",
  wis: 16,
  int: 14,
  multiclass: [{ id: "class_w", classId: "wizard", ref: "class:wizard", origin: "srd", name: "法師", subclass: "", level: 2, hitDie: 6, hitDiceSpent: 0, spellAbility: "int" }],
  spells: [fireBolt, sacredFlame],
};

describe("per-class spellcasting (CLASS-IMPL §7.5 M5)", () => {
  it.skipIf(zhWithheld("messages/play/zh-TW.json"))("shows one casting tile set per class: 睿知 DC 14 +6 and 智力 DC 13 +5", async () => {
    await mountDnd(harness, { extra: CLERIC_WIZARD });
    await openTab("法術");
    const cleric = document.querySelector('[data-play-casting="start"]') as HTMLElement;
    const wizard = document.querySelector('[data-play-casting="wizard"]') as HTMLElement;
    expect(cleric).toHaveTextContent("睿知 +3");
    expect(within(cleric).getByText("14")).toBeInTheDocument();
    expect(cleric).toHaveTextContent("+6");
    expect(wizard).toHaveTextContent("智力 +2");
    expect(within(wizard).getByText("13")).toBeInTheDocument();
    expect(wizard).toHaveTextContent("+5");
  });

  it.skipIf(zhWithheld("messages/play/zh-TW.json"))("a Fire Bolt row of castingClass wizard rolls with +5; the row shows its class", async () => {
    await mountDnd(harness, { extra: CLERIC_WIZARD });
    await openTab("法術");
    const row = document.querySelector('[data-play-spell="spell:fire-bolt"]') as HTMLElement;
    expect(row.querySelector('[data-play-casting-class="wizard"]')).toHaveTextContent("法師");
    const attack = within(row).getByRole("button", { name: /\+5$/ });
    roll.executeRoll.mockClear();
    await act(async () => fireEvent.click(attack));
    expect(roll.executeRoll).toHaveBeenCalledTimes(1);
    const [config, context] = roll.executeRoll.mock.calls[0] as unknown as [{ expression: string }, Record<string, unknown>];
    expect(config.expression).toBe("{{#d20[@spellAttack-@d20Penalty]}}");
    expect(context.spellAttack).toBe(5);
  });

  it.skipIf(zhWithheld("messages/play/zh-TW.json"))("edit mode: the 施法職業 select writes the row's castingClass", async () => {
    const sheet = await mountDnd(harness, { extra: CLERIC_WIZARD, mode: "edit" });
    await openTab("法術");
    fireEvent.click(screen.getByRole("combobox", { name: "聖焰的施法職業" }));
    fireEvent.click(await screen.findByRole("option", { name: "法師" }));
    const spells = sheet.data().spells as Array<Record<string, unknown>>;
    expect(spells.find((spell) => spell.id === "spell_sf")?.castingClass).toBe("wizard");
  });

  it.skipIf(zhWithheld("messages/play/zh-TW.json"))("the libraries open on 我的職業 (spells: cleric ∪ wizard lists; features: both classes)", async () => {
    const openCompendium = vi.fn();
    await mountDnd(harness, { extra: CLERIC_WIZARD, useHost: () => ({ playView: { openCompendium } }) });
    await openTab("法術");
    fireEvent.click(document.querySelector('[data-add-list="spells"]') as HTMLElement);
    const spellStart = openCompendium.mock.calls.at(-1)?.[2] as CompendiumStart;
    expect(spellStart).toEqual({
      tab: "spells",
      classIds: ["cleric", "wizard"],
      castingClassOf: { cleric: "", wizard: "wizard" },
      spellClasses: [
        { castingClass: "", list: "cleric", name: "牧師" },
        { castingClass: "wizard", list: "wizard", name: "法師" },
      ],
    });
    await openTab("特性");
    fireEvent.click(document.querySelector('[data-add-list="features"]') as HTMLElement);
    expect(openCompendium.mock.calls.at(-1)?.[2]).toEqual({ tab: "features", classIds: ["cleric", "wizard"] });
  });

  it.skipIf(zhWithheld("messages/play/zh-TW.json"))("a single-class sheet keeps one tile set, no class badge, and its class preset", async () => {
    const openCompendium = vi.fn();
    await mountDnd(harness, { extra: { classId: "wizard", className: "法師", spellAbility: "int", int: 14, spells: [fireBolt] }, useHost: () => ({ playView: { openCompendium } }) });
    await openTab("法術");
    expect(document.querySelector("[data-play-casting]")).toBeNull();
    expect(document.querySelector("[data-play-casting-class]")).toBeNull();
    fireEvent.click(document.querySelector('[data-add-list="spells"]') as HTMLElement);
    expect(openCompendium.mock.calls.at(-1)?.[2]).toEqual({ tab: "spells", classId: "wizard" });
  });

  it.skipIf(zhWithheld("messages/play/zh-TW.json"))("a single-class third caster rolls the subclass bonus it shows, on Spells and Combat (UAT F009)", async () => {
    // Fighter 3 (Spell Blade), INT 16, proficiency +2: shows and rolls +5, not the stored flat +2.
    const blade = {
      level: 3, classId: "fighter", className: "Fighter", subclass: "Spell Blade", spellAbility: "none", int: 16, spellAttack: 2,
      features: [{ id: "f_sc", ref: "subclassFeature:fighter/spell-blade/spellcasting-l3", name: "Spellcasting", level: 3 }],
      spells: [{ ...fireBolt, castingClass: "" }],
    };
    for (const tab of ["法術", "戰鬥"]) {
      cleanup();
      await mountDnd(harness, { extra: blade });
      await openTab(tab);
      const attack = screen.getAllByRole("button", { name: /火焰箭.*\+5$/ })[0]!;
      roll.executeRoll.mockClear();
      await act(async () => fireEvent.click(attack));
      const [, context] = roll.executeRoll.mock.calls[0] as unknown as [unknown, Record<string, unknown>];
      expect(context.spellAttack).toBe(5);
    }
  });
});
