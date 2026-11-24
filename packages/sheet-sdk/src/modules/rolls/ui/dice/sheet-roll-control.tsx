"use client";

import { useSystemPluginUi } from "@skald/sheet-sdk/modules/systems/ui/system-plugin-provider";
import type { SheetRollControlProps } from "@skald/sheet-sdk/modules/systems/ui/system-plugin-ui";
import { useRollInteractionMode } from "@skald/sheet-sdk/modules/rolls/ui/context/interaction-mode";
import { RollControl } from "./roll-control";
import type { CustomRollOptionsModule } from "./use-roll-gesture";

export function SheetRollControl({ rule, optionsRule, onOpenForm, onEdit, editHint, ...props }: SheetRollControlProps & {
  rule?: string;
  /** The rule whose registered roll options a plain dice button opens (B-022); defaults to `rule`. */
  optionsRule?: string;
  /** Opens the roll's template-defined form, which a plain dice button opens on a long-press (B-022). */
  onOpenForm?: () => void;
  /**
   * B-023: what edit mode opens instead of the roll (the field's own input). Without it the control
   * is inert in edit mode: no roll, aria-disabled. Edit mode never reaches a plugin's own control.
   */
  onEdit?: () => void;
  /** Why an inert control does nothing: only for computed values (characters.derived.fixed/noRuntime). */
  editHint?: string;
}) {
  const { rollControls, rollOptions } = useSystemPluginUi();
  const editMode = useRollInteractionMode() === "edit";
  if (editMode) {
    return (
      <RollControl
        ariaLabel={props.ariaLabel}
        rollName={props.rollName}
        className={props.className}
        buttonClassName={props.buttonClassName}
        onEdit={onEdit}
        editInert={!onEdit}
        editHint={onEdit ? undefined : editHint}
        onRoll={() => {}}
      />
    );
  }

  const Control = rule ? rollControls.get(rule) : undefined;
  // eslint-disable-next-line react-hooks/static-components -- the catalog holds stable component references
  if (Control) return <Control {...props} />;

  const ruleOptions = optionsRule ?? rule;
  const load = ruleOptions ? rollOptions.get(ruleOptions)?.otherRolls : undefined;
  return (
    <RollControl
      ariaLabel={props.ariaLabel}
      rollName={props.rollName}
      targetValue={props.targetValue}
      className={props.className}
      buttonClassName={props.buttonClassName}
      // The registry types the module loosely: it cannot name the rolls context's dialog props.
      customOptions={load && !onOpenForm ? { load: load as () => Promise<CustomRollOptionsModule> } : undefined}
      openForm={onOpenForm}
      onRoll={(payload) =>
        payload.visibility
          ? props.onRoll(payload.bonusDice, payload.difficulty, payload.transformExpression, payload.macroArgs, payload.visibility)
          : payload.transformExpression || payload.macroArgs
            ? props.onRoll(payload.bonusDice, payload.difficulty, payload.transformExpression, payload.macroArgs)
            : props.onRoll(payload.bonusDice, payload.difficulty)
      }
    />
  );
}
