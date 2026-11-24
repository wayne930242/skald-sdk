import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { zhWithheld } from "../../../__tests__/zh-withheld";
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { loadDndHarness, mountDnd, openTab, type DndHarness } from "./dnd-harness";
import { PlayRollButton } from "../play-roll-button";

/**
 * B-023 (plan §4.1): in edit mode every roll and play control of the D&D play view opens the
 * value's editor instead; nothing rolls. Rests and Cast are disabled (Q2); pips, conditions and
 * Heroic Inspiration still set their stored value; play mode is unchanged (the T0 pin).
 */
const roll = vi.hoisted(() => ({ executeRoll: vi.fn(async () => ({ rolled: 5, rolls: [5] })) }));
vi.mock("@skald/sheet-sdk/modules/rolls/ui/context/roll-context", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useRollOptional: () => ({ executeRoll: roll.executeRoll, nextModifier: 0 }),
}));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), warning: vi.fn(), dismiss: vi.fn() }) }));
vi.setConfig({ testTimeout: 30_000 });

let harness: DndHarness;
beforeAll(async () => {
  harness = await loadDndHarness();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  roll.executeRoll.mockClear();
});

const sheet = {
  weapons: [{ id: "w1", name: "短弓", ability: "dex", proficient: true, magic: 0, ranged: true, damageDice: "1d6", damageType: "穿刺", ref: "baseItem:shortbow", origin: "srd" }],
  spells: [{ id: "s1", level: 0, name: "火焰箭", ref: "spell:fire-bolt", prepared: true, origin: "srd" }],
  features: [{ id: "f1", name: "回氣", ref: "", origin: "custom", text: "你恢復 1d10 點生命值。" }],
  equipment: [{ id: "e1", qty: 1, name: "鎖子甲", ref: "baseItem:chain-mail", equipped: false, origin: "srd" }],
  spellAbility: "int",
};

async function tap(element: HTMLElement) {
  await act(async () => {
    fireEvent.click(element);
  });
}

/** The editor dialog the tap opened, and its close. */
async function editor(target: string) {
  const dialog = await screen.findByRole("dialog");
  expect(dialog).toHaveAttribute("data-dnd-editor", target);
  return dialog;
}

async function closeDialog() {
  await act(async () => {
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
  });
}

