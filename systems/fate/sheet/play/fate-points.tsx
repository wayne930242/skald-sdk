"use client";

import { forwardRef, lazy, Suspense, useState, useSyncExternalStore, type ComponentType } from "react";
import { BookOpen } from "lucide-react";
import { useTranslations } from "next-intl";
import { OverrideMark } from "@skald/sheet-sdk/modules/character/ui/derived/override-mark";
import { cn } from "@skald/sheet-sdk/lib/utils";
import { readFateResources } from "../../domain/normalize";
import { sheetRuleTargets } from "../../reference/rule-ids";
import { useFatePlay } from "./play-context";
import { CARD, CARD_TITLE, ICON_BUTTON } from "./card-styles";
import { fateCoinPhonePx, fateCoinRow, fateCoinTier, type FateCoinState } from "./coin-model";
import { FateCoin } from "./fate-coin";
import { FATE_REFRESH_ID } from "./derived";
import { useFateTableMode } from "../table/use-fate-table";
import { fateTableReadsPort } from "../table/table-reads-port";
import { useSheetViewer } from "@skald/sheet-sdk/modules/character/ui/renderer/viewer-context";
import { useHostPort } from "@skald/sheet-sdk/modules/systems/ui/host-ports";

// Edit mode only: the override input loads with the first edit, never with the play shell.
const FateRefreshEditor = lazy(() => import("./refresh-value").then((module) => ({ default: module.FateRefreshEditor })));
// The owner's carry-out from a table copy (plan-r2 T3): loads only for an owner who could use it.
const FateCarryOut = lazy(() => import("../table/carry-out").then((module) => ({ default: module.FateCarryOut })));

/** A fate point as a small coin beside text (sticky strip, invoke cost): 24 px, simple face. */
export function FateToken() {
  return <FateCoin detail={fateCoinTier(24)} className="size-6" />;
}

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribeMotion(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener?.("change", onChange);
  return () => query.removeEventListener?.("change", onChange);
}

/** Reduced motion unless the browser says otherwise: no matchMedia (server, tests) draws still. */
const readReducedMotion = () => typeof window === "undefined" || typeof window.matchMedia !== "function" || window.matchMedia(REDUCED_MOTION).matches;

function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribeMotion, readReducedMotion, () => true);
}

type CoinMotion = "gain" | "spend";
const NO_MOTION: ReadonlyMap<number, CoinMotion> = new Map();

/**
 * The coins that turned since the last balance (a point gained or spent), never on first render.
 * Kept in state and adjusted while rendering, so a change animates once, on the render showing it.
 */
function useCoinMotion(coins: readonly FateCoinState[]): ReadonlyMap<number, CoinMotion> {
  const key = coins.join(" ");
  const [seen, setSeen] = useState<{ key: string; moved: ReadonlyMap<number, CoinMotion> }>({ key, moved: NO_MOTION });
  if (seen.key === key) return seen.moved;
  const before = seen.key ? seen.key.split(" ") : [];
  const moved = new Map<number, CoinMotion>();
  coins.forEach((state, index) => {
    if (before[index] !== state) moved.set(index, state === "spent" ? "spend" : "gain");
  });
  setSeen({ key, moved });
  return moved;
}

/** A short settle (≤200 ms): a gained coin drops in with a slight turn, a spent one sinks hollow. */
const MOTION_CLASS: Record<CoinMotion, string> = {
  gain: "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-75 motion-safe:spin-in-12 motion-safe:duration-200 motion-safe:ease-out",
  spend: "motion-safe:animate-in motion-safe:fade-in-50 motion-safe:zoom-in-110 motion-safe:duration-200 motion-safe:ease-out",
};

/**
 * Fate points in one tray with the count and the effective refresh (F1 accounting: base, earned,
 * stunt cost, legacy override), then the session slot's actions (frame 04). The coins show the
 * refresh capacity: points held as metal coins (above refresh with a halo), the rest hollow, at
 * most five and `+N` after. A phone keeps one line where it fits (wrapping coins and refresh
 * together on a 320 px phone); a desktop lays it out as frame 03, title and refresh over the
 * coins and the count. Display only: every change of the balance goes through the session slot's
 * commands, which keep the ledger (F8).
 */
