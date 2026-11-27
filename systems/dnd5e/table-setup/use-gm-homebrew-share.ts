"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { TableSetupAfterSaveResult, TableSetupEditorProps } from "@skald/sheet-sdk/modules/systems";
import type { HomebrewItemRecord, HomebrewPackRecord } from "../homebrew/domain/types";
import type { DndHomebrewStore, HomebrewOwner } from "../homebrew/store-port";
import type { DndTableHomebrew, TableShareErrorCode } from "../homebrew/table-share-port";
import {
  baselineOf,
  draftFromShare,
  shareAction,
  viewShare,
  type ShareDraft,
  type ShareSnapshot,
  type ShareView,
} from "./gm-homebrew-model";

/** What the picker reads: the last load, the viewer's draft over it, and how the draft stands. */
export interface GmHomebrewShare {
  status: "loading" | "ready" | "error";
  /** Who is signed in: only an account lists its own rows and shares them. */
  account: HomebrewOwner;
  packs: readonly HomebrewPackRecord[];
  snapshot: ShareSnapshot | null;
  draft: ShareDraft;
  view: ShareView | null;
  /** A removal of someone's share is running. */
  busy: boolean;
  toggle(id: string): void;
  setRefresh(on: boolean): void;
  setRemoveDeleted(on: boolean): void;
  /** The owner removes another sharer's share at once (after the picker's confirm). */
  removeOther(sharedBy: string): Promise<TableSetupAfterSaveResult>;
  reload(): void;
}

interface Loaded {
  account: HomebrewOwner;
  packs: HomebrewPackRecord[];
  snapshot: ShareSnapshot;
  baseline: ReadonlySet<string>;
}

const EMPTY_DRAFT: ShareDraft = { picked: [], refresh: false, removeDeleted: false };

class LoadError extends Error {}

/**
 * The viewer's share of a table's 「GM 的自製內容」 (ADR 0018, homebrew step 8), behind the table
 * port and the homebrew store: loaded once the source is ticked, and an after-save hook that sends
 * the share when it changed, or removes it when the source was unticked. A failed share keeps the
 * draft; a conflict reloads the table's shares and keeps the ticks.
 */
