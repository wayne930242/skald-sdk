"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { NextIntlClientProvider, useLocale, useMessages, useTranslations } from "next-intl";
import type { EntriesRenderContext } from "../reference/entries-renderer";
import { loadReferenceMessages, type ReferenceCatalog } from "../reference/load-corpus";
import { TIER_A_TAG_LABELS, type DndKind } from "../reference/tags";
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
    void loadReferenceMessages(locale).then((value) => {
      ready.set(locale, value);
      if (live) setCatalog({ locale, value });
    });
    return () => {
      live = false;
    };
  }, [loaded, locale]);
  const merged = useMemo(() => (loaded ? {
    ...messages, referenceUi: loaded.referenceUi ?? {}, referenceSearch: loaded.referenceSearch ?? {},
  } : null), [loaded, messages]);
  if (!merged) return null;
  return (
    <NextIntlClientProvider locale={locale} messages={merged}>
      {children}
    </NextIntlClientProvider>
  );
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
