"use client";

import { NextIntlClientProvider, useMessages, useLocale } from "next-intl";
import { useMemo } from "react";

type Messages = Record<string, unknown>;

interface ClientSystemIntlProviderProps {
  systemMessages: Messages;
  children: React.ReactNode;
}

/**
 * Client-side provider for system-specific translations.
 * Use this in client components where the async SystemIntlProvider cannot be used.
 *
 * Usage:
 * ```tsx
 * import messagesZhTW from "@/data/<system>/messages/zh-TW.json";
 * import messagesEn from "@/data/<system>/messages/en.json";
 *
 * const systemMessages = locale === "zh-TW" ? messagesZhTW : messagesEn;
 *
 * <ClientSystemIntlProvider systemMessages={systemMessages}>
 *   <TemplateRenderer ... />
 * </ClientSystemIntlProvider>
 * ```
 */
export function ClientSystemIntlProvider({
  systemMessages,
  children,
}: ClientSystemIntlProviderProps) {
  const locale = useLocale();
  const globalMessages = useMessages();

  const mergedMessages = useMemo(
    () =>
      deepMerge(
        globalMessages as Messages,
        systemMessages as Messages,
      ),
    [globalMessages, systemMessages]
  );

  return (
    <NextIntlClientProvider locale={locale} messages={mergedMessages}>
      {children}
    </NextIntlClientProvider>
  );
}

function deepMerge(target: Messages, source: Messages): Messages {
  const result: Messages = { ...target };

  for (const key of Object.keys(source)) {
    const sourceValue = source[key];
    const targetValue = result[key];

    if (
      sourceValue &&
      typeof sourceValue === "object" &&
      !Array.isArray(sourceValue) &&
      targetValue &&
      typeof targetValue === "object" &&
      !Array.isArray(targetValue)
    ) {
      result[key] = deepMerge(
        targetValue as Messages,
        sourceValue as Messages,
      );
    } else {
      result[key] = sourceValue;
    }
  }

  return result;
}
