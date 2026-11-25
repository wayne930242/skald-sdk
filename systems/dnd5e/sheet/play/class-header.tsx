"use client";

import { ArrowUpCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePlay } from "./play-context";
import { num } from "./play-model";
import { classLine } from "./class-model";
import { useSheetNames } from "./use-sheet-names";
import { useDndRecalc } from "./use-dnd-recalc";

/** The top character level: the helper is hidden there. */
const LEVEL_CAP = 20;

/** The class line in the viewer's locale with the character level: "Fighter 3 · Champion / Wizard 1 · Level 4". */
export function useClassText(): string {
  const t = useTranslations("play.character");
  const { values } = usePlay();
  const { names } = useSheetNames();
  const classText = classLine(values, { separator: " / ", level: String }, names);
  const level = num(values.level);
  return [classText, level > 0 ? t("level", { level }) : ""].filter(Boolean).join(" · ");
}

/**
 * The sheet's header strip (UAT m15): the class line and level on every tab, with 升級, the one
 * place that opens the level-up helper (phase 2b §4.4: one level per run, never past 20, only where
 * the sheet can change).
 */
export function ClassHeader() {
  const t = useTranslations("play.character");
  const { values, editable, openLevelUp } = usePlay();
  const recalc = useDndRecalc();
  const text = useClassText();
  const canLevel = editable && openLevelUp !== null && num(values.level) < LEVEL_CAP;
  if (!text && !canLevel) return null;
  return (
    <div className="flex min-h-9 flex-wrap items-center justify-between gap-x-3 gap-y-1 px-1" data-play-header>
      <p className="min-w-0 text-sm text-muted-foreground" data-play-class-line>
        {text}
      </p>
      {canLevel && (
        <button
          type="button"
          onClick={() => openLevelUp?.(recalc)}
          className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-md border border-border px-3 text-sm font-medium hover:bg-muted sm:min-h-9"
          data-play-level-up
        >
          <ArrowUpCircle className="size-4" aria-hidden />
          {t("levelUp")}
        </button>
      )}
    </div>
  );
}
