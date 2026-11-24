import { use } from "react";
import { createTranslator, useLocale } from "next-intl";
const load = (locale: string) =>
  locale === "zh-TW"
    ? import("@skald/system-fate/data/fate-condensed/messages/v2-session/zh-TW.json")
    : import("@skald/system-fate/data/fate-condensed/messages/v2-session/en.json");
const cache = new Map<string, ReturnType<typeof load>>();
export function useSessionLabels() {
  const locale = useLocale();
  let p = cache.get(locale);
  if (!p) {
    p = load(locale);
    cache.set(locale, p);
    p.catch(() => cache.delete(locale));
  }
  return createTranslator({ locale, messages: use(p).default });
}
