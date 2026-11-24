"use client";

import { Dices } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@skald/sheet-sdk/components/ui/badge";
import { useSystemOptional } from "@skald/sheet-sdk/components/providers/system-provider";
import { useRollGesture, type CustomRollOptionsModule } from "@skald/sheet-sdk/modules/rolls/ui/dice/use-roll-gesture";
import { useRollInteractionMode } from "@skald/sheet-sdk/modules/rolls/ui/context/interaction-mode";
import { useSystemPluginUi } from "@skald/sheet-sdk/modules/systems/ui/system-plugin-provider";
import { cn } from "@skald/sheet-sdk/lib/utils";
import type { MoveRollBadgeProps } from "./move-stat-badge";

function doNothing() {}

/** A rolling move's stat chip (see `MoveStatBadge`); it loads with the first moves list that rolls. */
export default function MoveRollBadge({ moveName, statLabel, onRoll, className, iconClassName }: MoveRollBadgeProps) {
  const t = useTranslations("renderer");
  const { rollOptions } = useSystemPluginUi();
  // A move's roll names no rule: the system's default rule judges it.
  const rule = useSystemOptional()?.dsl?.rollRules?.default;
  const load = rule ? rollOptions.get(rule)?.otherRolls : undefined;
  // B-023: a move has no value of its own to edit, so its roll is inert in edit mode
  const inert = useRollInteractionMode() === "edit";
  const { hasOptions, buttonProps, dialog } = useRollGesture({
    onEdit: inert ? doNothing : undefined,
    rollName: moveName,
    onRoll: (payload) => onRoll(payload.transformExpression),
    // The registry types the module loosely: it cannot name the rolls context's dialog props.
    customOptions: load ? { load: load as () => Promise<CustomRollOptionsModule> } : undefined,
  });
  return (
    <>
      <Badge asChild variant="outline" className={cn(className, "relative z-10 cursor-pointer hover:bg-primary/10", hasOptions && "touch-manipulation select-none [-webkit-touch-callout:none]")}>
        <button type="button" {...buttonProps} aria-disabled={inert || undefined} aria-label={t("rollMove", { move: moveName, stat: statLabel })}>
          <Dices className={iconClassName} aria-hidden="true" />
          {statLabel}
        </button>
      </Badge>
      {dialog}
    </>
  );
}
