"use client";

import { useRollGesture } from "@skald/sheet-sdk/modules/rolls/ui/dice/use-roll-gesture";

/** The d20 dialog: it, its labels and its argument rules load on the first press of a d20 button. */
export const loadD20RollOptions = () => import("./d20-roll-options");
/** The damage dialog (a Critical Hit, a modifier), loaded on the first press of a damage button. */
export const loadDamageRollOptions = () => import("./damage-roll-options");

/** Rolls with the d20 macro's `adv` argument, and the dialog's modifier and extra dice when chosen. */
export type D20Roll = (
  adv: number,
  transformExpression?: (expression: string) => string,
  extraArgs?: Record<string, number>,
) => void | Promise<void>;

/**
 * The gesture of a D&D roll button, the same as CoC's sheet rolls (B-021): a tap rolls at once
 * (normal, Exhaustion counted); on a d20 Test (`d20`) a long-press, a right-click, Shift+Enter or
 * the context-menu key opens a dialog for this roll only: advantage or disadvantage, a modifier,
 * and extra dice when the system's d20 macro takes them. `exhaustionPenalty` is the D20 Test
 * penalty already in the roll, which the dialog names.
 */
export function useD20RollGesture({ roll, rollName, d20, damage = false, exhaustionPenalty = 0, expression, onEdit }: {
  roll: D20Roll;
  rollName: string;
  d20: boolean;
  /** A damage roll (not a d20 Test): its dialog offers a Critical Hit and a modifier (B-022). */
  damage?: boolean;
  exhaustionPenalty?: number;
  /** The roll's expression as the field defines it, when the roll is a field's: see `d20ModifierApplies`. */
  expression?: string;
  /** B-023: what a tap opens in edit mode instead of rolling (see `InteractionMode`). */
  onEdit?: () => void;
}) {
  return useRollGesture({
    rollName,
    onEdit,
    onRoll: (payload) => roll(payload.bonusDice, payload.transformExpression, payload.macroArgs),
    customOptions: d20
      ? { load: loadD20RollOptions, data: { exhaustionPenalty, expression } }
      : damage
        ? { load: loadDamageRollOptions }
        : undefined,
  });
}
