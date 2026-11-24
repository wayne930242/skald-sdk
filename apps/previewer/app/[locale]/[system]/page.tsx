import { Suspense } from "react";
import { notFound } from "next/navigation";
import { isLocale, LOCALES, SYSTEM_SLUGS } from "../../../lib/systems";
import { PreviewerPage } from "../../../lib/previewer-page";

export const dynamicParams = false;

export function generateStaticParams() {
  return LOCALES.flatMap((locale) => SYSTEM_SLUGS.map((system) => ({ locale, system })));
}

export default async function SystemPage({ params }: { params: Promise<{ locale: string; system: string }> }) {
  const { locale, system } = await params;
  if (!isLocale(locale) || !SYSTEM_SLUGS.includes(system)) notFound();
  // The mode is a search parameter (?mode=play|edit|print), read on the client.
  return (
    <Suspense>
      <PreviewerPage locale={locale} slug={system} />
    </Suspense>
  );
}
