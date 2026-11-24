/**
 * The guarded local commands of the roll tray. Each runs inside the host's functional
 * `setData(previous => next)`: it re-reads the current record, re-validates, dedupes by the
 * operation ID generated outside the updater and returns `previous` untouched when it cannot
 * apply. No I/O, clock or randomness in here; the optional probe only reports the verdict.
 */
import type { FateAspectKind, FateAspectRow, FateCharacterData, FateLedgerEntry, FateOperationReceipt } from "../../domain/character";
import type { FateCommandContext } from "../../domain/engine";
import {
  applyFateAspectDelta,
  checkFateInvoke,
  fateReversalOperationId,
  fateRewardReceiptId,
  planFateInvokeReversal,
  planFateRollReward,
  type FateInvokeDelta,
  type FateInvokeRequest,
  type FateRewardTarget,
} from "../../domain/invoke";
// Not a React hook: the engine names the stunt-use check `useFateStunt`.
import { fateLedgerHas, useFateStunt as checkFateStuntUse } from "../../domain/lifecycle";
import { fateRecord, readFateAspects, readFateResources, updateFateAspects, updateFateStunts } from "../../domain/normalize";
import type { FateOutcomeOffer, FateRollResult, FateRollSnapshot } from "../../domain/roll";

export type FateCommandVerdict = "applied" | "duplicate" | "refused";
export type FateCommandProbe = (verdict: FateCommandVerdict) => void;
type StockLabel = (kind: FateAspectKind) => string;

const isLedgerEntry = (value: unknown): value is FateLedgerEntry => {
  const entry = fateRecord(value);
  return typeof entry.operationId === "string" && typeof entry.reason === "string" && typeof entry.delta === "number";
};

function readV2(data: FateCharacterData) {
  const v2 = fateRecord(data.fateV2);
  const rawLedger = Array.isArray(v2.ledger) ? v2.ledger : [];
  return { v2, rawLedger, ledger: rawLedger.filter(isLedgerEntry), receipts: fateRecord(v2.receipts) };
}

function readReceipt(value: unknown): FateOperationReceipt | undefined {
  const receipt = fateRecord(value);
  return typeof receipt.id === "string" && typeof receipt.status === "string" ? (receipt as unknown as FateOperationReceipt) : undefined;
}

/** Ledger, receipt and FP in one record; the other roots and unknown keys stay as they were. */
function withEconomy(
  data: FateCharacterData, change: { fatePoints?: number; ledgerEntry?: FateLedgerEntry; receipt?: FateOperationReceipt },
): FateCharacterData {
  const { v2, rawLedger, receipts } = readV2(data);
  const next: FateCharacterData = { ...data };
  if (change.fatePoints !== undefined) next.fatePoints = change.fatePoints;
  next.fateV2 = {
    ...v2,
    ...(change.ledgerEntry ? { ledger: [...rawLedger, change.ledgerEntry] } : {}),
    ...(change.receipt ? { receipts: { ...receipts, [change.receipt.id]: change.receipt } } : {}),
  };
  return next;
}

export interface FateInvokeCommand {
  context: FateCommandContext;
  characterId: string;
  /** The roll before this invoke: the paid-repeat rule is checked against its modifiers. */
  snapshot: FateRollSnapshot;
  request: FateInvokeRequest;
  delta: FateInvokeDelta;
  ledgerEntry: FateLedgerEntry;
  /** `pending` when a follow-up will be sent, `local` when the invoke stays on the sheet. */
  status: "pending" | "local";
}

/**
 * Apply one invoke: FP, the free-use counter or the used boost, the ledger entry and a receipt,
 * together. A replayed operation ID and an invoke the current record no longer allows (FP spent,
 * free use gone, boost already used) leave the record as it is.
 */
export function commitFateInvoke(
  previous: FateCharacterData, command: FateInvokeCommand, stockLabel?: StockLabel, probe?: FateCommandProbe,
): FateCharacterData {
  const { ledger, receipts } = readV2(previous);
  const { operationId } = command.context;
  if (fateLedgerHas(ledger, operationId) || Object.hasOwn(receipts, operationId)) {
    probe?.("duplicate");
    return previous;
  }
  const { rows } = readFateAspects(previous);
  const { fatePoints } = readFateResources(previous);
  const check = checkFateInvoke(command.snapshot, command.request, { readOnly: false, characterId: command.characterId, fatePoints, aspects: rows });
  if (!check.ok) {
    probe?.("refused");
    return previous;
  }
  const removed = command.delta.removeAspectId ? rows.find((row) => row.id === command.delta.removeAspectId) : undefined;
  const withAspects = command.delta.freeInvokes || command.delta.removeAspectId
    ? updateFateAspects(previous, (current) => applyFateAspectDelta(current, command.delta), stockLabel)
    : previous;
  const receipt: FateOperationReceipt = {
    id: operationId,
    status: command.status,
    payload: {
      kind: "invoke",
      rootRollId: command.snapshot.rootRollId,
      aspectId: command.request.aspectId,
      payment: command.request.payment,
      effect: command.request.effect,
      // A used boost is gone from the list; a reversal puts this row back.
      ...(removed ? { removedRow: { ...removed } } : {}),
    },
  };
  probe?.("applied");
  return withEconomy(withAspects, {
    ...(command.delta.fatePoints !== 0 ? { fatePoints: fatePoints + command.delta.fatePoints } : {}),
    ledgerEntry: command.ledgerEntry,
    receipt,
  });
}

