"use client";

import { createContext, use, useContext, useMemo, type ReactNode } from "react";
import { createTranslator, NextIntlClientProvider, useLocale, useMessages } from "next-intl";
import type { LaterText } from "./later-text";
import { cachedUntilRejected } from "./play-messages";
import { loadSnapshotLabels, type SnapshotLabels } from "./snapshot-labels";
import { loadPlayTabsMessages } from "./play-tabs-messages";

/**
 * The lazy play labels (plan-uat2 §4): the editing labels (`edit.*`: add, custom entries, row
 * menus, the text editor, edit mode) and the `play.*` labels only the lazy tabs read (combat,
 * spells, features, items, damage types) or only after an action (the rest and death save toasts,
 * the long rest confirmation: `later-text.ts`). They load with the first tab, dialog or edit card that
 * needs them, never with the sheet: the play view's first load stays within its budget.
 */
type Messages = Record<string, unknown>;

const SnapshotContext = createContext<SnapshotLabels | undefined>(undefined);
export const useSnapshotLabels = () => useContext(SnapshotContext);

export interface LazyPlayMessages {
  snapshotLabels: SnapshotLabels;
  edit: Messages;
  /** Merged into `play.*` under the tabs. */
  play: Messages;
}

const loaded = new Map<string, Promise<LazyPlayMessages>>();

const editPart = (locale: "en" | "zh-TW") =>
  (locale === "zh-TW" ? import("@skald/system-dnd5e/data/dnd5e-2024/messages/edit/zh-TW.json") : import("@skald/system-dnd5e/data/dnd5e-2024/messages/edit/en.json")).then(
    (module) => module.default as Messages,
  );

/** One load per locale. A resolved load is marked the way React's `use` reads it, so a later mount renders at once. */
export function loadEditMessages(locale: string): Promise<LazyPlayMessages> {
  const key = locale === "zh-TW" ? "zh-TW" : "en";
  return cachedUntilRejected(loaded, key, () => {
    const pending = Promise.all([editPart(key), loadPlayTabsMessages(key), loadSnapshotLabels(key)]).then(([edit, play, snapshotLabels]) => ({ edit, play, snapshotLabels }));
    void pending.then((value) => Object.assign(pending, { status: "fulfilled", value }), () => {});
    return pending;
  });
}

/** The lazy `play.*` labels as a translator, for what the sheet shows only after an action (`later-text.ts`). */
export function loadPlayTabsText(locale: string): Promise<LaterText> {
  const key = locale === "zh-TW" ? "zh-TW" : "en";
  return loadEditMessages(key).then(({ play }) => {
    const translate = createTranslator({ locale: key, messages: { play }, namespace: "play" });
    return (path, values) => translate(path as never, values as never);
  });
}

/** `spells` and `features` keep a few eager labels: their groups merge one level deep. */
function mergePlay(eager: Messages | undefined, lazy: Messages): Messages {
  const out: Messages = { ...eager };
  for (const [key, value] of Object.entries(lazy)) {
    const base = out[key];
    out[key] = typeof base === "object" && base !== null ? { ...(base as Messages), ...(value as Messages) } : value;
  }
  return out;
}

/** Provides the lazy labels to its children; suspends until they have loaded. */
export function EditIntl({ children }: { children: ReactNode }) {
  const locale = useLocale();
  const lazy = use(loadEditMessages(locale));
  const messages = useMessages();
  const merged = useMemo(() => ({ ...messages, edit: lazy.edit, play: mergePlay(messages.play as Messages | undefined, lazy.play) }), [messages, lazy]);
  return (
    <NextIntlClientProvider locale={locale} messages={merged}>
      <SnapshotContext.Provider value={lazy.snapshotLabels}>{children}</SnapshotContext.Provider>
    </NextIntlClientProvider>
  );
}
