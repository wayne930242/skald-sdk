"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { NextIntlClientProvider, useLocale, useMessages, useTranslations } from "next-intl";
import type { EntriesRenderContext } from "../reference/entries-renderer";
import { useHostPort } from "@skald/sheet-sdk/modules/systems/ui/host-ports";
import { loadReferenceMessages, type ReferenceCatalog } from "../reference/load-corpus";
import { TIER_A_TAG_LABELS, type DndKind } from "../reference/tags";
import { loadPlayMessages } from "./play/play-messages";
import { dndPackSourcePort } from "./pack-source-port";
import { useTablePackScope } from "./pack-scope";
import type { ReferenceContextValue } from "./use-reference-context";

/**
 * The reference views' own labels (`referenceUi.*`, plan T2b §5.10): they ride the lazy reference
 * catalog with the table and chapter names, not tier A (near its 64 KB budget and read by every
 * D&D sheet). Wraps the reference dialog, the compendium and the reader once they open.
 */
/** Catalogs already loaded, by locale: a later open renders at once. */
const ready = new Map<string, ReferenceCatalog>();

export function ReferenceIntl({ children }: { children: ReactNode }) {
  const locale = useLocale();
  const messages = useMessages();
  const [catalog, setCatalog] = useState<{ locale: string; value: ReferenceCatalog } | null>(null);
  const loaded = ready.get(locale) ?? (catalog?.locale === locale ? catalog.value : undefined);
  useEffect(() => {
    if (loaded) return;
    let live = true;
    // A failed chunk load stays unhandled, so it reaches the error reporting; the next open retries.
    void Promise.all([loadReferenceMessages(locale), loadPlayMessages(locale)]).then(([reference, play]) => {
      const { homebrewFrom, gmHomebrew, gmHomebrewFrom } = play;
      const value = { ...reference, referenceUi: { ...reference.referenceUi, homebrewFrom, gmHomebrew, gmHomebrewFrom } };
      ready.set(locale, value);
      if (live) setCatalog({ locale, value });
    });
    return () => {
      live = false;
    };
  }, [loaded, locale]);
  const packNames = useHostPackNames(locale);
  const merged = useMemo(() => (loaded ? {
    ...messages,
    referenceUi: packNames ? { ...loaded.referenceUi, packNames } : loaded.referenceUi ?? {},
    referenceSearch: loaded.referenceSearch ?? {},
  } : null), [loaded, messages, packNames]);
  if (!merged) return null;
  return (
    <NextIntlClientProvider locale={locale} messages={merged}>
      {children}
    </NextIntlClientProvider>
  );
}

/**
 * The pack names the host gives (`DndPackSource.packNames`), as `referenceUi.packNames`; null until
 * they load, or without the port. A failed load leaves the badges on the pack ids. On a table copy
 * whose setup takes the GM's homebrew (`useTablePackScope`), the host also names the table's sharers.
 */
export function useHostPackNames(locale: string, packIds?: readonly string[]): Readonly<Record<string, string>> | null {
  const source = useHostPort(dndPackSourcePort);
  const tableId = useTablePackScope()?.tableId;
  const [names, setNames] = useState<{ locale: string; value: Readonly<Record<string, string>> } | null>(null);
  useEffect(() => {
    if (!source?.packNames) return;
    let live = true;
    const read = tableId === undefined ? source.packNames(locale) : source.packNames(locale, { tableId });
    read.then((value) => live && setNames({ locale, value }), () => {});
    return () => {
      live = false;
    };
  }, [source, locale, packIds, tableId]);
  return names?.locale === locale ? names.value : null;
}

/** Kinds whose label lives in the lazy catalog (tier A names the others under `reference.kind`). */
const LAZY_KINDS: ReadonlySet<DndKind> = new Set(["creature", "table", "chapter"]);

/** The localized label of a ref kind, for badges in the reference dialog, search and compendium. */
export function useKindLabel(): (kind: DndKind) => string {
  const t = useTranslations("reference");
  const tUi = useTranslations("referenceUi");
  return (kind) => (LAZY_KINDS.has(kind) ? tUi(`kind.${kind}`) : t(`kind.${kind}`));
}

/** The one `{@hitYourSpellAttack}` text the SRD prints; any other wording stays as written. */
const SPELL_ATTACK_TEXT = "Bonus equals your spell attack modifier";

/**
 * The shared render context with the lazy stat block labels resolved in the viewer's language
 * (`{@hitYourSpellAttack}`, `{@actSaveFail 1}`, `{@atkr m}`…). Tier A labels resolve as before.
 */
export function useReferenceRenderContext(context: ReferenceContextValue): Omit<EntriesRenderContext, "onOpenRef"> {
  const tUi = useTranslations("referenceUi");
  return useMemo(() => {
    const base = context.renderContext;
    return {
      ...base,
      label: (key, value) => {
        if (key === "attack" && value) return tUi("tag.attackRoll", { value: value === "mr" ? "mr" : value });
        if (TIER_A_TAG_LABELS.has(key)) return base.label?.(key, value);
        if (key === "spellAttack" && value && value !== SPELL_ATTACK_TEXT) return undefined;
        return tUi(`tag.${key}`, { value: value ?? "" });
      },
    };
  }, [context.renderContext, tUi]);
}
