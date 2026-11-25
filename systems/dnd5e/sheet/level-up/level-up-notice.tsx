"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import type { LevelUpRequest } from "../play/play-context";
import { undoLevelUp, type LevelUpUndo, type UndoResult } from "./apply";
import { useListText } from "./list-text";

/**
 * The level-up notice (UAT M2, M3): one toast per level up, its id shared so a newer level up
 * replaces it, holding 已升到 N 級, what the sheet recalculated and 復原, gone after 20 s. Only the
 * latest level up can be undone, from that toast or from the dialog's result screen.
 */

export const LEVEL_UP_TOAST_ID = "dnd5e-level-up";
export const LEVEL_UP_TOAST_MS = 20_000;

type Run = { token: symbol; undo: LevelUpUndo };

// One device, one latest run: a newer level up (on any sheet) retires the older undo.
let latest: Run | null = null;
const listeners = new Set<() => void>();

function setLatest(run: Run | null) {
  latest = run;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The token of the level up that can still be undone, or null. */
export function useLatestLevelUp(): symbol | null {
  return useSyncExternalStore(subscribe, () => latest?.token ?? null, () => null);
}

const text = (value: unknown) => (typeof value === "string" ? value : "");
const rowsIn = (data: Record<string, unknown>, list: string) => (Array.isArray(data[list]) ? (data[list] as Array<Record<string, unknown>>) : []);

export interface LevelUpNotice {
  /** Shows the notice of a run that wrote `after` over `before`; returns its undo token. */
  announce: (level: number, written: LevelUpUndo, before: Record<string, unknown>, after: Record<string, unknown>) => symbol;
  /** Undoes the run when it is still the latest; `onUndone` gets the data after the undo. False when it is not. */
  undo: (token: symbol, onUndone?: (data: Record<string, unknown>) => void) => boolean;
}

export function useLevelUpNotice(request: LevelUpRequest): LevelUpNotice {
  const t = useTranslations("levelUp");
  const tField = useTranslations("field");
  const tMulti = useTranslations("levelUp.multiclass");
  const list = useListText();

  /** A skipped field's label; a row field (`multiclass.<id>.<field>`) reads like "Wizard's level". */
  const fieldLabel = (data: Record<string, unknown>, field: string) => {
    const label = (key: string) => (tField.has(key) ? tField(key) : key);
    const [listId, id, rowField] = field.split(".");
    if (rowField === undefined) return label(field);
    const row = rowsIn(data, listId).find((entry) => entry?.id === id);
    return tMulti("rowField", { name: text(row?.name) || label(listId), field: label(rowField) });
  };

  const undone = (previous: Record<string, unknown>, result: UndoResult) => {
    const keptRows = result.skipped.rows.flatMap(({ list: listId, id }) => {
      const row = rowsIn(previous, listId).find((entry) => entry?.id === id);
      if (!row) return [];
      const name = text(row.name) || id;
      return [listId === "multiclass" ? tMulti("keptRow", { name }) : name];
    });
    const kept = [...result.skipped.fields.map((field) => fieldLabel(previous, field)), ...keptRows];
    const common = { id: LEVEL_UP_TOAST_ID, action: undefined, closeButton: true };
    if (kept.length > 0) toast.warning(t("undone"), { ...common, description: t("undoKept", { items: list(kept) }), duration: LEVEL_UP_TOAST_MS });
    else toast.success(t("undone"), { ...common, description: undefined, duration: 5000 });
  };

  const undo: LevelUpNotice["undo"] = (token, onUndone) => {
    if (!latest || latest.token !== token) return false;
    const written = latest.undo;
    setLatest(null);
    request.update((previous) => {
      const result = undoLevelUp(previous, written);
      queueMicrotask(() => {
        undone(previous, result);
        onUndone?.(result.data);
      });
      return result.data;
    });
    return true;
  };

  const announce: LevelUpNotice["announce"] = (level, written, before, after) => {
    const token = Symbol("level-up");
    setLatest({ token, undo: written });
    const show = (description?: ReactNode) =>
      toast.success(t("done", { level }), {
        id: LEVEL_UP_TOAST_ID,
        description,
        duration: LEVEL_UP_TOAST_MS,
        closeButton: true,
        action: { label: t("undo"), onClick: () => undo(token) },
      });
    show();
    // What the sheet recalculated joins the same toast, while this run is still the latest.
    request.recalc(before, after, (rows, title) => {
      if (latest?.token !== token) return;
      show(
        <div data-level-up-recalc>
          <p className="font-medium">{title}</p>
          {rows}
        </div>,
      );
    });
    return token;
  };

  return { announce, undo };
}
