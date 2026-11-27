import zh from "@skald/system-dnd5e/data/dnd5e-2024/messages/zh-TW.json";
import tabs from "@skald/system-dnd5e/data/dnd5e-2024/messages/play-tabs/zh-TW.json";
import { screen, waitFor, within } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { loadDndHarness, mountDnd, openTab, type DndHarness } from "./dnd-harness";
import { preloadPlayTabs } from "../lazy-tabs";
import { loadEditMessages } from "../edit-messages";

/**
 * UAT M10: a sheet created in zh-TW and read in English shows its built-in class, subclass,
 * species and background names in English, from their ids, on the class line, the spell tiles,
 * the spell badges and their labels. The stored text stays as it was.
 */

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), warning: vi.fn(), dismiss: vi.fn() }) }));

let harness: DndHarness;
beforeAll(async () => {
  harness = await loadDndHarness();
  await Promise.all([preloadPlayTabs(), loadEditMessages("en")]);
});

/** Cleric 3 (Life Domain, WIS 16) / Wizard 1 (INT 14), level 4, created in zh-TW. */
const ZH_CREATED = {
  level: 4,
  classId: "cleric",
  className: "牧師",
  subclass: "生命領域",
  spellAbility: "wis",
  wis: 16,
  int: 14,
  species: "精靈",
  speciesId: "elf",
  background: "智者",
  backgroundId: "sage",
  features: [{ id: "f1", ref: "subclassFeature:cleric/life-domain/disciple-of-life-l3", name: "生命門徒", origin: "srd", text: "" }],
  multiclass: [{ id: "class_w", classId: "wizard", ref: "class:wizard", origin: "srd", name: "法師", subclass: "", level: 1, hitDie: 6, hitDiceSpent: 0, spellAbility: "int" }],
  spells: [{ id: "spell_fb", ref: "spell:fire-bolt", name: "火焰箭", level: 0, source: "class", origin: "srd", text: "", castingClass: "wizard" }],
};

describe("names in the viewer's locale (UAT M10)", () => {
  it("the class line, species and background read in English", async () => {
    const sheet = await mountDnd(harness, { locale: "en", extra: ZH_CREATED });
    expect(document.querySelector("[data-play-class-line]")).toHaveTextContent("Cleric 3 · Life Domain / Wizard 1 · Level 4");
    await openTab("Character");
    expect(screen.getByText("Elf")).toBeInTheDocument();
    expect(screen.getByText("Sage")).toBeInTheDocument();
    // Nothing is rewritten.
    expect(sheet.data()).toMatchObject({ className: "牧師", subclass: "生命領域", species: "精靈", background: "智者" });
  });

  it("the spell tiles, the badge and the attack label name the classes in English", async () => {
    await mountDnd(harness, { locale: "en", extra: ZH_CREATED });
    await openTab("Spells");
    await waitFor(() => expect(document.querySelector('[data-play-casting="start"]')).not.toBeNull());
    const cleric = document.querySelector('[data-play-casting="start"]') as HTMLElement;
    const wizard = document.querySelector('[data-play-casting="wizard"]') as HTMLElement;
    expect(within(cleric).getByText("Cleric")).toBeInTheDocument();
    expect(within(wizard).getByText("Wizard")).toBeInTheDocument();
    expect(within(wizard).getByRole("button", { name: /^Spell Attack · Wizard / })).toBeInTheDocument();
    const row = document.querySelector('[data-play-spell="spell:fire-bolt"]') as HTMLElement;
    expect(row.querySelector('[data-play-casting-class="wizard"]')).toHaveTextContent("Wizard");
    expect(document.body.textContent).not.toMatch(/牧師|法師/);
  });

  it("renders a stored weapon attack in English without changing its saved text", async () => {
    const weapon = { id: "w1", ref: "baseItem:scimitar", origin: "srd", name: zh.ref.baseItem.scimitar, damageDice: "1d6", damageType: tabs.damageType.S,
      notes: [zh.ref.itemProperty.finesse, zh.ref.itemProperty.light].join(" · ") };
    const sheet = await mountDnd(harness, { locale: "en", extra: { weapons: [weapon] } });
    await openTab("Combat");
    const row = document.querySelector("[data-play-weapon]");
    expect(row).toHaveTextContent("Scimitar");
    expect(row).toHaveTextContent("Slashing");
    expect(row).toHaveTextContent("Finesse · Light");
    expect(sheet.data().weapons).toMatchObject([weapon]);
  });

  it("renders the picked option in Features using its saved id, not the Chinese snapshot", async () => {
    const feature = { id: "f1", ref: "subclassFeature:ranger/hunter/hunters-prey-l3", origin: "srd", name: "Prey", option: "Colossus Slayer", optionName: "巨獸殺手" };
    await mountDnd(harness, { locale: "en", extra: { features: [feature] } });
    await openTab("Features");
    expect(await screen.findByText("Hunter's Prey: Colossus Slayer")).toBeInTheDocument();
  });

  it("a background's spell shows its source, not a class", async () => {
    const magicInitiate = { id: "spell_g", ref: "spell:guidance", name: "神導術", level: 0, source: "magic-initiate", origin: "srd", text: "", castingClass: "" };
    await mountDnd(harness, { locale: "en", extra: { ...ZH_CREATED, spells: [magicInitiate] } });
    await openTab("Spells");
    await waitFor(() => expect(document.querySelector('[data-play-spell="spell:guidance"]')).not.toBeNull());
    const row = document.querySelector('[data-play-spell="spell:guidance"]') as HTMLElement;
    expect(row.querySelector("[data-play-casting-class]")).toBeNull();
    expect(row.querySelector('[data-play-spell-source="magic-initiate"]')).toHaveTextContent("Magic Initiate");
  });
});
