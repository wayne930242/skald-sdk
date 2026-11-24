/**
 * The two table reads the Fate sheet makes without the session's table rules code (see
 * table-bridge.ts): whether a running rules plugin holds this copy, and the carry-out snapshot.
 * The host serves them through `fateTableReadsPort`; a host without tables (the previewer, a
 * test) leaves it out, and the sheet keeps its own behaviour: no copy of it can be at a table.
 */
import { defineHostPort } from "@skald/sheet-sdk/modules/systems/ui/host-ports";
import type { TableRulesErrorCode } from "@skald/sheet-sdk/modules/table-rules";
import type { FateSettledSnapshot } from "../../table-rules/domain/view";

export type FateCopyActivation =
  /** A vault card, a copy of an inactive or deleted table, or an unreadable one. */
  | { readonly status: "free" }
  | { readonly status: "active"; readonly tableId: string; readonly revision: number }
  | { readonly status: "error"; readonly code: TableRulesErrorCode };

export type FateCarryOutRead =
  /** Not a table copy with a wallet the viewer owns: offer nothing. */
  | { readonly status: "none" }
  /** A scene is open: the balance is not settled yet. */
  | { readonly status: "sceneOpen"; readonly tableId: string }
  | { readonly status: "ready"; readonly tableId: string; readonly snapshot: FateSettledSnapshot }
  | { readonly status: "error"; readonly code: TableRulesErrorCode };

/** Reads made as the signed-in user; the server authorizes them. */
export interface FateTableReads {
  /** Whether a running table rules plugin holds this copy (ADR 0015's activation for a character). */
  readCopyActivation(characterId: string): Promise<FateCopyActivation>;
  /**
   * The booked balance the card's owner may take from its table (with no open scene, after
   * deactivation, or after the table was deleted). Only the balance: grants, deferred credits,
   * offers and receipts stay at the table.
   */
  readCarryOut(characterId: string): Promise<FateCarryOutRead>;
}

export const fateTableReadsPort = defineHostPort<FateTableReads>("fate.tableReads");
