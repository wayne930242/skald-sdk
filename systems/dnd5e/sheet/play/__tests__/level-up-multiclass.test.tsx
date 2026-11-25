import zhLevelUp from "@skald/system-dnd5e/data/dnd5e-2024/messages/level-up/zh-TW.json";
import { Suspense, useState } from "react";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { zhWithheld } from "../../../__tests__/zh-withheld";
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

function withLevelUp(openCompendium = vi.fn()): MountOptions["useHost"] {
  return function useLevelUpHost(reference: ReferenceContextValue) {
    const [request, setRequest] = useState<LevelUpRequest | null>(null);
    return {
      playView: { openLevelUp: setRequest, openCompendium },
      dialogs: request && (
        <Suspense fallback={null}>
          <LevelUpDialog request={request} system={harness.system} context={reference} packs={null} onClose={() => setRequest(null)} />
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
  await waitFor(() => expect(dialog.querySelector("[data-level-up-apply]")).not.toBeNull());
  return dialog;
}

/** 新增職業… then the class: waits for its plan. */
async function addClass(dialog: HTMLElement, classId: string) {
  await act(async () => {
    fireEvent.change(within(dialog).getByRole("combobox", { name: "升級職業" }), { target: { value: "add" } });
  });
  const candidate = await waitFor(() => {
    const found = dialog.querySelector(`[data-level-up-candidate='${classId}']`);
    expect(found).not.toBeNull();
    return found as HTMLElement;
  });
  await click(within(candidate).getByRole("radio"));
  await waitFor(() => expect(dialog.querySelector("[data-level-up-apply]")).not.toBeNull());
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
    expect(vi.mocked(toast.warning)).toHaveBeenCalledWith(zhLevelUp.undoKept.replace("{items}", kept));
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