export const FatePointsCard = forwardRef<HTMLElement, { session?: ComponentType }>(function FatePointsCard({ session: Session }, ref) {
  const t = useTranslations("fatePlay");
  const { data, openRules, structural } = useFatePlay();
  const resources = readFateResources(data);
  const { effectiveRefresh, refreshOverride } = resources;
  // Plan-r2 T3: at an active table the wallet is the balance; a copy the sheet cannot reach shows
  // no balance (its card value is not the table's), only why.
  const table = useFateTableMode();
  const tableNotice = table.kind === "table"
    ? table.wallet ? null : "hidden"
    : table.kind === "readOnly" ? table.reason : null;
  const fatePoints = table.kind === "table" && table.wallet ? table.wallet.value : resources.fatePoints;
  const viewer = useSheetViewer();
  // A host without tables (no `fateTableReadsPort`) has no table balance to carry out.
  const hasTables = useHostPort(fateTableReadsPort) !== null;
  const offersCarryOut = !structural && viewer.isOwner === true && hasTables;
  const { coins, hidden } = fateCoinRow(fatePoints, effectiveRefresh);
  const moved = useCoinMotion(coins);
  const reduced = useReducedMotion();
  const phoneSize = fateCoinPhonePx(coins.length) === 24 ? "size-6" : "size-7";
  return (
    <section ref={ref} className={CARD} data-fate-points {...(table.kind !== "v2" ? { "data-fate-table": table.kind } : {})}>
      {tableNotice ? (
        <div className="rounded-lg border border-border bg-muted/30 px-3 py-2" data-fate-table-points={tableNotice}>
          <span className="inline-flex items-center">
            <h2 className={CARD_TITLE}>{t("points.title")}</h2>
            <button type="button" onClick={() => openRules(sheetRuleTargets.fatePoints)} aria-label={t("rules.section", { section: t("points.title") })} className={ICON_BUTTON}>
              <BookOpen className="size-4" aria-hidden />
            </button>
          </span>
          <p className="text-sm text-muted-foreground">{t(`points.table.${tableNotice}`)}</p>
        </div>
      ) : (
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-border bg-muted/30 py-1 pl-2 pr-1 @3xl:grid @3xl:grid-cols-[minmax(0,1fr)_auto] @3xl:gap-x-3 @3xl:gap-y-1 @3xl:py-1.5 @3xl:pl-3 @3xl:[grid-template-areas:'title_refresh'_'coins_count']">
        <span className="inline-flex items-center @3xl:[grid-area:title]">
          <h2 className={CARD_TITLE}>{t("points.title")}</h2>
          <button type="button" onClick={() => openRules(sheetRuleTargets.fatePoints)} aria-label={t("rules.section", { section: t("points.title") })} className={ICON_BUTTON}>
            <BookOpen className="size-4" aria-hidden />
          </button>
        </span>
        <span className="font-display text-2xl leading-none tabular-nums text-accent @3xl:justify-self-end @3xl:pr-2 @3xl:text-4xl @3xl:[grid-area:count]" aria-hidden>
          {fatePoints}
        </span>
        {/* Coins and refresh wrap together, so a narrow phone gets them on a second line side by side. */}
        <span className="flex min-w-fit flex-1 items-center justify-between gap-2 @3xl:contents">
          <span className="flex shrink-0 items-center gap-1 py-0.5 @3xl:gap-1.5 @3xl:py-1 @3xl:[grid-area:coins]" role="img" aria-label={t("points.tokens", { count: fatePoints })} data-fate-coins>
            {coins.map((state, index) => {
              const motion = reduced ? undefined : moved.get(index);
              return (
                <span
                  key={`${index}-${state}`}
                  aria-hidden
                  className={cn(
                    "inline-flex shrink-0 rounded-full",
                    state === "extra" && "ring-2 ring-accent/45 ring-offset-1 ring-offset-card",
                    motion && MOTION_CLASS[motion],
                  )}
                  data-fate-token={state === "spent" ? undefined : ""}
                  data-fate-coin-motion={motion}
                >
                  <FateCoin state={state} detail="container" className={cn(phoneSize, "@3xl:size-10")} />
                </span>
              );
            })}
            {hidden > 0 && (
              <span className="pl-0.5 text-sm font-medium tabular-nums text-accent @3xl:text-base" aria-hidden data-fate-coin-more>
                {t("points.more", { count: hidden })}
              </span>
            )}
          </span>
          <span className="inline-flex items-center @3xl:justify-self-end @3xl:[grid-area:refresh]">
            <button type="button" onClick={() => openRules(sheetRuleTargets.refresh)} className={cn(ICON_BUTTON, "px-2 text-sm")}>
              {t("points.refresh", { refresh: effectiveRefresh })}
            </button>
            {/* B-024: a refresh the player set by hand is marked; edit mode shows the editor instead. */}
            {!structural && <OverrideMark fieldId={FATE_REFRESH_ID} overridden={refreshOverride !== undefined} className="-ml-1 pr-1" />}
          </span>
        </span>
      </div>
      )}
      {table.kind === "table" && table.wallet && <p className="mt-1 text-xs text-muted-foreground" data-fate-table-points="wallet">{t("points.table.managed")}</p>}
      {structural && (
        <Suspense fallback={null}>
          <FateRefreshEditor />
        </Suspense>
      )}
      {offersCarryOut && (
        <Suspense fallback={null}>
          <FateCarryOut />
        </Suspense>
      )}
      {Session && (
        <div className="mt-2" data-fate-slot="session">
          <Session />
        </div>
      )}
    </section>
  );
});