export function useGmHomebrewShare({ port, store, tableId, ticked, registerAfterSave }: {
  port: DndTableHomebrew | null;
  store: DndHomebrewStore | null;
  tableId: string;
  ticked: boolean;
  registerAfterSave: TableSetupEditorProps<unknown>["registerAfterSave"];
}): GmHomebrewShare {
  const t = useTranslations("dndShare");
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [status, setStatus] = useState<GmHomebrewShare["status"]>("loading");
  const [draft, setDraft] = useState<ShareDraft>(EMPTY_DRAFT);
  const [busy, setBusy] = useState(false);
  const loads = useRef(0);
  const wanted = !!port && !!store && ticked;
  const started = useRef(false);

  const load = useCallback(async (keepDraft: boolean): Promise<boolean> => {
    if (!port || !store) return false;
    const run = ++loads.current;
    try {
      const account = await store.owner();
      let packs: HomebrewPackRecord[] = [];
      const rows: HomebrewItemRecord[] = [];
      if (account === "account") {
        const listed = await store.listPacks();
        if (!listed.ok) throw new LoadError(listed.error);
        packs = listed.value;
        for (const pack of packs) {
          const items = await store.listItems(pack.id);
          if (!items.ok) throw new LoadError(items.error);
          rows.push(...items.value);
        }
      }
      const shares = await port.listShares(tableId);
      if (!shares.ok) throw new LoadError(shares.error);
      if (run !== loads.current) return false;
      const snapshot: ShareSnapshot = { rows, list: shares.value };
      setLoaded({ account, packs, snapshot, baseline: baselineOf(snapshot) });
      const live = new Set(rows.map((row) => row.id));
      setDraft((current) => (keepDraft ? { ...current, picked: current.picked.filter((id) => live.has(id)) } : draftFromShare(snapshot)));
      setStatus("ready");
      return true;
    } catch {
      if (run === loads.current) setStatus("error");
      return false;
    }
  }, [port, store, tableId]);

  useEffect(() => {
    if (!wanted || started.current) return;
    started.current = true;
    void load(false);
  }, [wanted, load]);

  const view = loaded ? viewShare(loaded.snapshot, draft, loaded.baseline) : null;

  // The after-save hook reads the state as it stands when the setup has saved.
  const latest = useRef({ loaded, draft, ticked });
  useEffect(() => {
    latest.current = { loaded, draft, ticked };
  });
  const message = useCallback((code: TableShareErrorCode) => t(`errors.${code}`), [t]);
  const zh = useLocale() === "zh-TW";
  // An entry's name as the picker shows it; null when the id is none of the viewer's rows.
  const nameOf = useCallback((rows: readonly HomebrewItemRecord[], id: string | undefined): string | null => {
    const row = id ? rows.find((r) => r.id === id) : undefined;
    return row ? (zh ? row.payload.zhTW?.name : undefined) || row.payload.entry?.name || row.key : null;
  }, [zh]);

  useEffect(() => {
    if (!port || !store) return;
    return registerAfterSave(async ({ tableId: savedTable }): Promise<TableSetupAfterSaveResult> => {
      const { loaded: current, draft: currentDraft, ticked: on } = latest.current;
      if (!current) return { ok: true };
      const action = shareAction(current.snapshot, currentDraft, current.baseline, on);
      switch (action.kind) {
        case "none":
          return { ok: true };
        case "blocked":
          return { ok: false, message: message(action.over === "items" ? "limitItems" : "limitBytes") };
        case "duplicate": {
          const rows = current.snapshot.rows;
          return { ok: false, message: t("errors.duplicate", { first: nameOf(rows, action.first) ?? "", second: nameOf(rows, action.second) ?? "" }) };
        }
        case "remove": {
          let failed: TableShareErrorCode | null = null;
          for (const sharer of action.sharers) {
            const removed = await port.removeShare(savedTable, sharer);
            if (!removed.ok) failed ??= removed.error;
          }
          await load(false);
          return failed ? { ok: false, message: message(failed) } : { ok: true };
        }
        case "share": {
          const shared = await port.share(savedTable, action.ids, action.expectedRevision);
          if (shared.ok) {
            await load(false);
            return { ok: true };
          }
          if (shared.error === "conflict") await load(true);
          const refused = shared.error === "invalid" ? nameOf(current.snapshot.rows, shared.detail) : null;
          return { ok: false, message: refused ? t("errors.invalidEntry", { name: refused }) : message(shared.error) };
        }
      }
    });
  }, [port, store, registerAfterSave, load, message, nameOf, t]);

  const removeOther = useCallback(async (sharedBy: string): Promise<TableSetupAfterSaveResult> => {
    if (!port) return { ok: true };
    setBusy(true);
    const removed = await port.removeShare(tableId, sharedBy);
    await load(true);
    setBusy(false);
    return removed.ok ? { ok: true } : { ok: false, message: message(removed.error) };
  }, [port, tableId, load, message]);

  return {
    status: loaded && status === "loading" ? "ready" : status,
    account: loaded?.account ?? "account",
    packs: loaded?.packs ?? [],
    snapshot: loaded?.snapshot ?? null,
    draft,
    view,
    busy,
    toggle: (id) => setDraft((d) => ({ ...d, picked: d.picked.includes(id) ? d.picked.filter((x) => x !== id) : [...d.picked, id] })),
    setRefresh: (on) => setDraft((d) => ({ ...d, refresh: on })),
    setRemoveDeleted: (on) => setDraft((d) => ({ ...d, removeDeleted: on })),
    removeOther,
    reload: () => {
      setStatus("loading");
      void load(true);
    },
  };
}
