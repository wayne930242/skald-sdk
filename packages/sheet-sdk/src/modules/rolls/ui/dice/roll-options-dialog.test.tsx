// A sheet roll control: a tap rolls at once (Regular, no bonus/penalty dice); a long-press,
// a right-click, Shift+Enter or the context-menu key opens a dialog to pick bonus/penalty
// dice and the declared difficulty. Nothing appears on hover. After the first roll a
// one-time hint tells the user about the long-press.
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { toast } from "sonner";
import en from "@skald/sheet-sdk/messages/en.json";
import zh from "@skald/sheet-sdk/messages/zh-TW.json";
import { RollControl } from "@skald/sheet-sdk/modules/rolls/ui/dice/roll-control";
import { ROLL_OPTIONS_HINT_KEY } from "./roll-options-hint";

vi.mock("sonner", () => ({ toast: vi.fn() }));

const HINT_EN =
  "Press and hold or right-click for difficulty and bonus or penalty dice.";

function renderControl(
  props: Partial<React.ComponentProps<typeof RollControl>> = {},
  locale: "en" | "zh-TW" = "en",
) {
  const onRoll = vi.fn();
  render(
    <NextIntlClientProvider locale={locale} messages={locale === "en" ? en : zh} timeZone="UTC">
      <RollControl
        ariaLabel="Roll Soothe"
        rollName="Soothe"
        targetValue={10}
        variant="inline"
        controls={{ cocBonusDice: true, cocDifficulty: true }}
        onRoll={onRoll}
        {...props}
      />
    </NextIntlClientProvider>,
  );
  return { onRoll, button: screen.getByRole("button", { name: props.ariaLabel ?? "Roll Soothe" }) };
}

const regular = { bonusDice: 0, difficulty: "regular", flatModifier: 0, extraDice: "" };

