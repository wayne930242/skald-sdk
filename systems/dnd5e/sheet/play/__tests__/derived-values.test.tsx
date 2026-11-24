import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { zhWithheld } from "../../../__tests__/zh-withheld";
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { loadDndHarness, mountDnd, openTab, type DndHarness } from "./dnd-harness";

/**
 * B-024 (plan §4.2): every D&D derived value is overridden in its editor with the shared
 * DerivedValue, shown in play with the override mark, and restored with 恢復自動計算. Storage is
 * the template's derived overrides (`onSetDerivedOverride` / `onRefreshDerivedOverride`).
 */
vi.mock("@skald/sheet-sdk/modules/rolls/ui/context/roll-context", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useRollOptional: () => ({ executeRoll: vi.fn(async () => null), nextModifier: 0 }),
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
});

const caster = { classId: "wizard", className: "法師", spellAbility: "int", int: 16, slot1Total: 2 };

async function tap(element: Element) {
  await act(async () => {
    fireEvent.click(element);
  });
}

const vitals = () => document.querySelector("[data-play-vitals]") as HTMLElement;
const mark = (fieldId: string, root: ParentNode = document) => root.querySelector(`[data-derived-overridden='${fieldId}']`);

async function override(fieldId: string, value: number) {
  const input = (await screen.findByRole("dialog")).querySelector(`[data-derived-value='${fieldId}'] input`) as HTMLInputElement;
  expect(input).not.toBeNull();
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: String(value) } });
  await act(async () => {
    fireEvent.blur(input);
  });
}

/** [target tile name, editor field id, value] for the vitals editors. */
const VITALS: Array<[RegExp, string, number]> = [
  [/^編輯護甲等級$/, "ac", 17],
  [/^編輯先攻$/, "initiative", 7],
  [/^編輯速度$/, "currentSpeed", 40],
  [/^編輯被動睿知（感知）$/, "passivePerception", 18],
  [/^編輯生命骰$/, "hitDiceMax", 9],
];

describe("overriding a derived value in its editor", () => {
  it.skipIf(zhWithheld("messages/play/zh-TW.json")).each(VITALS)("%s sets %s", async (name, fieldId, value) => {
    const mounted = await mountDnd(harness, { mode: "edit", extra: caster });
    await tap(within(vitals()).getAllByRole("button", { name })[0]);
    await override(fieldId, value);
    expect(mounted.setOverride).toHaveBeenCalledWith(fieldId, value);
  });

  it.skipIf(zhWithheld("messages/play/zh-TW.json"))("the HP editor sets the HP maximum", async () => {
    const mounted = await mountDnd(harness, { mode: "edit", extra: caster });
    await tap(within(vitals()).getAllByRole("button", { name: "編輯生命值" })[0]);
    await override("hpMax", 30);
    expect(mounted.setOverride).toHaveBeenCalledWith("hpMax", 30);
  });

  it.skipIf(zhWithheld("messages/play-tabs/zh-TW.json", "messages/play/zh-TW.json"))("the spellcasting editor sets the spell save DC and attack", async () => {
    const mounted = await mountDnd(harness, { mode: "edit", extra: caster });
    await openTab("法術");
    await tap(await screen.findByRole("button", { name: "編輯法術豁免 DC" }));
    await override("spellSaveDc", 15);
    await override("spellAttack", 8);
    expect(mounted.setOverride).toHaveBeenCalledWith("spellSaveDc", 15);
    expect(mounted.setOverride).toHaveBeenCalledWith("spellAttack", 8);
  });

  it.skipIf(zhWithheld("messages/play/zh-TW.json"))("the edit parts render the shared DerivedValue for computed ids (saves, skills, spellcasting)", async () => {
    await mountDnd(harness, { mode: "edit", extra: caster });
    for (const id of ["strSave", "athletics", "ac", "hpMax", "initiative"]) {
      expect(document.querySelector(`[data-dnd-play-view] [data-derived-value='${id}']`), id).not.toBeNull();
    }
    await openTab("法術");
    for (const id of ["spellSaveDc", "spellAttack"]) {
      expect(await screen.findByText((_, element) => element?.getAttribute("data-derived-value") === id), id).toBeInTheDocument();
    }
  });
});

