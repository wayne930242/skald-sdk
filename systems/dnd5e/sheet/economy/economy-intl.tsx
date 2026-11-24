"use client";

import { use, useMemo, type ReactNode } from "react";
import { NextIntlClientProvider, useLocale, useMessages } from "next-intl";
import { cachedUntilRejected } from "../play/play-messages";

/**
 * The items and economy labels (`economy.*`, `messages/economy`, plan-uat2 §4): the shop, the coin
 * purse, the carry summary, item settings and the magic item dialog. They load with the 物品 tab,
 * never with the sheet.
 */
type Messages = Record<string, unknown>;

const loaded = new Map<string, Promise<Messages>>();

export function loadEconomyMessages(locale: string): Promise<Messages> {
  const key = locale === "zh-TW" ? "zh-TW" : "en";
  return cachedUntilRejected(loaded, key, () => {
    const pending = (key === "zh-TW" ? import("@skald/system-dnd5e/data/dnd5e-2024/messages/economy/zh-TW.json") : import("@skald/system-dnd5e/data/dnd5e-2024/messages/economy/en.json")).then(
      (module) => module.default as Messages,
    );
    // Marked the way React's `use` reads a settled promise, so a later mount renders at once.
    void pending.then((value) => Object.assign(pending, { status: "fulfilled", value }), () => {});
    return pending;
  });
}

/** Provides `economy.*` to its children; suspends until loaded. */
export function EconomyIntl({ children }: { children: ReactNode }) {
  const locale = useLocale();
  const economy = use(loadEconomyMessages(locale));
  const messages = useMessages();
  const merged = useMemo(() => ({ ...messages, economy }), [messages, economy]);
  return (
    <NextIntlClientProvider locale={locale} messages={merged}>
      {children}
    </NextIntlClientProvider>
  );
}
