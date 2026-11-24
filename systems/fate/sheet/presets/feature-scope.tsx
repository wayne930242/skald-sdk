"use client";

import { NextIntlClientProvider, useLocale, useMessages, useTranslations } from "next-intl";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { loadFatePresetCatalog, loadFatePresetLabels } from "../../domain/presets";
import { TEXT_BUTTON } from "../play/card-styles";

type Feature = "harm" | "presets";
type Locale = "en" | "zh-TW";

function loadMessages(feature: Feature, locale: Locale) {
  if (feature === "harm") return locale === "zh-TW"
    ? import("@skald/system-fate/data/fate-condensed/messages/v2-harm/zh-TW.json")
    : import("@skald/system-fate/data/fate-condensed/messages/v2-harm/en.json");
  return locale === "zh-TW"
    ? import("@skald/system-fate/data/fate-condensed/messages/v2-presets/zh-TW.json")
    : import("@skald/system-fate/data/fate-condensed/messages/v2-presets/en.json");
}

async function loadFeature(feature: Feature, locale: Locale) {
  const [catalog, labels, messages] = await Promise.all([loadFatePresetCatalog(), loadFatePresetLabels(locale), loadMessages(feature, locale)]);
  return { catalog, labels, messages: messages.default };
}

export type FateFeatureResources = Pick<Awaited<ReturnType<typeof loadFeature>>, "catalog" | "labels">;

export function FateFeatureScope({ feature, children }: { feature: Feature; children: (resources: FateFeatureResources) => ReactNode }) {
  const locale = useLocale() === "zh-TW" ? "zh-TW" : "en";
  const t = useTranslations();
  const [attempt, setAttempt] = useState(0);
  const key = `${feature}:${locale}:${attempt}`;
  const [result, setResult] = useState<{ key: string; content: Awaited<ReturnType<typeof loadFeature>> | null }>();
  // The feature's labels join the surrounding ones (the shared `characters.derived` included).
  const outer = useMessages();
  const own = result?.key === key ? result.content?.messages : undefined;
  const messages = useMemo(() => ({ ...outer, ...own }), [outer, own]);
  useEffect(() => {
    let live = true;
    loadFeature(feature, locale).then(
      content => { if (live) setResult({ key, content }); },
      () => { if (live) setResult({ key, content: null }); },
    );
    return () => { live = false; };
  }, [feature, key, locale]);
  if (result?.key !== key) return <p role="status">{t("common.loading")}</p>;
  if (!result.content) return <div role="alert">{t("common.error")} <button type="button" className={TEXT_BUTTON} onClick={() => setAttempt(n => n + 1)}>{t("errorPages.error.retry")}</button></div>;
  return <NextIntlClientProvider locale={locale} messages={messages}>{children(result.content)}</NextIntlClientProvider>;
}