"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { LocaleSwitch } from "./previewer-nav";
import { MODES, SYSTEM_SLUGS } from "./systems";

export function PreviewerHome() {
  const t = useTranslations("previewer");
  const locale = useLocale();
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-10">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <LocaleSwitch path={(next) => `/${next}`} />
      </header>
      <p className="text-muted-foreground">{t("intro")}</p>
      <ul className="grid gap-4 sm:grid-cols-2">
        {SYSTEM_SLUGS.map((slug) => (
          <li key={slug} className="rounded-card border bg-card p-4 shadow-card">
            <h2 className="mb-3 font-semibold">{t(`systems.${slug}`)}</h2>
            <div className="flex gap-2">
              {MODES.map((mode) => (
                <Link key={mode} href={`/${locale}/${slug}?mode=${mode}`} className="rounded-btn border px-3 py-1 text-sm hover:bg-muted">
                  {t(`modes.${mode}`)}
                </Link>
              ))}
            </div>
          </li>
        ))}
      </ul>
      <Link className="underline" href={`/${locale}/pack`}>{t("systemPack.title")}</Link>
      <p className="text-sm text-muted-foreground">{t("unavailable")}</p>
    </main>
  );
}
