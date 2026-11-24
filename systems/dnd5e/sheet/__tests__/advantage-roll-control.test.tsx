import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { AdvantageRollControl } from "../advantage-roll-control";

/**
 * The `dnd5e` control is one d20 button at the field's top right, clear of the label. A tap rolls
 * normal at once on every roll; the per-roll options (advantage, a modifier, extra dice) open on a
 * long-press, a right-click or Shift+Enter (B-021, see d20-roll-options.test.tsx). Nothing appears
 * over the field's value.
 */

afterEach(cleanup);

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={{}}>
      {children}
    </NextIntlClientProvider>
  );
}

describe("AdvantageRollControl", () => {
  it("rolls normal on a tap of a roll that takes advantage, with no menu", () => {
    const onRoll = vi.fn();
    render(<AdvantageRollControl ariaLabel="Roll Attack" onRoll={onRoll} showBonusDice />, { wrapper: Wrapper });
    expect(screen.getAllByRole("button").map((button) => button.getAttribute("aria-label"))).toEqual(["Roll Attack"]);
    const button = screen.getByRole("button", { name: "Roll Attack" });
    expect(button).toHaveAttribute("aria-haspopup", "dialog");
    fireEvent.click(button);
    expect(onRoll).toHaveBeenCalledWith(0, "regular");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("shows a single dice button at the top right on a roll that does not", () => {
    const onRoll = vi.fn();
    render(<AdvantageRollControl ariaLabel="Roll Damage" onRoll={onRoll} />, { wrapper: Wrapper });
    const buttons = screen.getAllByRole("button");
    expect(buttons.map((button) => button.getAttribute("aria-label"))).toEqual(["Roll Damage"]);
    expect(buttons[0].parentElement?.className).toContain("right-0");
    fireEvent.click(buttons[0]);
    expect(onRoll).toHaveBeenCalledWith(0, "regular");
  });
});
