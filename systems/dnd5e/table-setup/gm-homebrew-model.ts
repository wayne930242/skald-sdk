/**
 * The share picker's state on the table setup page (ADR 0018, homebrew step 8): what the viewer
 * ticked against what their share holds, and what the after-save step sends. A share call always
 * replaces the viewer's whole share with copies of the current revisions, so any change re-copies
 * every ticked entry; with no change nothing is sent and the table keeps its frozen copies.
 * Pure: no React, Next, Supabase or environment.
 */
import {
  checkShareLimits,
  isShareableKind,
  refreshShare,
  shareClosure,
  sharedStatus,
  type ShareClosure,
  type ShareLimitCheck,
  type SharedStatus,
} from "../homebrew/domain/share";
import type { HomebrewItemKind, HomebrewItemRecord } from "../homebrew/domain/types";
import type { TableShare, TableShareItem, TableShareList } from "../homebrew/table-share-port";

/** Kinds the viewer ticks; class and subclass features only ride with their class or subclass. */
export function isPickableKind(kind: HomebrewItemKind): boolean {
  return isShareableKind(kind) && kind !== "classFeature" && kind !== "subclassFeature";
}

/** What the viewer changed since the share was read. */
export interface ShareDraft {
  /** The viewer's own rows they ticked. */
  picked: readonly string[];
  /** 「更新到桌上」: copy every ticked entry again even when the ticks did not change. */
  refresh: boolean;
  /** Remove the rows whose source the viewer deleted. */
  removeDeleted: boolean;
}

/** The viewer's own rows and the table's shares, as last read. */
export interface ShareSnapshot {
  rows: readonly HomebrewItemRecord[];
  list: TableShareList;
}

export const ownShare = (list: TableShareList): TableShare | undefined => list.shares.find((s) => s.sharedBy === list.viewerId);

/** The draft that matches the share as read: its live, pickable sources ticked, in the rows' order. */
export function draftFromShare(snapshot: ShareSnapshot): ShareDraft {
  const shared = new Set((ownShare(snapshot.list)?.items ?? []).map((item) => item.sourceItemId));
  const picked = snapshot.rows.filter((row) => shared.has(row.id) && isPickableKind(row.kind)).map((row) => row.id);
  return { picked, refresh: false, removeDeleted: false };
}

/** The ids a draft's ticks send, as a set: what the share as read stands for. */
export function baselineOf(snapshot: ShareSnapshot): ReadonlySet<string> {
  return new Set(shareClosure(snapshot.rows, draftFromShare(snapshot).picked).ids);
}

export interface ShareView {
  closure: ShareClosure;
  /** The ids differ from the share as read, or an update or removal was asked for: saving sends a share. */
  dirty: boolean;
  /** The table's total: everyone else's shares as they stand, plus this draft when it changed (else the viewer's share as it stands). */
  limits: ShareLimitCheck;
  /** Each of the viewer's rows on the table, by source id: how it compares with the source. */
  status: ReadonlyMap<string, SharedStatus>;
  /** Rows on the table whose source the viewer deleted. */
  deleted: readonly TableShareItem[];
  /** Some row on the table has a newer source. */
  hasNewer: boolean;
}

const sameSet = (a: readonly string[], b: ReadonlySet<string>) => a.length === b.size && a.every((id) => b.has(id));

export function viewShare(snapshot: ShareSnapshot, draft: ShareDraft, baseline: ReadonlySet<string>): ShareView {
  const own = ownShare(snapshot.list);
  const items = own?.items ?? [];
  const closure = shareClosure(snapshot.rows, draft.picked);
  const status = new Map<string, SharedStatus>();
  for (const item of items) status.set(item.sourceItemId, sharedStatus(item, snapshot.rows));
  const dropped = new Set(refreshShare(items, snapshot.rows).dropped.map((d) => d.sourceItemId));
  const deleted = items.filter((item) => dropped.has(item.sourceItemId));
  const byId = new Map(snapshot.rows.map((row) => [row.id, row]));
  const others = snapshot.list.shares
    .filter((s) => s.sharedBy !== snapshot.list.viewerId)
    .map((s) => ({ items: s.itemCount, bytes: s.payloadBytes }));
  const dirty = draft.refresh || (draft.removeDeleted && deleted.length > 0) || !sameSet(closure.ids, baseline);
  // Unchanged, the viewer's share counts as it stands on the table (deleted sources included).
  const limits = dirty || !own
    ? checkShareLimits(closure.ids.map((id) => byId.get(id)!), others)
    : checkShareLimits([], [...others, { items: own.itemCount, bytes: own.payloadBytes }]);
  return { closure, dirty, limits, status, deleted, hasNewer: [...status.values()].includes("newer") };
}

/** What the after-save step does. */
export type ShareAction =
  | { kind: "none" }
  | { kind: "share"; ids: string[]; expectedRevision: number }
  | { kind: "remove"; sharers: string[] }
  | { kind: "blocked"; over: "items" | "bytes" }
  /** Two rows of one kind and key: the server would refuse `second`. */
  | { kind: "duplicate"; first: string; second: string };

/**
 * With 「GM 的自製內容」 ticked: the draft's share when it changed (or nothing), refused locally over
 * the table's limits. Unticked: the viewer's own share leaves, and the owner's removal takes
 * everyone's.
 */
export function shareAction(snapshot: ShareSnapshot, draft: ShareDraft, baseline: ReadonlySet<string>, ticked: boolean): ShareAction {
  const { viewerId, ownerId, shares } = snapshot.list;
  if (!ticked) {
    const sharers = shares.filter((s) => s.sharedBy === viewerId || viewerId === ownerId).map((s) => s.sharedBy);
    return sharers.length > 0 ? { kind: "remove", sharers } : { kind: "none" };
  }
  const view = viewShare(snapshot, draft, baseline);
  if (!view.dirty) return { kind: "none" };
  const [twin] = view.closure.duplicates;
  if (twin) return { kind: "duplicate", first: twin.first, second: twin.second };
  if (view.limits.over) return { kind: "blocked", over: view.limits.over };
  return { kind: "share", ids: view.closure.ids, expectedRevision: ownShare(snapshot.list)?.revision ?? 0 };
}
