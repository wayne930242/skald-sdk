"use client";

import { useLocale, useTranslations } from "next-intl";
import defaultAvailability from "@skald/system-dnd5e/data/dnd5e-2024/zh-availability.json";

/**
 * Which locale's data files this build withholds, each replaced by its fallback locale's text
 * (open-source plan §2 step 3b). The public export writes the list; Skald's own lists nothing.
 */
export interface ZhAvailability {
  version: number;
  locale: string;
  fallback: string;
  /** Data files (relative to `data/dnd5e-2024/`) that show the fallback locale's text. */
  withheld: readonly string[];
}

/**
 * One notice for a reader of the withheld locale: part of the D&D text shows in the fallback
 * language in this build. Renders nothing when no file is withheld, so Skald's sheet never shows it.
 */
export function ZhFallbackNotice({ availability = defaultAvailability }: { availability?: ZhAvailability }) {
  const locale = useLocale();
  if (availability.withheld.length === 0 || locale !== availability.locale) return null;
  return <Notice />;
}

function Notice() {
  const t = useTranslations("sheetUi");
  return (
    <p role="note" className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
      {t("zhFallbackNotice")}
    </p>
  );
}
