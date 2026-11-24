"use client";

import { Dices } from "lucide-react";
import { cn } from "@skald/sheet-sdk/lib/utils";
import type { SheetRollControlProps } from "@skald/sheet-sdk/modules/systems/ui/system-plugin-ui";
import { useD20RollGesture } from "./d20-roll-gesture";

const BUTTON =
  "pointer-events-auto inline-flex h-7 w-7 items-center justify-center rounded-full border border-border bg-background text-foreground shadow-sm transition-colors hover:bg-muted print:hidden pointer-coarse:h-9 pointer-coarse:w-9";

/**
 * The `dnd5e` roll rule's control: a d20 button at the field's top right, with the gesture of every
 * sheet roll (B-021). A tap rolls normal at once. On a roll that takes advantage (`showBonusDice`:
 * a d20 Test, not a weapon's damage) a long-press, a right-click or Shift+Enter opens the roll's
 * dialog: the choice reaches the `d20` macro as `adv` (−1, 0, +1) through the host's bonus-dice
 * override, a modifier joins the call, and extra dice go in as macro arguments.
 */
export function AdvantageRollControl({
  ariaLabel,
  rollName,
  onRoll,
  className,
  buttonClassName,
  showBonusDice = false,
  expression,
}: SheetRollControlProps) {
  const { hasOptions, buttonProps, dialog } = useD20RollGesture({
    d20: showBonusDice,
    // The rule's other field roll is a weapon's damage: a Critical Hit and a modifier (B-022).
    damage: !showBonusDice,
    rollName: rollName ?? ariaLabel,
    expression,
    roll: (adv, transformExpression, extraArgs) =>
      transformExpression || extraArgs
        ? onRoll(adv, "regular", transformExpression, extraArgs)
        : onRoll(adv, "regular"),
  });
  return (
    <div className={cn("absolute inset-0 pointer-events-none", className)}>
      <div className="absolute right-0 top-0 z-10 inline-flex items-center pointer-events-auto">
        <button
          type="button"
          className={cn(
            BUTTON,
            "opacity-60 hover:opacity-100 focus-visible:opacity-100",
            // A long-press must not select text or raise the iOS callout; scrolling still works.
            hasOptions && "touch-manipulation select-none [-webkit-touch-callout:none]",
            buttonClassName,
          )}
          {...buttonProps}
          aria-label={ariaLabel}
        >
          <Dices className="h-[18px] w-[18px]" />
        </button>
      </div>
      {dialog}
    </div>
  );
}
