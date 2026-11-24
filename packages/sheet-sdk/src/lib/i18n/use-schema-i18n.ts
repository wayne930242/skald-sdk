"use client";

import { useMessages, useLocale } from "next-intl";
import { Fragment, createContext, createElement, useContext, useMemo } from "react";
import {
  compileSchemaI18n,
} from "@skald/sheet-sdk/lib/i18n/schema-i18n";

interface SchemaI18nValue {
  resolveI18n: (text: string | undefined) => string;
  t: (key: string, values?: Record<string, string | number>) => string;
  locale: string;
  messages: Record<string, string>;
}

const SchemaI18nContext = createContext<SchemaI18nValue | null>(null);

function useResolvedSchemaI18n(
  rawMessages: Record<string, unknown>,
  locale: string,
  cacheKey?: string,
): SchemaI18nValue {
  // cacheKey busts memo when the same rawMessages ref carries new content
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const compiled = useMemo(() => compileSchemaI18n(rawMessages), [rawMessages, cacheKey]);

  return useMemo(
    () => ({
      resolveI18n: compiled.resolveI18n,
      t: compiled.t,
      locale,
      messages: compiled.messages,
    }),
    [compiled, locale],
  );
}

/**
 * Hook that provides i18n interpolation for schema-driven rendering.
 */
export function useSchemaI18n() {
  const context = useContext(SchemaI18nContext);
  const messages = useMessages() as Record<string, unknown>;
  const locale = useLocale();
  const resolved = useResolvedSchemaI18n(messages, locale);

  return context ?? resolved;
}

interface SchemaI18nProviderProps {
  children: React.ReactNode;
  messages?: Record<string, unknown>;
  locale?: string;
  cacheKey?: string;
}

/**
 * Explicit provider for schema i18n.
 * If messages/locale are omitted, it will use next-intl context values.
 */
export function SchemaI18nProvider({
  children,
  messages,
  locale,
  cacheKey,
}: SchemaI18nProviderProps) {
  const intlMessages = useMessages() as Record<string, unknown>;
  const intlLocale = useLocale();

  const value = useResolvedSchemaI18n(
    messages ?? intlMessages,
    locale ?? intlLocale,
    cacheKey,
  );

  return createElement(SchemaI18nContext.Provider, { value }, children);
}

/**
 * Avoid nesting duplicate providers. If parent schema i18n exists, reuse it.
 */
export function SchemaI18nBoundary({ children }: { children: React.ReactNode }) {
  const context = useContext(SchemaI18nContext);
  if (context) return createElement(Fragment, null, children);
  return createElement(SchemaI18nProvider, null, children);
}
