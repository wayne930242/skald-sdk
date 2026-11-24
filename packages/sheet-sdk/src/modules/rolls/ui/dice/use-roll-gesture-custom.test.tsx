// B-021: a system can bring its own roll options dialog (D&D: advantage, a modifier, extra dice)
// on the same gesture as CoC: a tap rolls at once, a long-press, right-click, Shift+Enter or the
// context-menu key opens the system's dialog. The dialog's module loads on demand (on the first
// press), and the one-time hint's text comes from it, loaded only while the hint is unseen.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { toast } from "sonner";
import en from "@skald/sheet-sdk/messages/en.json";
import {
  useRollGesture,
  type CustomRollOptionsModule,
  type CustomRollOptionsProps,
  type RollControlPayload,
} from "@skald/sheet-sdk/modules/rolls/ui/dice/use-roll-gesture";

vi.mock("sonner", () => ({ toast: vi.fn() }));

const transformExpression = (expression: string) => `${expression}+2`;

function SystemDialog({ open, name, data, onRoll }: CustomRollOptionsProps) {
  return open ? (
    <div role="dialog" aria-label={name}>
      <span>{String(data?.note)}</span>
      <button type="button" onClick={() => onRoll({ bonusDice: 1, transformExpression, macroArgs: { xn: 1, xd: 4 } })}>
        go
      </button>
    </div>
  ) : null;
}

const loadHint = vi.fn((locale: string) => Promise.resolve(`Hold for advantage (${locale})`));
const loadModule = vi.fn((): Promise<CustomRollOptionsModule> => Promise.resolve({ default: SystemDialog, loadHint }));
const load = () => loadModule();

function Harness({ onRoll }: { onRoll: (payload: RollControlPayload) => void }) {
  const { buttonProps, dialog } = useRollGesture({ onRoll, rollName: "Athletics", customOptions: { load, data: { note: "Exhaustion" } } });
  return (
    <>
      <button type="button" aria-label="Roll Athletics" {...buttonProps} />
      {dialog}
    </>
  );
}

function mount() {
  const onRoll = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <Harness onRoll={onRoll} />
    </NextIntlClientProvider>,
  );
  return { onRoll, button: screen.getByRole("button", { name: "Roll Athletics" }) };
}

beforeEach(() => {
  window.localStorage.clear();
  vi.mocked(toast).mockClear();
  loadHint.mockClear();
  loadModule.mockClear();
});
afterEach(cleanup);

describe("useRollGesture with a system's own options dialog", () => {
  it("rolls at once on a tap, then hints once with the text the system's module gives", async () => {
    const { onRoll, button } = mount();
    expect(loadModule).not.toHaveBeenCalled();
    await act(async () => fireEvent.click(button));
    expect(onRoll).toHaveBeenCalledWith({ bonusDice: 0, difficulty: "regular", flatModifier: 0, extraDice: "" });
    expect(screen.queryByRole("dialog")).toBeNull();
    await vi.waitFor(() => expect(toast).toHaveBeenCalledWith("Hold for advantage (en)", expect.anything()));
    await act(async () => fireEvent.click(button));
    expect(loadHint).toHaveBeenCalledTimes(1);
    expect(toast).toHaveBeenCalledTimes(1);
    expect(button).toHaveAttribute("aria-haspopup", "dialog");
    expect(button).toHaveAttribute("aria-keyshortcuts", "Shift+Enter");
  });

  it("loads the system's module on the first press, before a long-press completes", () => {
    const { button } = mount();
    fireEvent.pointerDown(button, { button: 0, clientX: 0, clientY: 0 });
    expect(loadModule).toHaveBeenCalledTimes(1);
    fireEvent.pointerUp(button);
  });

  it.each([
    ["right-click", (button: HTMLElement) => fireEvent.contextMenu(button)],
    ["Shift+Enter", (button: HTMLElement) => fireEvent.keyDown(button, { key: "Enter", shiftKey: true })],
    ["the context-menu key", (button: HTMLElement) => fireEvent.keyDown(button, { key: "ContextMenu" })],
  ])("opens the system's dialog on %s, with the roll's name and data, and rolls its choice", async (_, open) => {
    const { onRoll, button } = mount();
    await act(async () => {
      open(button);
    });
    const dialog = await screen.findByRole("dialog", { name: "Athletics" });
    expect(dialog).toHaveTextContent("Exhaustion");
    expect(onRoll).not.toHaveBeenCalled();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "go" })));
    expect(onRoll).toHaveBeenCalledWith({
      bonusDice: 1,
      difficulty: "regular",
      flatModifier: 0,
      extraDice: "",
      transformExpression,
      macroArgs: { xn: 1, xd: 4 },
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
