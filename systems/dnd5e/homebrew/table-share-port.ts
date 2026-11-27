/**
 * The host port behind 「GM 的自製內容」 on a table (ADR 0018, homebrew step 8): the frozen copies of
 * homebrew entries that a table's owner and GM assistants brought to it. skald.tw binds it to its
 * database (`share_table_homebrew`, migration 188); a host without it (the SDK previewer) binds
 * nothing, and the setup page then hides the option. The client sends ids, never content: the server
 * copies the sharer's own rows. Plugin code reaches storage only through it.
 */
import { defineHostPort } from "@skald/sheet-sdk/modules/systems/ui/host-ports";
import type { HomebrewItemKind } from "./domain/types";

/**
 * Why a call failed. `signIn`: no account is signed in. `guest`: a guest account cannot share.
 * `forbidden`: the viewer is not the owner or an approved GM assistant (or, to remove, the sharer
 * or the owner). `setupMissing`: the table has no saved setup yet. `notFound`: no such live table.
 * `conflict`: the share changed since it was read (`expectedRevision`). `invalid`: an id is not the
 * viewer's own shareable row of this System, or two share a kind and key (detail: the first such
 * id). `limitItems` / `limitBytes`: the table's 300 rows or 1 MiB across sharers. `network`: no
 * answer from the database.
 */
export type TableShareErrorCode =
  | "signIn" | "guest" | "forbidden" | "setupMissing" | "notFound" | "conflict" | "invalid"
  | "limitItems" | "limitBytes" | "network";

export type TableShareResult<T> = { ok: true; value: T } | { ok: false; error: TableShareErrorCode; detail?: string };

/** One frozen row on the table. */
export interface TableShareItem {
  id: string;
  kind: HomebrewItemKind;
  key: string;
  /** The entry's English name, and its zh-TW name when the row has one. */
  name: string;
  nameZh?: string;
  /** The sharer's row it was copied from (may since be edited or deleted). */
  sourceItemId: string;
  sourcePackId: string;
  sourceRevision: number;
}

/** What one sharer's share holds and counts. */
export interface TableShareSummary {
  sharedBy: string;
  /** Server-owned; moves on every share call and never repeats. Send it back as `expectedRevision`. */
  revision: number;
  itemCount: number;
  payloadBytes: number;
  createdAt: string;
  updatedAt: string;
}

export interface TableShare extends TableShareSummary {
  /** The sharer's display name; null when they have none. */
  sharerName: string | null;
  /** The table's owner (the others are GM assistants, or were). */
  isOwner: boolean;
  items: TableShareItem[];
}

/** A table's shares as the signed-in viewer reads them. */
export interface TableShareList {
  /** The signed-in account: its share is the one the viewer edits. */
  viewerId: string;
  /** The table's owner, who may remove anyone's share; null when the viewer cannot read the table. */
  ownerId: string | null;
  /** Every share on the table, the owner's first, then by when each was first made. */
  shares: TableShare[];
}

export interface DndTableHomebrew {
  /** The table's shares, with who reads them and who owns the table. */
  listShares(tableId: string): Promise<TableShareResult<TableShareList>>;
  /**
   * Replaces the viewer's share with copies of their own rows `itemIds` (the server copies their
   * current revision). `expectedRevision`: the viewer's share revision as read, 0 for none. An
   * empty list removes the share and answers null.
   */
  share(tableId: string, itemIds: readonly string[], expectedRevision: number): Promise<TableShareResult<TableShareSummary | null>>;
  /** The sharer themself, or the table's owner, removes one share; false when there was none. */
  removeShare(tableId: string, sharedBy: string): Promise<TableShareResult<boolean>>;
}

export const dndTableHomebrewPort = defineHostPort<DndTableHomebrew>("dnd5e.tableHomebrew");
