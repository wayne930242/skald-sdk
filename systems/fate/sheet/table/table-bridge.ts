/**
 * The Fate sheet's link to its table (plan-r2 T3). The sheet is reached from routes that must
 * never load table rules code (ADR 0015: only the session route reaches `modules/table-rules` and
 * `plugins/fate/table-rules`), so it cannot read the session's port itself. The Fate sheet-actions
 * slot, which the table rules host loads in the session only, reads the table's Fate view for the
 * selected character and publishes it here with the roll port; the sheet reads it by character.
 * Type-only imports keep the table rules code out of the sheet's bundle.
 */
import { create } from "zustand";
import type { TableRulesErrorCode, TableRulesReceipt, TableRulesResult } from "@skald/sheet-sdk/modules/table-rules";
import type { FateAspectKind } from "../../domain/character";
import type { FateTableView } from "../../table-rules/domain/view";

/** What the sheet posts its rolls with: the session's `TableRollPort` (structurally). */
export interface FateTableRollPort {
  postRoot(rpc: string, command: { operationId: string; payload: FateTableRollPayload }): Promise<FateTableRollResult>;
  publishFollowUp(
    rpc: string,
    command: { operationId: string; payload: FateTableRollPayload & { followUpOf: string } },
  ): Promise<FateTableRollResult>;
}

export interface FateTableRollPayload {
  readonly audience: "all" | "gm";
  readonly diceData: unknown;
  readonly details: unknown;
}

export type FateTableRollResult = TableRulesResult<TableRulesReceipt<{ readonly messageId: string } & Readonly<Record<string, unknown>>>>;

/** An aspect or consequence of another table character the viewer may read (display hiding kept). */
export interface FateTableCharacterAspect {
  readonly characterId: string;
  readonly characterName: string;
  /** The persisted aspect ID, or a consequence's injury ID. */
  readonly aspectId: string;
  readonly kind: FateAspectKind | "consequence";
  readonly text: string;
}

export interface FateTableLink {
  readonly tableId: string;
  readonly userId: string;
  readonly characterId: string;
  /** The viewer plays this character at the table (display only; the server rechecks). */
  readonly canControl: boolean;
  readonly isGmRunner: boolean;
  /** `ready`: `view` is current. `error`: the last read failed (`view` may be the stale last one). */
  readonly status: "loading" | "ready" | "error";
  readonly code?: TableRulesErrorCode;
  readonly view?: FateTableView;
  /** The other readable cards' aspects, as of the last `loadOthers` (empty before it). */
  readonly others: readonly FateTableCharacterAspect[];
  /** Read the other cards again; the invoke picker calls it when it opens. */
  readonly loadOthers: () => void;
  readonly port: FateTableRollPort;
  readonly refresh: () => void;
}

interface FateTableBridgeState {
  readonly links: Readonly<Record<string, FateTableLink | undefined>>;
}

export const useFateTableBridge = create<FateTableBridgeState>(() => ({ links: {} }));

export function publishFateTableLink(link: FateTableLink) {
  useFateTableBridge.setState((state) => ({ links: { ...state.links, [link.characterId]: link } }));
}

/** Drop the link, only if it is still the one this writer published. */
export function withdrawFateTableLink(link: FateTableLink) {
  useFateTableBridge.setState((state) => {
    if (state.links[link.characterId] !== link) return state;
    const links = { ...state.links };
    delete links[link.characterId];
    return { links };
  });
}

export function useFateTableLink(characterId: string | undefined): FateTableLink | undefined {
  return useFateTableBridge((state) => (characterId ? state.links[characterId] : undefined));
}

/** Test seam: forget every link. */
export function resetFateTableBridge() {
  useFateTableBridge.setState({ links: {} });
}
