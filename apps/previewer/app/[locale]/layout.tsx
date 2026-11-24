import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { PreviewerProviders } from "../../lib/previewer-providers";
import { isLocale, LOCALES } from "../../lib/systems";
import "../globals.css";

export const dynamicParams = false;

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export default async function LocaleLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return (
    <html lang={locale}>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <PreviewerProviders locale={locale}>{children}</PreviewerProviders>
      </body>
    </html>
  );
}
