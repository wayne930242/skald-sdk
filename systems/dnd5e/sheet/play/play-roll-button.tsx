"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Pencil } from "lucide-react";
import { useTranslations } from "next-intl";
import type { RollConfig } from "@skald/dice/roll-expression";
import { useRollAction } from "@skald/sheet-sdk/modules/rolls/ui/field/rollable-field";
import { cn } from "@skald/sheet-sdk/lib/utils";
import { usePlay, usePlayEditing } from "./play-context";
import { exhaustionLevel, exhaustionRollData } from "./play-model";
import { useD20RollGesture } from "../d20-roll-gesture";

/** The d20 mark of a roll target (the frames' hexagon with its face). */
export function D20Icon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={cn("size-4 shrink-0", className)} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
      <path d="M12 2.5 20.5 7.25v9.5L12 21.5 3.5 16.75v-9.5Z" />
      <path d="M12 7.5 16.5 15h-9Z" />
    </svg>
  );
}

interface PlayRollButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "children"> {
  roll: RollConfig | undefined;
  /** The roll's data: the character's values, or a row's values over them. */
  data: Record<string, unknown>;
  /** Shown on the result card and in the chat. */
  label: string;
  children: ReactNode;
  /** Draw the d20 mark before the content. */
  icon?: boolean;
  /** A damage roll: a long-press offers a Critical Hit and a modifier (B-022). */
  damage?: boolean;
  /** B-023: what a tap opens in edit mode instead of rolling (the value's editor). */
  onEdit: () => void;
}

/**
 * A tap target that rolls, with the gesture of every sheet roll (B-021): a tap rolls at once, and
 * on a d20 Test a long-press, a right-click or Shift+Enter opens that roll's options (advantage,
 * a modifier, extra dice). A d20 Test is reduced by Exhaustion (A2-08), on a tap too.
 * In edit mode (B-023) a tap opens `onEdit` instead: the value's editor.
 */
export function PlayRollButton({ roll, data, label, children, icon = true, damage = false, className, disabled, onEdit, ...rest }: PlayRollButtonProps) {
  const tRenderer = useTranslations("renderer");
  const { values } = usePlay();
  const editing = usePlayEditing();
  const level = exhaustionLevel(values);
  const action = useRollAction(exhaustionRollData(data, level), roll, label);
  const canRoll = action.canRoll && !disabled;
  const gesture = useD20RollGesture({
    d20: action.showBonusDice,
    damage,
    rollName: label,
    exhaustionPenalty: 2 * level,
    roll: (adv, transformExpression, extraArgs) => action.trigger(adv, "regular", transformExpression, extraArgs),
    onEdit: editing ? onEdit : undefined,
  });
  return (
    <>
      <button
        type="button"
        {...rest}
        disabled={editing ? false : !canRoll}
        data-roll-target=""
        {...gesture.buttonProps}
        {...(editing && { "aria-label": tRenderer("editValue", { name: label }), "aria-haspopup": "dialog" as const })}
        className={cn(
          gesture.hasOptions && "touch-manipulation select-none [-webkit-touch-callout:none]",
          "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-border bg-muted/40 px-3 text-sm font-semibold tabular-nums transition-colors",
          "hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:hover:bg-muted/40",
          className,
        )}
      >
        {icon && (editing ? <Pencil className="size-4 shrink-0 text-accent" aria-hidden="true" /> : <D20Icon className="text-accent" />)}
        {children}
      </button>
      {action.dialog}
      {gesture.dialog}
    </>
  );
}
