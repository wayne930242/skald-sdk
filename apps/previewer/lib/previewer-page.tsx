"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { LocaleSwitch, ModeSwitch } from "./previewer-nav";
import { PreviewerSheet } from "./previewer-sheet";
import { isMode } from "./systems";

/** One system's sheet page: the mode comes from `?mode=`, play when it names none. */
export function PreviewerPage({ locale, slug }: { locale: string; slug: string }) {
  const t = useTranslations("previewer");
  const router = useRouter();
  const requested = useSearchParams().get("mode");
  const mode = isMode(requested) ? requested : "play";
  return (
    <main className="mx-auto max-w-[1400px] px-4 py-6">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Link href={`/${locale}`} className="text-sm text-muted-foreground hover:underline">
            {t("home")}
          </Link>
          <h1 className="text-xl font-semibold">{t(`systems.${slug}`)}</h1>
          <ModeSwitch locale={locale} slug={slug} mode={mode} />
        </div>
        <LocaleSwitch path={(next) => `/${next}/${slug}?mode=${mode}`} />
      </header>
      <PreviewerSheet
        key={`${slug}:${locale}`}
        slug={slug}
        locale={locale}
        mode={mode}
        onClosePrint={() => router.push(`/${locale}/${slug}?mode=play`)}
      />
    </main>
  );
}