describe("an overridden value in play", () => {
  it.skipIf(zhWithheld("messages/play/zh-TW.json"))("shows the override with its mark on the tiles", async () => {
    await mountDnd(harness, {
      mode: "play",
      extra: { ...caster, conditions: ["exhaustion"] },
      overrides: { ac: 17, initiative: 7, currentSpeed: 40, passivePerception: 18, hpMax: 30, hitDiceMax: 9 },
    });
    const bar = vitals();
    expect(bar.querySelector("[data-play-stat='ac']")).toHaveTextContent("17");
    expect(mark("ac", bar)).not.toBeNull();
    expect(within(bar).getByRole("button", { name: /^先攻 \+7/ })).toBeInTheDocument();
    expect(mark("initiative", bar)).not.toBeNull();
    // the override beats the Exhaustion the tile would subtract
    expect(bar.querySelector("[data-play-stat='speed']")).toHaveTextContent("40呎");
    expect(mark("currentSpeed", bar)).not.toBeNull();
    expect(bar.querySelector("[data-play-stat='passive']")).toHaveTextContent("18");
    expect(mark("passivePerception", bar)).not.toBeNull();
    expect(bar.querySelector("[data-play-hp-value]")).toHaveTextContent("/ 30");
    expect(mark("hpMax", bar)).not.toBeNull();
    expect(bar.querySelector("[data-play-hit-dice]")).toHaveTextContent("/9");
    expect(mark("hitDiceMax", bar)).not.toBeNull();
  });

  it.skipIf(zhWithheld("messages/play/zh-TW.json", "messages/zh-TW.json"))("marks an overridden save and skill", async () => {
    await mountDnd(harness, { mode: "play", extra: caster, overrides: { strSave: 7, athletics: 9 } });
    expect(screen.getByRole("button", { name: /^力量豁免 \+7/ })).toBeInTheDocument();
    expect(mark("strSave")).not.toBeNull();
    expect(document.querySelector("[data-play-skill='athletics']")).toHaveTextContent("+9");
    expect(mark("athletics")).not.toBeNull();
  });

  it.skipIf(zhWithheld("messages/play/zh-TW.json"))("marks the spell DC and attack", async () => {
    await mountDnd(harness, { mode: "play", extra: caster, overrides: { spellSaveDc: 15, spellAttack: 8 } });
    await openTab("法術");
    const dc = await screen.findByText((_, element) => element?.getAttribute("data-play-stat") === "spell-dc");
    expect(dc).toHaveTextContent("15");
    expect(mark("spellSaveDc")).not.toBeNull();
    expect(mark("spellAttack")).not.toBeNull();
  });

  it.skipIf(zhWithheld("messages/play/zh-TW.json"))("has no mark without an override", async () => {
    await mountDnd(harness, { mode: "play", extra: caster });
    expect(document.querySelector("[data-derived-overridden]")).toBeNull();
  });
});

describe("恢復自動計算", () => {
  it.skipIf(zhWithheld("messages/play/zh-TW.json"))("clears the override and its mark", async () => {
    const mounted = await mountDnd(harness, { mode: "edit", extra: caster, overrides: { ac: 17 } });
    await tap(within(vitals()).getByRole("button", { name: "編輯護甲等級" }));
    const dialog = await screen.findByRole("dialog");
    await tap(within(dialog).getByRole("button", { name: /恢復自動計算$/ }));
    expect(mounted.refreshOverride).toHaveBeenCalledWith("ac");
    await act(async () => {
      fireEvent.keyDown(dialog, { key: "Escape" });
    });
    await mounted.setMode("play");
    expect(mark("ac")).toBeNull();
  });
});
