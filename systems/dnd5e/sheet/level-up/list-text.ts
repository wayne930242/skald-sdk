"use client";

import { useMemo } from "react";
import { useLocale } from "next-intl";

/** Joins items the locale's way (`Intl.ListFormat`, narrow): "A, B, C" in English, "A、B" in zh-TW. */
export function useListText(): (items: readonly string[]) => string {
  const locale = useLocale();
  return useMemo(() => {
    const format = new Intl.ListFormat(locale, { type: "conjunction", style: "narrow" });
    return (items: readonly string[]) => format.format(items);
  }, [locale]);
}
