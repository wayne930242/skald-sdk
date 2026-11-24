export async function loadFatePrintMessages(locale: string) {
  const { default: messages } = await (locale === "zh-TW"
    ? import("@skald/system-fate/data/fate-condensed/messages/v2-print/zh-TW.json")
    : import("@skald/system-fate/data/fate-condensed/messages/v2-print/en.json"));
  return messages;
}
