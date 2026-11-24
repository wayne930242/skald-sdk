"use client";

import { Minus, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@skald/sheet-sdk/lib/utils";
import { FATE_LADDER_MAX, FATE_LADDER_MIN, sumFateFaces, type FateOutcome } from "../../domain/roll";
import type { FateFaces } from "../../domain/engine";
import { signed } from "../play/skill-ladder";

/** A total with its rung on the adjective ladder (`+5 卓越`), or the number alone beyond it. */
export function useLadderText() {
  const t = useTranslations("fatePlay");
  return (value: number) => (value >= FATE_LADDER_MIN && value <= FATE_LADDER_MAX ? `${signed(value)} ${t(`ladder.${value}`)}` : signed(value));
}

/** `成功（2 檔次）`, `失敗（差 1 檔次）`, `平手`. */
export function useOutcomeText() {
  const t = useTranslations("fateRolls.outcome");
  return (outcome: FateOutcome, shifts: number) => t(outcome, { shifts: Math.abs(shifts) });
}

export const OUTCOME_TONE: Record<FateOutcome, string> = {
  fail: "text-red-500 dark:text-red-400",
  tie: "text-amber-600 dark:text-amber-400",
  success: "text-emerald-600 dark:text-emerald-400",
  style: "text-emerald-600 dark:text-emerald-400",
};

/** Four Fate dice as tiles, with their sum; one accessible name for the whole row. */
/** `fit` is small in a narrow view and full size from `@lg` up (the tray on a phone). */
export function FateDiceRow({ faces, size = "md", className }: { faces: FateFaces; size?: "sm" | "md" | "fit"; className?: string }) {
  const t = useTranslations("fateRolls.dice");
  const name = faces.map((face) => t(face > 0 ? "plus" : face < 0 ? "minus" : "blank")).join(t("separator"));
  return (
    <span
      className={cn("inline-flex items-center gap-1.5", className)}
      role="img"
      aria-label={t("label", { faces: name, sum: signed(sumFateFaces(faces)) })}
      data-fate-faces={faces.join(",")}
    >
      {faces.map((face, index) => (
        <span
          key={index}
          className={cn(
            "inline-flex items-center justify-center rounded-md border border-border bg-gradient-to-b from-background to-muted text-foreground shadow-sm",
            size === "sm" ? "size-7" : size === "fit" ? "size-7 @lg:size-9" : "size-9",
          )}
          aria-hidden
        >
          {face > 0 ? <Plus className="size-4" /> : face < 0 ? <Minus className="size-4" /> : null}
        </span>
      ))}
      <span className="ml-1 text-sm tabular-nums text-muted-foreground" aria-hidden>= {signed(sumFateFaces(faces))}</span>
    </span>
  );
}