beforeEach(() => {
  window.localStorage.clear();
  vi.mocked(toast).mockClear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("tap", () => {
  it("rolls at once with Regular difficulty and no bonus/penalty dice", async () => {
    const { onRoll, button } = renderControl();
    await act(async () => {
      fireEvent.click(button);
    });
    expect(onRoll).toHaveBeenCalledTimes(1);
    expect(onRoll).toHaveBeenCalledWith(regular);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Enter rolls at once too", async () => {
    const { onRoll, button } = renderControl();
    await act(async () => {
      fireEvent.keyDown(button, { key: "Enter" });
    });
    expect(onRoll).toHaveBeenCalledWith(regular);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows nothing on hover", () => {
    const { button } = renderControl();
    fireEvent.mouseEnter(button);
    fireEvent.pointerEnter(button);
    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(screen.queryByRole("group")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("opening the roll options", () => {
  it("right-click opens the dialog, titled with the name and target value, and suppresses the browser menu", () => {
    const { onRoll, button } = renderControl();
    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    act(() => {
      button.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(true);
    const dialog = screen.getByRole("dialog", { name: "Soothe (10)" });
    expect(within(dialog).getByRole("group", { name: "Bonus or penalty dice" })).toBeInTheDocument();
    expect(within(dialog).getByRole("group", { name: "Difficulty" })).toBeInTheDocument();
    expect(onRoll).not.toHaveBeenCalled();
  });

  it("a 500 ms long-press opens the dialog and its release does not roll", async () => {
    vi.useFakeTimers();
    const { onRoll, button } = renderControl();
    fireEvent.pointerDown(button, { pointerType: "touch", button: 0, clientX: 20, clientY: 20 });
    act(() => vi.advanceTimersByTime(499));
    expect(screen.queryByRole("dialog")).toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole("dialog", { name: "Soothe (10)" })).toBeInTheDocument();
    fireEvent.pointerUp(button, { pointerType: "touch", button: 0, clientX: 20, clientY: 20 });
    await act(async () => {
      fireEvent.click(button);
    });
    expect(onRoll).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("a short press is still a tap that rolls", async () => {
    vi.useFakeTimers();
    const { onRoll, button } = renderControl();
    fireEvent.pointerDown(button, { pointerType: "touch", button: 0, clientX: 20, clientY: 20 });
    act(() => vi.advanceTimersByTime(200));
    fireEvent.pointerUp(button, { pointerType: "touch", button: 0, clientX: 20, clientY: 20 });
    await act(async () => {
      fireEvent.click(button);
    });
    act(() => vi.advanceTimersByTime(600));
    expect(onRoll).toHaveBeenCalledWith(regular);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("moving the finger (scrolling) cancels the long-press", () => {
    vi.useFakeTimers();
    const { onRoll, button } = renderControl();
    fireEvent.pointerDown(button, { pointerType: "touch", button: 0, clientX: 20, clientY: 20 });
    fireEvent.pointerMove(button, { pointerType: "touch", clientX: 20, clientY: 60 });
    act(() => vi.advanceTimersByTime(800));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onRoll).not.toHaveBeenCalled();
  });

  it("a pointercancel (the browser took the gesture for a scroll) cancels the long-press", () => {
    vi.useFakeTimers();
    const { button } = renderControl();
    fireEvent.pointerDown(button, { pointerType: "touch", button: 0, clientX: 20, clientY: 20 });
    fireEvent.pointerCancel(button, { pointerType: "touch" });
    act(() => vi.advanceTimersByTime(800));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Shift+Enter and the context-menu key open the dialog from the keyboard without rolling", () => {
    const { onRoll, button } = renderControl();
    fireEvent.keyDown(button, { key: "Enter", shiftKey: true });
    expect(screen.getByRole("dialog", { name: "Soothe (10)" })).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.keyDown(button, { key: "ContextMenu" });
    expect(screen.getByRole("dialog", { name: "Soothe (10)" })).toBeInTheDocument();
    expect(onRoll).not.toHaveBeenCalled();
  });

  it("leaves the browser menu alone and opens nothing when the roll has no options", () => {
    const { button } = renderControl({ ariaLabel: "Roll damage", controls: undefined });
    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    act(() => {
      button.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(false);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("omits the difficulty where the system cannot judge one", () => {
    const { button } = renderControl({ controls: { cocBonusDice: true } });
    fireEvent.contextMenu(button);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).queryByRole("group", { name: "Difficulty" })).toBeNull();
    expect(within(dialog).getByRole("group", { name: "Bonus or penalty dice" })).toBeInTheDocument();
  });

  it("titles the dialog with the name alone when the target is unknown", () => {
    const { button } = renderControl({ targetValue: undefined });
    fireEvent.contextMenu(button);
    expect(screen.getByRole("dialog", { name: "Soothe" })).toBeInTheDocument();
  });
});

describe("the roll options dialog", () => {
  it("offers the bonus/penalty range from the macro and 一般／困難／極難, Regular selected", () => {
    const { button } = renderControl({ limits: { minBonusDice: -1, maxBonusDice: 2 } }, "zh-TW");
    fireEvent.contextMenu(button);
    const dialog = screen.getByRole("dialog", { name: "Soothe（10）" });
    const bonus = within(dialog).getByRole("group", { name: "獎勵骰或懲罰骰" });
    expect(within(bonus).getAllByRole("radio").map((r) => r.textContent)).toEqual([
      "懲 1",
      "一般",
      "獎 1",
      "獎 2",
    ]);
    const difficulty = within(dialog).getByRole("group", { name: "難度" });
    const radios = within(difficulty).getAllByRole("radio");
    expect(radios.map((r) => r.getAttribute("data-difficulty"))).toEqual([
      "regular",
      "hard",
      "extreme",
    ]);
    expect(radios[0]).toHaveAttribute("aria-checked", "true");
    // the thresholds for the target value: 10, 5, 2
    expect(radios.map((r) => r.textContent)).toEqual(["一般10", "困難5", "極難2"]);
  });

  it("Roll rolls with the picked bonus dice and difficulty, then closes", async () => {
    const { onRoll, button } = renderControl();
    fireEvent.contextMenu(button);
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("radio", { name: "1 bonus die" }));
    fireEvent.click(within(dialog).getByRole("radio", { name: /^Hard/ }));
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Roll" }));
    });
    expect(onRoll).toHaveBeenCalledTimes(1);
    expect(onRoll).toHaveBeenCalledWith({ ...regular, bonusDice: 1, difficulty: "hard" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens on Roll, so Enter rolls; Enter outside a button rolls with the picks", async () => {
    const { onRoll, button } = renderControl();
    fireEvent.contextMenu(button);
    const dialog = screen.getByRole("dialog");
    expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "Roll" }));
    fireEvent.click(within(dialog).getByRole("radio", { name: "2 penalty dice" }));
    await act(async () => {
      fireEvent.keyDown(dialog, { key: "Enter" });
    });
    expect(onRoll).toHaveBeenCalledWith({ ...regular, bonusDice: -2 });
  });

  it("Enter on an option picks it, without rolling the old picks", async () => {
    const { onRoll, button } = renderControl();
    fireEvent.contextMenu(button);
    const dialog = screen.getByRole("dialog");
    for (const name of [/^Hard/, "1 bonus die"]) {
      const option = within(dialog).getByRole("radio", { name });
      let activated = false;
      await act(async () => {
        // false when a handler called preventDefault: the browser then skips the button's click
        activated = fireEvent.keyDown(option, { key: "Enter" });
      });
      expect(activated).toBe(true);
    }
    expect(onRoll).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("names its close button in the page's language", () => {
    const { button } = renderControl({}, "zh-TW");
    fireEvent.contextMenu(button);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "關閉" })).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Close" })).toBeNull();
  });

  it("Esc closes without rolling, and Cancel too", () => {
    const { onRoll, button } = renderControl();
    fireEvent.contextMenu(button);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.contextMenu(button);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onRoll).not.toHaveBeenCalled();
  });

  it("starts from Regular again each time it opens", () => {
    const { button } = renderControl();
    fireEvent.contextMenu(button);
    fireEvent.click(screen.getByRole("radio", { name: /^Extreme/ }));
    fireEvent.click(screen.getByRole("radio", { name: "1 bonus die" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.contextMenu(button);
    expect(screen.getByRole("radio", { name: /^Regular/ })).toHaveAttribute("aria-checked", "true");
    expect(
      screen.getByRole("radio", { name: "Normal roll, no bonus or penalty dice" }),
    ).toHaveAttribute("aria-checked", "true");
  });
});

describe("first-roll hint", () => {
  it("shows once after the first roll, then never again in this browser", async () => {
    const { button } = renderControl();
    await act(async () => {
      fireEvent.click(button);
    });
    expect(toast).toHaveBeenCalledTimes(1);
    expect(vi.mocked(toast).mock.calls[0][0]).toBe(HINT_EN);
    expect(window.localStorage.getItem(ROLL_OPTIONS_HINT_KEY)).not.toBeNull();
    await act(async () => {
      fireEvent.click(button);
    });
    expect(toast).toHaveBeenCalledTimes(1);
  });

  it("is not shown when this browser has seen it", async () => {
    window.localStorage.setItem(ROLL_OPTIONS_HINT_KEY, "1");
    const { button } = renderControl();
    await act(async () => {
      fireEvent.click(button);
    });
    expect(toast).not.toHaveBeenCalled();
  });

  it("is not shown for a roll without options, and a first roll from the dialog marks it seen", async () => {
    const plain = renderControl({ ariaLabel: "Roll damage", controls: undefined });
    await act(async () => {
      fireEvent.click(plain.button);
    });
    expect(toast).not.toHaveBeenCalled();
    cleanup();

    const { button } = renderControl();
    fireEvent.contextMenu(button);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Roll" }));
    });
    expect(toast).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(ROLL_OPTIONS_HINT_KEY)).not.toBeNull();
  });
});
