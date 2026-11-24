"use client";

import { use, useMemo, type ReactNode } from "react";
import { NextIntlClientProvider, useLocale, useMessages } from "next-intl";

/**
 * The roll tray's own labels (`fateRolls.*`): one small chunk per locale, loaded when a roll
 * surface first mounts, never with the Fate core catalog or the play shell.
 */
type Messages = Record<string, unknown>;

const loaded = new Map<string, Promise<Messages>>();

function importFor(locale: "en" | "zh-TW"): Promise<Messages> {
  return locale === "zh-TW"
    ? import("@skald/system-fate/data/fate-condensed/messages/v2-rolls/zh-TW.json").then((module) => module.default as Messages)
    : import("@skald/system-fate/data/fate-condensed/messages/v2-rolls/en.json").then((module) => module.default as Messages);
}

/** One load per locale (React's `use` needs the same promise); a failed chunk is retried on the next mount. */
export function loadFateRollMessages(locale: string): Promise<Messages> {
  const key = locale === "zh-TW" ? "zh-TW" : "en";
  let found = loaded.get(key);
  if (!found) {
    const pending = importFor(key);
    found = pending;
    loaded.set(key, pending);
    pending.catch(() => {
      if (loaded.get(key) === pending) loaded.delete(key);
    });
  }
  return found;
}

/** Adds the roll labels to whatever the surrounding provider has (the play view's and the System's). */
export function FateRollMessages({ children }: { children: ReactNode }) {
  const locale = useLocale();
  const rolls = use(loadFateRollMessages(locale));
  const messages = useMessages();
  const merged = useMemo(() => ({ ...messages, ...rolls }), [messages, rolls]);
  return (
    <NextIntlClientProvider locale={locale} messages={merged}>
      {children}
    </NextIntlClientProvider>
  );
}