describe("D&D edit mode: taps open editors (wide)", () => {
  it.skipIf(zhWithheld("messages/play/zh-TW.json")).each([
    ["initiative", /^編輯先攻$/],
    ["ac", /^編輯護甲等級$/],
    ["speed", /^編輯速度$/],
    ["passive", /^編輯被動睿知（感知）$/],
  ])("the %s tile", async (target, name) => {
    await mountDnd(harness, { mode: "edit", extra: sheet });
    const vitals = document.querySelector("[data-play-vitals]") as HTMLElement;
    await tap(within(vitals).getByRole("button", { name }));
    await editor(target);
    expect(roll.executeRoll).not.toHaveBeenCalled();
  });

  it.skipIf(zhWithheld("messages/play/zh-TW.json"))("HP −, HP +, the HP value and Temp + all open the HP editor", async () => {
    await mountDnd(harness, { mode: "edit", extra: { ...sheet, hp: { current: 5 } } });
    const vitals = document.querySelector("[data-play-vitals]") as HTMLElement;
    for (const name of [/^編輯生命值$/]) {
      const buttons = within(vitals).getAllByRole("button", { name });
      expect(buttons.length).toBeGreaterThanOrEqual(4);
      for (const button of buttons) {
        await tap(button);
        await editor("hp");
        await closeDialog();
      }
    }
    expect(roll.executeRoll).not.toHaveBeenCalled();
  });

  it.skipIf(zhWithheld("messages/play/zh-TW.json"))("使用生命骰 opens the hit dice editor and spends nothing", async () => {
    const mounted = await mountDnd(harness, { mode: "edit", extra: sheet });
    await tap(screen.getByRole("button", { name: "編輯生命骰" }));
    await editor("hitDice");
    expect(roll.executeRoll).not.toHaveBeenCalled();
    expect(mounted.data().hitDiceSpent ?? 0).toBe(0);
  });

  it.skipIf(zhWithheld("messages/play/zh-TW.json"))("the death save roll opens the death saves editor", async () => {
    await mountDnd(harness, { mode: "edit", extra: { ...sheet, hp: { current: 0 } } });
    await tap(screen.getByRole("button", { name: "編輯死亡豁免" }));
    await editor("deathSaves");
    expect(roll.executeRoll).not.toHaveBeenCalled();
  });

  it.skipIf(zhWithheld("messages/play/zh-TW.json"))("death pips, Heroic Inspiration and conditions still set their value", async () => {
    const mounted = await mountDnd(harness, { mode: "edit", extra: { ...sheet, hp: { current: 0 } } });
    await tap(screen.getByRole("button", { name: "成功 1" }));
    expect(mounted.data().deathSuccesses).toBe(1);
    const inspiration = screen.getAllByRole("button", { pressed: false }).find((button) => button.textContent?.includes("激勵"))!;
    await tap(inspiration);
    expect(mounted.data().heroicInspiration).toBe(true);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it.skipIf(zhWithheld("messages/play/zh-TW.json"))("disables the rests (Q2)", async () => {
    await mountDnd(harness, { mode: "edit", extra: sheet });
    expect(screen.getByRole("button", { name: "短休" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "長休" })).toBeDisabled();
  });

  it.skipIf(zhWithheld("messages/edit/zh-TW.json", "messages/play-tabs/zh-TW.json", "messages/play/zh-TW.json"))("a weapon's attack and damage open the row's fields", async () => {
    await mountDnd(harness, { mode: "edit", extra: sheet });
    await openTab("戰鬥");
    await tap(screen.getByRole("button", { name: "編輯短弓命中" }));
    expect(await screen.findByRole("dialog", { name: "編輯短弓" })).toBeInTheDocument();
    await closeDialog();
    await tap(screen.getByRole("button", { name: "編輯短弓傷害" }));
    expect(await screen.findByRole("dialog", { name: "編輯短弓" })).toBeInTheDocument();
    expect(roll.executeRoll).not.toHaveBeenCalled();
  });

  it.skipIf(zhWithheld("messages/edit/zh-TW.json", "messages/play-tabs/zh-TW.json", "messages/play/zh-TW.json", "messages/zh-TW.json"))("a spell's attack opens spellcasting, its damage the spell's fields; the DC and attack tiles open spellcasting", async () => {
    await mountDnd(harness, { mode: "edit", extra: sheet });
    await openTab("法術");
    await tap(await screen.findByRole("button", { name: "編輯火焰箭命中" }));
    await editor("spellcasting");
    await closeDialog();
    await tap(screen.getByRole("button", { name: "編輯火焰箭傷害" }));
    expect(await screen.findByRole("dialog", { name: "編輯火焰箭" })).toBeInTheDocument();
    await closeDialog();
    await tap(screen.getByRole("button", { name: "編輯法術豁免 DC" }));
    await editor("spellcasting");
    await closeDialog();
    await tap(screen.getByRole("button", { name: "編輯法術攻擊" }));
    await editor("spellcasting");
    expect(roll.executeRoll).not.toHaveBeenCalled();
  });

  it.skipIf(zhWithheld("messages/play-tabs/zh-TW.json", "messages/play/zh-TW.json"))("disables Cast (Q2)", async () => {
    await mountDnd(harness, {
      mode: "edit",
      extra: { ...sheet, slot1Total: 2, spells: [...sheet.spells, { id: "s2", level: 1, name: "魔法飛彈", ref: "spell:magic-missile", prepared: true, source: "class", origin: "srd" }] },
    });
    await openTab("法術");
    expect(await screen.findByRole("button", { name: /^施放/ })).toBeDisabled();
  });

  it.skipIf(zhWithheld("messages/edit/zh-TW.json", "messages/play/zh-TW.json"))("a feature's dice open the row's text", async () => {
    await mountDnd(harness, { mode: "edit", extra: sheet });
    await openTab("特性");
    await tap(await screen.findByRole("button", { name: "編輯回氣 1d10" }));
    expect(await screen.findByRole("dialog", { name: "編輯回氣的文字" })).toBeInTheDocument();
    expect(roll.executeRoll).not.toHaveBeenCalled();
  });

  it.skipIf(zhWithheld("messages/economy/zh-TW.json", "messages/play/zh-TW.json", "messages/zh-TW.json"))("the equip switch opens the item's settings and equips nothing", async () => {
    const mounted = await mountDnd(harness, { mode: "edit", extra: sheet });
    await openTab("物品");
    // in edit mode it is a button to the settings, named as every edit tap is
    expect(screen.queryByRole("switch", { name: /鎖子甲/ })).toBeNull();
    const button = await screen.findByRole("button", { name: "編輯鎖子甲" }, { timeout: 10_000 });
    expect(button).toHaveAttribute("aria-haspopup", "dialog");
    await tap(button);
    expect(await screen.findByRole("dialog", { name: "設定鎖子甲" })).toBeInTheDocument();
    expect((mounted.data().equipment as Array<Record<string, unknown>>)[0].equipped).toBe(false);
  });
});

describe("D&D edit mode (compact)", () => {
  it.skipIf(zhWithheld("messages/play/zh-TW.json"))("the hit dice tile opens the hit dice editor", async () => {
    await mountDnd(harness, { mode: "edit", extra: sheet, width: 390 });
    await tap(screen.getByRole("button", { name: "編輯生命骰" }));
    await editor("hitDice");
  });
});

describe("D&D play mode", () => {
  it.skipIf(zhWithheld("messages/play/zh-TW.json"))("still rolls initiative", async () => {
    await mountDnd(harness, { mode: "play", extra: sheet });
    await tap(screen.getByRole("button", { name: /^先攻 / }));
    expect(roll.executeRoll).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it.skipIf(zhWithheld("messages/play/zh-TW.json"))("on a read-only host rolls work and nothing writes", async () => {
    const mounted = await mountDnd(harness, { mode: "play", editable: false, extra: sheet });
    await tap(screen.getByRole("button", { name: /^先攻 / }));
    expect(roll.executeRoll).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "失去1點生命值" })).toBeDisabled();
    expect(mounted.data().hp).toBe(mounted.data().hp);
  });

  it("PlayRollButton requires an edit target", () => {
    // @ts-expect-error onEdit is required (B-023: every roll button names what edit mode opens)
    const element = <PlayRollButton roll={undefined} data={{}} label="x">x</PlayRollButton>;
    expect(element).toBeTruthy();
  });
});
