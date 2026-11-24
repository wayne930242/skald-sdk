"use client";

import { useTranslations } from "next-intl";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@skald/sheet-sdk/components/ui/alert-dialog";
import type { CastOption } from "./play-model";

const OPTION =
  "flex min-h-12 w-full items-center justify-between gap-3 rounded-lg border border-border bg-background px-4 text-left text-sm transition-colors hover:bg-muted";

/**
 * How to cast (lazy chunk): one row per open slot level, lowest first (a higher slot upcasts,
 * A2-11), and the Ritual row without a slot for a Ritual spell (A2-09).
 */
export function CastDialog({
  name,
  options,
  ritual,
  onCast,
  onClose,
}: {
  name: string;
  options: CastOption[];
  ritual: boolean;
  onCast: (via: CastOption | "ritual") => void;
  onClose: () => void;
}) {
  const t = useTranslations("play");
  return (
    <AlertDialog open onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent data-play-cast-dialog>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("spells.castTitle", { name })}</AlertDialogTitle>
          <AlertDialogDescription className="sr-only">{t("spells.castTitle", { name })}</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2">
          {options.map((option) => (
            <button key={option.field} type="button" className={OPTION} onClick={() => onCast(option)} data-cast-option={option.field}>
              <span className="font-semibold">{option.pact ? t("spells.castPact", { level: option.level }) : t("spells.castWith", { level: option.level })}</span>
              <span className="text-xs text-muted-foreground">{t("spells.castLeft", { left: option.left })}</span>
            </button>
          ))}
          {ritual && (
            <button type="button" className={OPTION} onClick={() => onCast("ritual")} data-cast-option="ritual">
              <span className="font-semibold">{t("spells.castRitual")}</span>
              <span className="text-xs text-muted-foreground">{t("spells.ritualNote")}</span>
            </button>
          )}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("rest.cancel")}</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
