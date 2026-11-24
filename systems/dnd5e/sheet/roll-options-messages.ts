import { cachedUntilRejected } from "./play/play-messages";

type Messages = Record<string, unknown>;

const loaded = new Map<string, Promise<Messages>>();

/** The roll options dialogs' labels (`d20Roll.*`): a small chunk per locale, loaded with a dialog. */
export function loadD20RollMessages(locale: string): Promise<Messages> {
  const key = locale === "zh-TW" ? "zh-TW" : "en";
  return cachedUntilRejected(loaded, key, () =>
    key === "zh-TW"
      ? import("@skald/system-dnd5e/data/dnd5e-2024/messages/roll/zh-TW.json").then((module) => module.default as Messages)
      : import("@skald/system-dnd5e/data/dnd5e-2024/messages/roll/en.json").then((module) => module.default as Messages),
  );
}