/** Move a receipt on (pending → posted/rejected/unknown) only from the states given. */
export function setFateReceiptStatus(
  previous: FateCharacterData, operationId: string, status: FateOperationReceipt["status"], from: readonly FateOperationReceipt["status"][],
): FateCharacterData {
  const { receipts } = readV2(previous);
  const receipt = readReceipt(receipts[operationId]);
  if (!receipt || !from.includes(receipt.status) || receipt.status === status) return previous;
  return withEconomy(previous, { receipt: { ...receipt, status } });
}

/**
 * Compensate an invoke whose follow-up was definitely refused: give back the FP or the free use,
 * restore a used boost, mark the receipt reversed. Its operation ID is derived, so it applies once.
 */
export function reverseFateInvoke(
  previous: FateCharacterData, operationId: string, timestamp: string, stockLabel?: StockLabel, probe?: FateCommandProbe,
): FateCharacterData {
  const { ledger, receipts } = readV2(previous);
  if (fateLedgerHas(ledger, fateReversalOperationId(operationId))) {
    probe?.("duplicate");
    return previous;
  }
  const receipt = readReceipt(receipts[operationId]);
  const plan = planFateInvokeReversal(ledger, operationId, timestamp);
  if (!receipt || receipt.status !== "rejected" || !plan.ok) {
    probe?.("refused");
    return previous;
  }
  const payload = fateRecord(receipt.payload);
  if (typeof payload.rootRollId === "string" && Object.hasOwn(receipts, fateRewardReceiptId(payload.rootRollId))) {
    probe?.("refused");
    return previous;
  }
  const removed = fateRecord(payload.removedRow);
  const restore = typeof removed.id === "string" && removed.kind === "boost" ? (removed as unknown as FateAspectRow) : undefined;
  const { rows } = readFateAspects(previous);
  const needsRestore = restore && !rows.some((row) => row.id === restore.id);
  const withAspects = plan.delta.freeInvokes || needsRestore
    ? updateFateAspects(previous, (current) => applyFateAspectDelta(current, {
      // The boost row comes back whole (one free use); the counter delta is for other rows.
      freeInvokes: restore ? null : plan.delta.freeInvokes,
      removeAspectId: null,
      ...(needsRestore ? { add: restore } : {}),
    }), stockLabel)
    : previous;
  const { fatePoints } = readFateResources(previous);
  probe?.("applied");
  return withEconomy(withAspects, {
    ...(plan.delta.fatePoints !== 0 ? { fatePoints: fatePoints + plan.delta.fatePoints } : {}),
    ledgerEntry: plan.ledgerEntry,
    receipt: { ...receipt, status: "reversed" },
  });
}

/** Record the once-per-session stunts of an accepted roll; others need no state. */
export function markFateStuntsUsed(previous: FateCharacterData, stuntIds: readonly string[], sessionId: string | undefined): FateCharacterData {
  if (stuntIds.length === 0) return previous;
  return updateFateStunts(previous, (rows) => rows.map((row) => {
    if (!stuntIds.includes(row.id)) return row;
    const verdict = checkFateStuntUse(row, sessionId, false);
    return verdict.ok && verdict.patch ? { ...row, ...verdict.patch } : row;
  }));
}

/**
 * Take the confirmed result's boost or free invokes onto this character only. One reward per
 * root roll (a derived receipt), whatever invokes revised it.
 */
export function claimFateReward(
  previous: FateCharacterData,
  input: { snapshot: FateRollSnapshot; result: FateRollResult; offerId: FateOutcomeOffer["id"]; target: FateRewardTarget },
  context: FateCommandContext, stockLabel?: StockLabel, probe?: FateCommandProbe,
): FateCharacterData {
  const { receipts, ledger } = readV2(previous);
  if (Object.hasOwn(receipts, fateRewardReceiptId(input.snapshot.rootRollId)) || fateLedgerHas(ledger, context.operationId)) {
    probe?.("duplicate");
    return previous;
  }
  const { rows } = readFateAspects(previous);
  const plan = planFateRollReward({
    ...input,
    aspects: rows,
    receipts: receipts as Record<string, FateOperationReceipt>,
    readOnly: false,
  }, context);
  if (!plan.ok) {
    probe?.("refused");
    return previous;
  }
  const withAspects = updateFateAspects(previous, (current) => applyFateAspectDelta(current, {
    freeInvokes: plan.freeInvokes,
    removeAspectId: null,
    ...(plan.add ? { add: plan.add } : {}),
  }), stockLabel);
  probe?.("applied");
  return withEconomy(withAspects, { ledgerEntry: plan.ledgerEntry, receipt: plan.receipt });
}
