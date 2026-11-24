"use client";

import { useEffect, useState, type RefObject } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@skald/sheet-sdk/lib/utils";
import type { FateVitalsSummary } from "./play-model";
import type { FatePlayRules } from "./play-rules";
import { FateToken } from "./fate-points";

/**
 * Whether `anchor` has scrolled up past the top of the viewport. Without IntersectionObserver
 * (old browsers, tests) the strip simply never shows.
 */
function useScrolledPast(anchor: RefObject<HTMLElement | null>): boolean {
  const [past, setPast] = useState(false);
  useEffect(() => {
    const element = anchor.current;
    if (!element || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (entry) setPast(!entry.isIntersecting && entry.boundingClientRect.top < 0);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [anchor]);
  return past;
}

/**
 * The phone's compact status (frame 15, borrowed from direction C): fate points, marked stress
 * per active track and the consequences taken (or conditions marked), once the fate point card
 * has scrolled away. It sits in a zero-height sticky rail, so it overlays the top edge instead
 * of pushing the page, takes no focus and is hidden from assistive tech until shown. Desktops
 * keep the full cards in view.
 */
export function StickyStatus({ anchor, summary, labels }: { anchor: RefObject<HTMLElement | null>; summary: FateVitalsSummary; labels: FatePlayRules["labels"] }) {
  const t = useTranslations("fatePlay.sticky");
  const shown = useScrolledPast(anchor);
  return (
    <div className="sticky top-[var(--sheet-sticky-top,0px)] z-20 h-0 @3xl:hidden">
      <div
        className={cn(
          "absolute inset-x-0 top-0 grid grid-cols-[auto_auto_minmax(0,1fr)] items-center gap-3 rounded-b-xl border border-t-0 border-border bg-background/95 px-3 py-2 text-sm shadow-md backdrop-blur transition-opacity supports-[backdrop-filter]:bg-background/85",
          shown ? "opacity-100" : "pointer-events-none invisible opacity-0",
        )}
        data-fate-sticky
        data-shown={shown ? "true" : "false"}
        aria-hidden={!shown}
        aria-label={t("label")}
        role="group"
      >
        <span className="inline-flex items-center gap-1.5">
          <FateToken />
          <span className="text-lg font-semibold tabular-nums text-accent">{summary.fatePoints}</span>
        </span>
        <span className="flex flex-col leading-tight tabular-nums">
          {summary.tracks.map((track) => (
            <span key={track.id}>{t("track", { track: labels.tracks[track.id] ?? track.id, marked: track.marked, boxes: track.boxes })}</span>
          ))}
        </span>
        <span className="flex min-w-0 flex-col leading-tight">
          {summary.injuries.length === 0 ? (
            <span className="text-muted-foreground">{t(summary.injuryKind === "conditions" ? "noConditions" : "none")}</span>
          ) : (
            summary.injuries.slice(0, 2).map((injury) => (
              <span key={injury.id} className="truncate">
                {t("consequence", { severity: t(`severity.${injury.severity}`), text: injury.text ?? labels.conditions[injury.id] ?? injury.id })}
              </span>
            ))
          )}
        </span>
      </div>
    </div>
  );
}
