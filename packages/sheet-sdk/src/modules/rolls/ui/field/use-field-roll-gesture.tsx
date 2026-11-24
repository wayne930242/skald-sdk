"use client";

import { useSystemPluginUi } from "@skald/sheet-sdk/modules/systems/ui/system-plugin-provider";
import { useRollGesture, type CustomRollOptionsModule } from "@skald/sheet-sdk/modules/rolls/ui/dice/use-roll-gesture";
import type { useRollAction } from "./rollable-field";

export type FieldRollAction = ReturnType<typeof useRollAction>;

/**
 * The gesture of a field's roll on a button the host draws itself (a tile, a stat-list row's name
 * or dice button), the same as the rule's own dice button (B-022): a tap rolls at once; a
 * long-press, a right-click or Shift+Enter opens the rule's own options when the plugin registers
 * them (`rollOptions`), else the shared bonus/penalty dice and difficulty dialog when the roll
 * takes them. In edit mode, `onEdit` takes every tap instead (B-023).
 */
export function useFieldRollGesture(action: FieldRollAction, rollName: string, options?: { onEdit?: () => void }) {
  const { rollOptions } = useSystemPluginUi();
  const ruleOptions = action.optionsRule ? rollOptions.get(action.optionsRule) : undefined;
  // A template-defined form is the roll's options: a long-press opens it (B-022).
  const load = action.openForm ? undefined : action.showBonusDice ? ruleOptions?.withBonusDice : ruleOptions?.otherRolls;
  return useRollGesture({
    rollName,
    targetValue: action.targetValue,
    onRoll: (payload) =>
      action.trigger(payload.bonusDice, payload.difficulty, payload.transformExpression, payload.macroArgs, payload.visibility),
    controls: load || action.openForm ? undefined : { cocBonusDice: action.showBonusDice, cocDifficulty: action.showDifficulty },
    limits: { minBonusDice: action.minDice, maxBonusDice: action.maxDice },
    // The registry types the module loosely: it cannot name the rolls context's dialog props.
    customOptions: load
      ? {
          load: load as () => Promise<CustomRollOptionsModule>,
          data: {
            expression: action.expression,
            targetValue: action.targetValue,
            showBonusDice: action.showBonusDice,
            showDifficulty: action.showDifficulty,
            minDice: action.minDice,
            maxDice: action.maxDice,
          },
        }
      : undefined,
    openForm: action.openForm,
    // B-023: in edit mode the gesture opens this instead (see `InteractionMode`)
    onEdit: options?.onEdit,
  });
}
