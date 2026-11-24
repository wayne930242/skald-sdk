"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { cn } from "@skald/sheet-sdk/lib/utils";
import { LOCALES, MODES, type PreviewMode } from "./systems";

/** The language switch: the same page in the other locale. */
export function LocaleSwitch({ path }: { path: (locale: string) => string }) {
  const t = useTranslations("previewer");
  const current = useLocale();
  return (
    <nav aria-label={t("language")} className="flex gap-1 text-sm">
      {LOCALES.map((locale) => (
        <Link
          key={locale}
          href={path(locale)}
          lang={locale}
          aria-current={locale === current ? "page" : undefined}
          className={cn("rounded-btn px-3 py-1", locale === current ? "state-selected" : "hover:bg-muted")}
        >
          {t(`locales.${locale}`)}
        </Link>
      ))}
    </nav>
  );
}

/** Play, edit and print as links, so each mode has its own URL. */
export function ModeSwitch({ locale, slug, mode }: { locale: string; slug: string; mode: PreviewMode }) {
  const t = useTranslations("previewer.modes");
  return (
    <nav className="flex gap-1 text-sm" data-mode-switch>
      {MODES.map((candidate) => (
        <Link
          key={candidate}
          href={`/${locale}/${slug}?mode=${candidate}`}
          aria-current={candidate === mode ? "page" : undefined}
          className={cn("rounded-btn px-3 py-1", candidate === mode ? "state-selected" : "hover:bg-muted")}
        >
          {t(candidate)}
        </Link>
      ))}
    </nav>
  );
}
