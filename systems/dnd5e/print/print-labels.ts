"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import type { SpellStatLabels } from "./spell-stats";

/**
 * The print's strings: its own lazy catalog (`dndPrint`, data/dnd5e-2024/messages/print) and the
 * sheet's D&D messages, which already name the abilities, skills, conditions and options.
 */
export interface PrintLabels {
  print: (key: string, values?: Record<string, string | number>) => string;
  /** A key of the sheet's D&D messages (`ability.str`, `option.size.medium`), or "" when missing. */
  sheet: (key: string, values?: Record<string, string | number>) => string;
  stats: SpellStatLabels;
  /** Names in a run: 「、」 in zh-TW, commas in English. */
  list: (items: readonly string[]) => string;
}

export function usePrintLabels(): PrintLabels {
  const t = useTranslations("dndPrint");
  const tSheet = useTranslations();
  return useMemo(() => {
    const print = (key: string, values?: Record<string, string | number>) => t(key as never, values as never);
    const sheet = (key: string, values?: Record<string, string | number>) =>
      tSheet.has(key as never) ? tSheet(key as never, values as never) : "";
    return {
      print,
      sheet,
      list: (items) => items.join(print("separator")),
      stats: {
        school: (code) => (t.has(`school.${code}` as never) ? print(`school.${code}`) : null),
        duration: (key, values) => print(`duration.${key}`, values),
      },
    };
  }, [t, tSheet]);
}
