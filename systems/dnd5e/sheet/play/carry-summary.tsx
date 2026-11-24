"use client";

import { useLocale, useTranslations } from "next-intl";
import { cn } from "@skald/sheet-sdk/lib/utils";
import { usePlay } from "./play-context";
import { inventorySummary } from "../economy/carry";
import type { Catalog } from "../economy/catalog";

/**
 * The 物品 tab's footer (plan-uat2 §3.5, SRD 5.2.1 p.178): carried weight against capacity and
 * the drag, lift or push limit. A warning only: Speed changes only while dragging, lifting or pushing.
 */
export function CarrySummary({ catalog }: { catalog: Catalog }) {
  const t = useTranslations("economy.carry");
  const locale = useLocale();
  const { values } = usePlay();
  const summary = inventorySummary(values, catalog);
  const number = (value: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value);
  return (
    <footer className="mt-2 space-y-0.5 border-t border-border pt-2 text-sm" data-carry-status={summary.status}>
      <p className="tabular-nums">{t("line", { carried: number(summary.carried), capacity: number(summary.capacity), drag: number(summary.dragLimit) })}</p>
      <p className={cn("text-xs", summary.status === "ok" ? "text-muted-foreground" : "font-medium text-destructive")} role={summary.status === "ok" ? undefined : "status"}>
        {t(summary.status)} <span className="text-muted-foreground">{t("rule")}</span>
      </p>
    </footer>
  );
}
