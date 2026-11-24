import { create } from "zustand";
import type { FateOperationReceipt } from "../../domain/character";
import type { FateInvokeRequest } from "../../domain/invoke";
import type { FateRollOptions, FateRollSnapshot } from "../../domain/roll";
import type { FateRootDelivery } from "./roll-delivery";
import type { FateTableInvokeRequest } from "../table/table-rolls";

/** One accepted invoke on the tray's roll, with the roll it revised (for a reversal). */
export interface FateRollRevision {
  operationId: string;
  request: FateInvokeRequest;
  parent: FateRollSnapshot;
  status: FateOperationReceipt["status"];
}

/** The last roll of one character: what the tray shows and what an invoke revises. */
export interface FateTrayRoll {
  skillId: string;
  /** The skill's shown name at roll time (never aspect text). */
  skillLabel: string;
  /** Short correlation tag shown on the root card and every follow-up. */
  tag: string;
  snapshot: FateRollSnapshot;
  root: FateRootDelivery;
  revisions: FateRollRevision[];
  /** The player chose to keep this roll's invokes on the sheet (unverifiable audience or binding). */
  localAck: boolean;
  /** An after-roll scale mode chosen before the roll, applied once the roll succeeds. */
  pendingScale: FateRollOptions["scale"];
  /** The outcome's reward was taken: the result is settled and takes no more invokes. */
  settled: boolean;
  /** Table invokes: what each aspect key reads as for this viewer (never sent anywhere). */
  tableLabels?: Readonly<Record<string, string>>;
  /** A table invoke whose outcome is unknown: resent as is, never replaced by a new one. */
  tablePending?: { operationId: string; request: FateTableInvokeRequest };
  /** An after-roll scale mode was chosen but the table totals without it. */
  tableScaleSkipped?: boolean;
}

/** Why the last table roll or invoke of a scope did not go through (shown on the tray). */
export type FateTableRollFailure = "forbidden" | "not_found" | "conflict" | "invalid" | "unavailable" | "audience" | "readOnly" | "abandoned";

/** A table root roll whose outcome is unknown, waiting on the player (table-rolls.ts). */
export interface FateTableRootPending {
  /** Resend the same operation; settles the waiting roll when the table answers. */
  readonly resend: () => Promise<void>;
  /** Stop waiting: the roll is not recorded on the sheet (it may have reached the table). */
  readonly abandon: () => void;
}

interface FateRollState {
  /** Keyed by character scope: a roll never moves to another mounted character. */
  rolls: Record<string, FateTrayRoll | undefined>;
  /** One roll or invoke in flight per character: repeated taps and double submits do nothing. */
  busy: Record<string, true | undefined>;
  /** The last refused or unconfirmed table roll of a scope, until the next roll or invoke. */
  tableFailures: Record<string, FateTableRollFailure | undefined>;
  tableRootPending: Record<string, FateTableRootPending | undefined>;
}

export const useFateRollStore = create<FateRollState>(() => ({ rolls: {}, busy: {}, tableFailures: {}, tableRootPending: {} }));

export function setFateTableRootPending(scope: string, pending: FateTableRootPending | undefined) {
  useFateRollStore.setState((state) => ({ tableRootPending: { ...state.tableRootPending, [scope]: pending } }));
}

export function setFateTableFailure(scope: string, failure: FateTableRollFailure | undefined) {
  useFateRollStore.setState((state) => ({ tableFailures: { ...state.tableFailures, [scope]: failure } }));
}

/** The scope of a mounted sheet: the roll host's character, or this device's unsaved card. */
export const fateRollScope = (characterId: string | undefined) => characterId ?? "local";

/** Claim the scope's lock synchronously; false when something is already in flight. */
export function lockFateRoll(scope: string): boolean {
  if (useFateRollStore.getState().busy[scope]) return false;
  useFateRollStore.setState((state) => ({ busy: { ...state.busy, [scope]: true } }));
  return true;
}

export function unlockFateRoll(scope: string) {
  useFateRollStore.setState((state) => {
    const busy = { ...state.busy };
    delete busy[scope];
    return { busy };
  });
}

export function setFateTrayRoll(scope: string, roll: FateTrayRoll) {
  useFateRollStore.setState((state) => ({ rolls: { ...state.rolls, [scope]: roll } }));
}

/** Patch the scope's roll only if it is still the same root roll. */
export function patchFateTrayRoll(scope: string, rootRollId: string, patch: (roll: FateTrayRoll) => FateTrayRoll) {
  useFateRollStore.setState((state) => {
    const roll = state.rolls[scope];
    if (!roll || roll.snapshot.rootRollId !== rootRollId) return state;
    return { rolls: { ...state.rolls, [scope]: patch(roll) } };
  });
}

/** Test seam: forget every roll. */
export function resetFateRollStore() {
  useFateRollStore.setState({ rolls: {}, busy: {}, tableFailures: {}, tableRootPending: {} });
}
