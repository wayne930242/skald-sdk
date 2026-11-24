import type { RulesCorpus, RulesLocale } from "./corpus";
export async function loadRules(locale: RulesLocale): Promise<RulesCorpus> {
  const corpus =
    locale === "en"
      ? await import("@skald/system-fate/data/fate-condensed/rules/en.json")
      : await import("@skald/system-fate/data/fate-condensed/rules/zh-TW.json");
  return corpus.default as unknown as RulesCorpus;
}
export async function loadRulesMessages(locale: RulesLocale) {
  const messages =
    locale === "en"
      ? await import("@skald/system-fate/data/fate-condensed/messages/v2-rules/en.json")
      : await import("@skald/system-fate/data/fate-condensed/messages/v2-rules/zh-TW.json");
  return messages.default;
}
