import type { ReactNode } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { zhWithheld } from "../../../__tests__/zh-withheld";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { toast } from "sonner";
import appZh from "@skald/sheet-sdk/messages/zh-TW.json";
import { loadDndHarness, mountDnd, openTab, type DndHarness } from "./dnd-harness";

/**
 * B-024 (plan §4.3): what the D&D sheet recalculates after equipping, an item's +N, and leaving
 * edit mode after a level or ability score change, in the shared notice (Q7 replaces
 * 「AC 已依裝備更新」). An override whose auto value moved keeps its value and offers 恢復自動計算.
 */
vi.mock("@skald/sheet-sdk/modules/rolls/ui/context/roll-context", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useRollOptional: () => ({ executeRoll: vi.fn(async () => null), nextModifier: 0 }),
}));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(() => "toast-1"), { success: vi.fn(), error: vi.fn(), warning: vi.fn(), dismiss: vi.fn() }) }));
vi.setConfig({ testTimeout: 30_000 });

let harness: DndHarness;
beforeAll(async () => {
  harness = await loadDndHarness();
});
beforeEach(() => {
  vi.mocked(toast).mockClear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const toastMock = vi.mocked(toast);
const notices = () => toastMock.mock.calls.filter(([title]) => title === "已重新計算");

/** The last recalc notice's rows, rendered on their own. */
function lastNotice() {
  const calls = notices();
  expect(calls.length).toBeGreaterThan(0);
  const [, options] = calls.at(-1) as unknown as [string, { description: ReactNode }];
  const view = render(<NextIntlClientProvider locale="zh-TW" messages={appZh} timeZone="UTC">{options.description}</NextIntlClientProvider>);
  return within(view.container.querySelector("[data-recalc-notice]") as HTMLElement);
}

const fighter = {
  str: 15, dex: 12,
  equipment: [
    { id: "e1", qty: 1, name: "鍊甲", ref: "baseItem:chain-mail", equipped: false, origin: "srd" },
    { id: "e2", qty: 1, name: "盾牌", ref: "baseItem:shield", equipped: true, origin: "srd" },
  ],
  shield: true,
};

async function tap(element: Element) {
  await act(async () => {
    fireEvent.click(element);
  });
}

describe("equipping", () => {
  it.skipIf(zhWithheld("messages/play/zh-TW.json", "messages/zh-TW.json"))("shows the AC it recalculated", async () => {
    await mountDnd(harness, { mode: "play", extra: fighter });
    await openTab("物品");
    await tap(await screen.findByRole("switch", { name: /^鍊甲/ }, { timeout: 10_000 }));
    await waitFor(() => expect(notices()).toHaveLength(1));
    expect(lastNotice().getByText(/^護甲等級：\d+ → 18$/)).toBeInTheDocument();
    expect(toast.success).not.toHaveBeenCalledWith("AC 已依裝備更新");
  });

  it.skipIf(zhWithheld("messages/play/zh-TW.json", "messages/zh-TW.json"))("keeps an AC override and offers to restore it", async () => {
    const mounted = await mountDnd(harness, { mode: "play", extra: fighter, overrides: { ac: 20 } });
    await openTab("物品");
    await tap(await screen.findByRole("switch", { name: /^鍊甲/ }, { timeout: 10_000 }));
    await waitFor(() => expect(notices()).toHaveLength(1));
    const notice = lastNotice();
    expect(notice.getByText(/^護甲等級維持覆寫 20（自動計算 \d+ → 18）$/)).toBeInTheDocument();
    fireEvent.click(notice.getByRole("button", { name: "恢復自動計算" }));
    expect(mounted.refreshOverride).toHaveBeenCalledWith("ac");
  });

  it.skipIf(zhWithheld("messages/economy/zh-TW.json", "messages/play/zh-TW.json", "messages/zh-TW.json"))("recalculates after a worn shield's +1 in its settings", async () => {
    await mountDnd(harness, { mode: "play", extra: fighter });
    await openTab("物品");
    await tap(await screen.findByRole("button", { name: "設定盾牌" }, { timeout: 10_000 }));
    const dialog = await screen.findByRole("dialog", { name: "設定盾牌" });
    fireEvent.change(within(dialog).getByLabelText("魔法加值（+N）"), { target: { value: "1" } });
    await tap(within(dialog).getByRole("button", { name: "儲存" }));
    await waitFor(() => expect(notices()).toHaveLength(1));
    expect(lastNotice().getByText(/^護甲等級：(\d+) → \d+$/)).toBeInTheDocument();
  });
});

describe("leaving edit mode", () => {
  it.skipIf(zhWithheld("messages/play/zh-TW.json", "messages/zh-TW.json"))("after a level change lists the HP maximum and the proficiency bonus", async () => {
    const mounted = await mountDnd(harness, { mode: "play", extra: fighter });
    await mounted.setMode("edit");
    await mounted.setRemote({ level: 5 });
    await mounted.setMode("play");
    await waitFor(() => expect(notices()).toHaveLength(1));
    const notice = lastNotice();
    expect(notice.getByText(/^生命值上限：\d+ → \d+$/)).toBeInTheDocument();
    expect(notice.getByText("熟練加值：+2 → +3")).toBeInTheDocument();
  });

  it.skipIf(zhWithheld("messages/play/zh-TW.json"))("stays quiet when only a non-trigger input changed", async () => {
    const mounted = await mountDnd(harness, { mode: "play", extra: fighter });
    await mounted.setMode("edit");
    await mounted.setRemote({ acMisc: 1 });
    await mounted.setMode("play");
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(notices()).toHaveLength(0);
  });

  it.skipIf(zhWithheld("messages/play/zh-TW.json", "messages/zh-TW.json"))("never prompts on a read-only sheet", async () => {
    const mounted = await mountDnd(harness, { mode: "play", editable: false, extra: fighter });
    await mounted.setMode("edit");
    await mounted.setRemote({ level: 5 });
    await mounted.setMode("play");
    await openTab("物品");
    expect(await screen.findByRole("switch", { name: /^鍊甲/ }, { timeout: 10_000 })).toBeDisabled();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(notices()).toHaveLength(0);
  });
});
