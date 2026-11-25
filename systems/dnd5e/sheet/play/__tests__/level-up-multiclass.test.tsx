import zhLevelUp from "@skald/system-dnd5e/data/dnd5e-2024/messages/level-up/zh-TW.json";
import { Suspense, useState } from "react";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { zhWithheld } from "../../../__tests__/zh-withheld";
import type { EffectivePacks, PackEntry } from "../../../content-pack/domain/types";
import { LevelUpDialog } from "../../level-up/level-up-dialog";
import type { ReferenceContextValue } from "../../use-reference-context";
import type { LevelUpRequest } from "../play-context";
import { loadDndHarness, mountDnd, openTab, type DndHarness, type MountOptions } from "./dnd-harness";

/** The level-up helper's multiclass UI (CLASS-IMPL §7.4; slice M4) on the real play view and template. */

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(() => "toast-1"), { success: vi.fn(), error: vi.fn(), warning: vi.fn(), dismiss: vi.fn() }) }));
vi.setConfig({ testTimeout: 30_000 });

let harness: DndHarness;
beforeAll(async () => {
  harness = await loadDndHarness();
});
beforeEach(() => {
  vi.mocked(toast).mockClear();
  vi.mocked(toast.success).mockClear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

type Row = Record<string, unknown>;

function withLevelUp(openCompendium = vi.fn(), packs: EffectivePacks | null = null): MountOptions["useHost"] {
  return function useLevelUpHost(reference: ReferenceContextValue) {
    const [request, setRequest] = useState<LevelUpRequest | null>(null);
    return {
      playView: { openLevelUp: setRequest, openCompendium },
      dialogs: request && (
        <Suspense fallback={null}>
          <LevelUpDialog request={request} system={harness.system} context={reference} packs={packs} onClose={() => setRequest(null)} />
        </Suspense>
      ),
    };
  };
}

async function click(element: Element) {
  await act(async () => {
    fireEvent.click(element);
  });
}

async function openLevelUp(name = "升級") {
  await click(screen.getByRole("button", { name }));
  const dialog = await screen.findByRole("dialog", { name });
  // The form is in once its plan loaded: the footer shows from the start.
  await waitFor(() => expect(dialog.querySelector("[data-level-up-hp]")).not.toBeNull());
  return dialog;
}

/** 新增職業… then the class: waits for its plan. */
async function addClass(dialog: HTMLElement, classId: string, label = "升級職業") {
  await act(async () => {
    fireEvent.change(within(dialog).getByRole("combobox", { name: label }), { target: { value: "add" } });
  });
  const candidate = await waitFor(() => {
    const found = dialog.querySelector(`[data-level-up-candidate='${classId}']`);
    expect(found).not.toBeNull();
    return found as HTMLElement;
  });
  await click(within(candidate).getByRole("radio"));
  // The form is in once its plan loaded: the footer shows from the start.
  await waitFor(() => expect(dialog.querySelector("[data-level-up-hp]")).not.toBeNull());
  return candidate;
}

const fighter5 = { level: 5, str: 15, hitDieFaces: 10, features: [] };
const zhSheet = zhWithheld("messages/zh-TW.json", "messages/play/zh-TW.json");

describe("level-up helper multiclass UI (CLASS-IMPL §7.4)", () => {
  it.skipIf(zhSheet)("a single-class sheet sees one screen with 戰士 5 → 6 and 新增職業…", async () => {
    await mountDnd(harness, { extra: fighter5, useHost: withLevelUp() });
    const dialog = await openLevelUp();
    const select = within(dialog).getByRole("combobox", { name: "升級職業" }) as HTMLSelectElement;
    expect(select.selectedOptions[0]).toHaveTextContent("戰士 5 → 6");
    expect([...select.options].map((option) => option.textContent)).toEqual(["戰士 5 → 6", "新增職業…"]);
    expect(dialog.querySelector("[data-level-up-class-picker]")).toBeNull();
    expect(dialog.querySelector("[data-level-up-features]")).not.toBeNull();
  });

  it.skipIf(zhSheet)("新增職業 lists 法師 with 需要 智力 13（目前 10）at INT 10", async () => {
    await mountDnd(harness, { extra: { ...fighter5, int: 10 }, useHost: withLevelUp() });
    const dialog = await openLevelUp();
    await act(async () => {
      fireEvent.change(within(dialog).getByRole("combobox", { name: "升級職業" }), { target: { value: "add" } });
    });
    const wizard = dialog.querySelector("[data-level-up-candidate='wizard']")!;
    expect(wizard).toHaveTextContent("法師");
    expect(wizard.querySelector("[data-level-up-prerequisite]")).toHaveTextContent("需要 智力 13（目前 10）");
    expect(dialog.querySelector("[data-level-up-candidate='fighter']")).toBeNull();
  });

  it("shows the Fighter alternatives together in the badge and alert", async () => {
    await mountDnd(harness, { locale: "en", extra: { ...fighter5, className: "Fighter", str: 10, dex: 11, int: 14 }, useHost: withLevelUp() });
    const dialog = await openLevelUp("Level up");
    fireEvent.change(within(dialog).getByRole("combobox", { name: "Class" }), { target: { value: "add" } });
    const wizard = dialog.querySelector<HTMLElement>("[data-level-up-candidate='wizard']")!;
    const requirement = "Needs Strength or Dexterity 13 (now 10/11)";
    expect(wizard.querySelector("[data-level-up-prerequisite]")).toHaveTextContent(requirement);
    await click(within(wizard).getByRole("radio"));
    await waitFor(() => expect(dialog.querySelector("[data-level-up-prerequisites]")).toHaveTextContent(requirement));
  });

  it("keeps Cancel, Apply and the DM override in reach with 14 classes: one scrolling body, the footer outside it", async () => {
    const homebrew = (id: string, name: string): PackEntry => ({ kind: "class", id, ref: `class:${id}`, name, entries: [], meta: { hitDie: 8, primaryAbility: ["cha"] } });
    const packs: EffectivePacks = {
      content: { entries: [homebrew("ash-warden", "Ash Warden"), homebrew("ember-sage", "Ember Sage")], overlays: {}, wizard: {}, zhTW: {} },
      keys: ["homebrew"], supplier: { "class:ash-warden": "homebrew", "class:ember-sage": "homebrew" }, aliases: {}, shadowed: {},
    };
    await mountDnd(harness, { locale: "en", packs, extra: { ...fighter5, className: "Fighter", int: 10 }, useHost: withLevelUp(vi.fn(), packs) });
    const dialog = await openLevelUp("Level up");
    expect(dialog.className).toMatch(/max-h-\[90dvh\]/);
    expect(dialog.className).toMatch(/\bflex-col\b/);
    await act(async () => {
      fireEvent.change(within(dialog).getByRole("combobox", { name: "Class" }), { target: { value: "add" } });
    });
    let body = dialog.querySelector<HTMLElement>("[data-level-up-body]")!;
    let footer = dialog.querySelector<HTMLElement>("[data-level-up-footer]")!;
    expect(body.className).toEqual(expect.stringContaining("overflow-y-auto"));
    expect(body.className).toEqual(expect.stringContaining("min-h-0"));
    expect(body.className).toEqual(expect.stringContaining("flex-1"));
    // 12 built-in and 2 homebrew classes; the sheet's Fighter is not offered. Built-in in the game's order, homebrew after a divider.
    expect([...body.querySelectorAll("[data-level-up-candidate]")].map((row) => row.getAttribute("data-level-up-candidate"))).toEqual([
      "barbarian", "bard", "cleric", "druid", "monk", "paladin", "ranger", "rogue", "sorcerer", "warlock", "wizard", "ash-warden", "ember-sage",
    ]);
    expect(body.querySelector("[data-level-up-candidate='ash-warden']")?.className).toMatch(/border-t/);
    expect(body.querySelector("[data-level-up-candidate='ember-sage']")?.className).not.toMatch(/border-t/);
    expect(body.contains(footer)).toBe(false);
    expect(footer.parentElement).toBe(dialog);
    expect(within(footer).getByRole("button", { name: "Apply" })).toBeDisabled();
    expect(footer.querySelector("[data-level-up-blocked]")).toHaveTextContent("Choose a class to add first.");
    expect(within(footer).getByRole("button", { name: "Cancel" })).toBeEnabled();

    await click(within(body.querySelector("[data-level-up-candidate='wizard']")!).getByRole("radio"));
    await waitFor(() => expect(dialog.querySelector("[data-level-up-hp]")).not.toBeNull());
    body = dialog.querySelector<HTMLElement>("[data-level-up-body]")!;
    footer = dialog.querySelector<HTMLElement>("[data-level-up-footer]")!;
    expect(body.contains(footer)).toBe(false);
    expect(body.querySelector("[data-level-up-hp]")).not.toBeNull();
    // The list folds to the chosen class; 更換 brings it back.
    expect(body.querySelectorAll("[data-level-up-candidate]")).toHaveLength(0);
    expect(body.querySelector("[data-level-up-picked='wizard']")).toHaveTextContent("Wizard");
    const override = within(body).getByRole("checkbox", { name: "The DM allows it, add anyway" });
    const apply = within(footer).getByRole("button", { name: "Apply" });
    expect(apply).toBeDisabled();
    expect(apply).toHaveAttribute("aria-describedby", "level-up-blocked");
    expect(footer.querySelector("[data-level-up-blocked]")).toHaveTextContent("The ability requirement is not met");
    await click(override);
    expect(apply).toBeEnabled();
    expect(footer.querySelector("[data-level-up-blocked]")).toBeNull();
    await click(within(body).getByRole("button", { name: "Change" }));
    expect(dialog.querySelectorAll("[data-level-up-body] [data-level-up-candidate]")).toHaveLength(13);
  });

  it("adding Cleric asks Protector or Thaumaturge in a radio group and adds only the pick", async () => {
    const sheet = await mountDnd(harness, { locale: "en", extra: { ...fighter5, className: "Fighter", wis: 14 }, useHost: withLevelUp() });
    const dialog = await openLevelUp("Level up");
    await act(async () => {
      fireEvent.change(within(dialog).getByRole("combobox", { name: "Class" }), { target: { value: "add" } });
    });
    await click(within(dialog.querySelector("[data-level-up-candidate='cleric']")!).getByRole("radio"));
    await waitFor(() => expect(dialog.querySelector("[data-level-up-hp]")).not.toBeNull());
    const order = within(dialog).getByRole("radiogroup", { name: "Divine Order: choose one" });
    expect(within(order).getAllByRole("radio").map((radio) => radio.getAttribute("value"))).toEqual([
      "classFeature:cleric/protector-l1", "classFeature:cleric/thaumaturge-l1", "",
    ]);
    expect(within(order).getByRole("radio", { name: "Choose later" })).toBeChecked();
    expect(within(dialog).queryByRole("checkbox", { name: "Protector" })).toBeNull();
    await click(within(order).getByRole("radio", { name: "Protector" }));
    await click(within(dialog).getByRole("button", { name: "Apply" }));
    const refs = (sheet.data().features as Row[]).map((row) => row.ref);
    expect(refs).toContain("classFeature:cleric/divine-order-l1");
    expect(refs).toContain("classFeature:cleric/protector-l1");
    expect(refs).not.toContain("classFeature:cleric/thaumaturge-l1");
  });

  it("lists each unmet score once in one locale-joined line (Paladin at STR 10, CHA 8)", async () => {
    await mountDnd(harness, { locale: "en", extra: { ...fighter5, className: "Fighter", str: 10, dex: 13, cha: 8 }, useHost: withLevelUp() });
    const dialog = await openLevelUp("Level up");
    fireEvent.change(within(dialog).getByRole("combobox", { name: "Class" }), { target: { value: "add" } });
    const paladin = dialog.querySelector<HTMLElement>("[data-level-up-candidate='paladin']")!;
    expect(paladin.querySelector("[data-level-up-prerequisite]")).toHaveTextContent(/^Needs Strength 13, Charisma 13 \(now 10\/8\)$/);
  });

  it.skipIf(zhSheet)("joins unmet scores with 、 in zh-TW: 需要 力量 13、魅力 13（目前 10／8）", async () => {
    await mountDnd(harness, { extra: { ...fighter5, str: 10, dex: 13, cha: 8 }, useHost: withLevelUp() });
    const dialog = await openLevelUp();
    fireEvent.change(within(dialog).getByRole("combobox", { name: "升級職業" }), { target: { value: "add" } });
    expect(dialog.querySelector("[data-level-up-candidate='paladin'] [data-level-up-prerequisite]")).toHaveTextContent(/^需要 力量 13、魅力 13（目前 10／8）$/);
  });

  it("adding Monk puts Unarmored Defense in its own Armor Class section", async () => {
    await mountDnd(harness, { locale: "en", extra: { ...fighter5, className: "Fighter", dex: 13, wis: 13 }, useHost: withLevelUp() });
    const dialog = await openLevelUp("Level up");
    await addClass(dialog, "monk", "Class");
    const section = dialog.querySelector<HTMLElement>("[data-level-up-armor-class]")!;
    expect(within(section).getByRole("heading", { name: "Armor Class" })).toBeInTheDocument();
    expect(section.querySelector("[data-level-up-unarmored]")).not.toBeNull();
    expect(dialog.querySelector("[data-level-up-gains] [data-level-up-unarmored]")).toBeNull();
  });

  it("adding Cleric counts the cleric's prepared spells, not the sheet's background spells", async () => {
    const spells = [{ id: "s1", name: "Bless", level: 1, prepared: true, source: "magic-initiate", castingClass: "" }];
    await mountDnd(harness, { locale: "en", extra: { ...fighter5, className: "Fighter", wis: 13, spells }, useHost: withLevelUp() });
    const dialog = await openLevelUp("Level up");
    await addClass(dialog, "cleric", "Class");
    expect(dialog.querySelector("[data-level-up-spells]")).toHaveTextContent("Prepared spells 0 → 4 (on the sheet: 0)");
  });

  it.skipIf(zhSheet)("an unmet prerequisite blocks apply until 「DM 同意，仍要加入」 is ticked", async () => {
    const sheet = await mountDnd(harness, { extra: { ...fighter5, int: 10 }, useHost: withLevelUp() });
    const dialog = await openLevelUp();
    await addClass(dialog, "wizard");
    expect(dialog.querySelector("[data-level-up-prerequisites]")).toHaveTextContent("需要 智力 13（目前 10）");
    const apply = within(dialog).getByRole("button", { name: "套用" });
    expect(apply).toBeDisabled();
    await click(within(dialog).getByRole("checkbox", { name: "DM 同意，仍要加入" }));
    expect(apply).toBeEnabled();
    await click(apply);
    expect(sheet.data()).toMatchObject({ level: 6 });
    expect((sheet.data().multiclass as Row[]).map((row) => row.classId)).toEqual(["wizard"]);
  });

  it.skipIf(zhSheet)("adding 法師 at INT 14 writes the row and level 6; 復原 removes the row", async () => {
    const openCompendium = vi.fn();
    const sheet = await mountDnd(harness, { extra: { ...fighter5, str: 15, int: 14 }, useHost: withLevelUp(openCompendium) });
    const dialog = await openLevelUp();
    await addClass(dialog, "wizard");
    expect(dialog.querySelector("[data-level-up-prerequisites]")).toBeNull();
    expect(dialog.querySelector("[data-level-up-character-level]")).toHaveTextContent("角色等級 5 → 6");
    await click(within(dialog).getByRole("button", { name: "套用" }));

    const after = sheet.data();
    expect(after).toMatchObject({ level: 6, hpClassAdjust: -2, slot1Total: 2 });
    expect(after.multiclass).toEqual([expect.objectContaining({ classId: "wizard", level: 1, hitDie: 6, name: "法師" })]);
    expect((after.features as Row[]).map((row) => row.ref)).toContain("classFeature:wizard/spellcasting-l1");

    await click(within(dialog).getByRole("button", { name: zhLevelUp.result.spells }));
    expect(openCompendium).toHaveBeenCalledWith(expect.any(Function), expect.anything(), {
      tab: "spells", classId: "wizard", castingClassOf: { wizard: "wizard" },
    });

    const [message, options] = vi.mocked(toast.success).mock.calls.find(([title]) => title === "已升到 6 級") as unknown as [string, { action: { label: string; onClick: () => void } }];
    expect(message).toBe("已升到 6 級");
    expect(options.action.label).toBe("復原");
    await act(async () => options.action.onClick());
    expect(sheet.data()).toMatchObject({ level: 5, multiclass: [] });
  });

  it.skipIf(zhSheet)("復原 keeps an added class row edited since, with the total level, and names it in the kept toast", async () => {
    const sheet = await mountDnd(harness, { extra: { ...fighter5, str: 15, int: 14 }, useHost: withLevelUp() });
    const dialog = await openLevelUp();
    await addClass(dialog, "wizard");
    await click(within(dialog).getByRole("button", { name: "套用" }));
    const row = (sheet.data().multiclass as Row[])[0];
    await sheet.setRemote({ multiclass: [{ ...row, hitDiceSpent: 1 }] });
    vi.mocked(toast.warning).mockClear();
    const [, options] = vi.mocked(toast.success).mock.calls.find(([title]) => title === "已升到 6 級") as unknown as [string, { action: { onClick: () => void } }];
    await act(async () => options.action.onClick());
    await act(async () => {});
    expect(sheet.data()).toMatchObject({ level: 6, hpClassAdjust: -2 });
    expect(sheet.data().multiclass).toEqual([expect.objectContaining({ id: row.id, hitDiceSpent: 1 })]);
    const kept = zhLevelUp.multiclass.keptRow.replace("{name}", "法師");
    expect(vi.mocked(toast.warning)).toHaveBeenCalledWith(zhLevelUp.undone, expect.objectContaining({ description: zhLevelUp.undoKept.replace("{items}", kept) }));
  });

  it.skipIf(zhSheet)("adding 遊蕩者 writes the picked skill and the Thieves' Tools row", async () => {
    const sheet = await mountDnd(harness, { extra: { ...fighter5, dex: 14 }, useHost: withLevelUp() });
    const dialog = await openLevelUp();
    await addClass(dialog, "rogue");
    const gains = dialog.querySelector("[data-level-up-gains]") as HTMLElement;
    expect(gains).toHaveTextContent("多職業不會獲得豁免熟練");
    await click(within(gains).getByRole("checkbox", { name: "隱匿" }));
    await click(within(dialog).getByRole("button", { name: "套用" }));
    const after = sheet.data();
    expect(after).toMatchObject({ level: 6, stealthProf: "proficient" });
    expect((after.multiclass as Row[])[0]).toMatchObject({ classId: "rogue", level: 1 });
    expect((after.toolProficiencies as Row[]).some((row) => typeof row.ref === "string" && row.ref.includes("thieves"))).toBe(true);
  });

  it.skipIf(zhSheet)("advancing a class row raises the row and the character level", async () => {
    const row = { id: "class-w", classId: "wizard", ref: "class:wizard", name: "法師", subclass: "", level: 1, hitDie: 6, hitDiceSpent: 0, spellAbility: "int" };
    const sheet = await mountDnd(harness, { extra: { ...fighter5, level: 6, int: 14, multiclass: [row] }, useHost: withLevelUp() });
    const dialog = await openLevelUp();
    const select = within(dialog).getByRole("combobox", { name: "升級職業" }) as HTMLSelectElement;
    expect([...select.options].map((option) => option.textContent)).toEqual(["戰士 5 → 6", "法師 1 → 2", "新增職業…"]);
    await act(async () => {
      fireEvent.change(select, { target: { value: "advance:wizard" } });
    });
    await waitFor(() => expect(dialog.querySelector("[data-level-up-character-level]")).toHaveTextContent("角色等級 6 → 7"));
    await click(within(dialog).getByRole("button", { name: "套用" }));
    expect(sheet.data()).toMatchObject({ level: 7 });
    expect((sheet.data().multiclass as Row[])[0]).toMatchObject({ level: 2 });
  });

  it.skipIf(zhSheet)("the 角色 tab shows 戰士 5 / 法師 1", async () => {
    const row = { id: "class-w", classId: "wizard", ref: "class:wizard", name: "法師", subclass: "", level: 1, hitDie: 6, hitDiceSpent: 0, spellAbility: "int" };
    await mountDnd(harness, { extra: { ...fighter5, level: 6, multiclass: [row] } });
    await openTab("角色");
    expect(screen.getByText(/戰士 5 \/ 法師 1/)).toBeInTheDocument();
  });

  it("the Character tab shows Fighter 5 / Wizard 1 in English", async () => {
    const row = { id: "class-w", classId: "wizard", ref: "class:wizard", name: "Wizard", subclass: "", level: 1, hitDie: 6, hitDiceSpent: 0, spellAbility: "int" };
    await mountDnd(harness, { locale: "en", extra: { ...fighter5, className: "Fighter", level: 6, multiclass: [row] } });
    await openTab("Character");
    expect(screen.getByText(/Fighter 5 \/ Wizard 1/)).toBeInTheDocument();
  });
});
