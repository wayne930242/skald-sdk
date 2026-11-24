import { cachedUntilRejected } from "./play-messages";

type Messages = Record<string, unknown>;

const loaded = new Map<string, Promise<Messages>>();

/**
 * The lazy `play.*` labels (`messages/play-tabs`): what only the lazy tabs and dialogs read, and
 * what shows only after an action, damage type names included (the wizard reads those too).
 */
export function loadPlayTabsMessages(locale: string): Promise<Messages> {
  const key = locale === "zh-TW" ? "zh-TW" : "en";
  return cachedUntilRejected(loaded, key, () =>
    key === "zh-TW"
      ? import("@skald/system-dnd5e/data/dnd5e-2024/messages/play-tabs/zh-TW.json").then((module) => module.default as Messages)
      : import("@skald/system-dnd5e/data/dnd5e-2024/messages/play-tabs/en.json").then((module) => module.default as Messages),
  );
}
