import type { RandomSource } from "@skald/dice";
import type { FateAspectKind, FateAspectRow, FateLedgerEntry, FateOperationReceipt } from "./character";
import { refuse, type FateCommandContext, type FateVerdict } from "./engine";
import { resolveFateRoll, rollFateFaces, type FateOutcomeOffer, type FateRollResult, type FateRollSnapshot } from "./roll";
import type { FateRules } from "./presets";

export const FATE_INVOKE_BONUS = 2;

/** Current, re-read state the invoke is checked against at approval time. */
export interface FateInvokeAvailability {
  readOnly: boolean;
  characterId: string;
  fatePoints: number;
  /** This character's rows, including situation aspects and boosts it holds. */
  aspects: readonly Pick<FateAspectRow, "id" | "kind" | "freeInvokes">[];
}

export interface FateInvokeRequest {
  aspectId: string;
  payment: "free" | "paid";
  effect: "plus2" | "reroll";
}

export type FateInvokeRefusal =
  | "readOnly" | "wrongCharacter" | "unknownAspect" | "duplicateOperation"
  | "boostCannotBePaid" | "paidRepeat" | "noFatePoints" | "noFreeInvokes";

/** What the character record changes by, applied in one guarded command with the ledger entry. */
export interface FateInvokeDelta {
  fatePoints: number;
  freeInvokes: { aspectId: string; delta: number } | null;
  /** A used boost disappears. */
  removeAspectId: string | null;
}

/**
 * Rules for one more invoke on this roll: any number of free invokes (even on one aspect);
 * a paid invoke of the same aspect only once; boosts are free-only and vanish when used.
 */
export function checkFateInvoke(
  snapshot: FateRollSnapshot, request: FateInvokeRequest, availability: FateInvokeAvailability, operationId?: string,
): FateVerdict<{ aspectKind: FateAspectKind }, FateInvokeRefusal> {
  if (availability.readOnly) return refuse("readOnly");
  if (availability.characterId !== snapshot.characterId) return refuse("wrongCharacter");
  const aspect = availability.aspects.find(row => row.id === request.aspectId);
  if (!aspect) return refuse("unknownAspect");
  if (operationId !== undefined && snapshot.modifiers.some(m => m.kind === "invoke" && m.operationId === operationId)) {
    return refuse("duplicateOperation");
  }
  if (request.payment === "paid") {
    if (aspect.kind === "boost") return refuse("boostCannotBePaid");
    if (snapshot.modifiers.some(m => m.kind === "invoke" && m.payment === "paid" && m.aspectId === request.aspectId)) return refuse("paidRepeat");
    if (availability.fatePoints < 1) return refuse("noFatePoints");
  } else if (aspect.freeInvokes < 1) {
    return refuse("noFreeInvokes");
  }
  return { ok: true, aspectKind: aspect.kind };
}

/**
 * Apply an invoke to a roll. +2 keeps the faces and reads no randomness; a reroll reads exactly one
 * new four-face sample. Earlier accepted modifiers stay; the result regrades against the same opposition.
 */
export function applyFateInvoke(
  snapshot: FateRollSnapshot, request: FateInvokeRequest, availability: FateInvokeAvailability,
  context: FateCommandContext, random: RandomSource, rules: Pick<FateRules, "ratings">,
): FateVerdict<{ snapshot: FateRollSnapshot; result: FateRollResult; delta: FateInvokeDelta; ledgerEntry: FateLedgerEntry }, FateInvokeRefusal> {
  const check = checkFateInvoke(snapshot, request, availability, context.operationId);
  if (!check.ok) return check;
  const faces = request.effect === "reroll" ? rollFateFaces(random) : snapshot.faces;
  const next: FateRollSnapshot = {
    ...snapshot,
    resultId: context.operationId,
    parentResultId: snapshot.resultId,
    faces,
    modifiers: [...snapshot.modifiers, {
      kind: "invoke", aspectId: request.aspectId, payment: request.payment, effect: request.effect,
      operationId: context.operationId, value: request.effect === "plus2" ? FATE_INVOKE_BONUS : 0,
    }],
  };
  const paid = request.payment === "paid";
  const delta: FateInvokeDelta = {
    fatePoints: paid ? -1 : 0,
    freeInvokes: paid || check.aspectKind === "boost" ? null : { aspectId: request.aspectId, delta: -1 },
    removeAspectId: check.aspectKind === "boost" ? request.aspectId : null,
  };
  const ledgerEntry: FateLedgerEntry = {
    operationId: context.operationId,
    reason: paid ? "invokePaid" : "invokeFree",
    timestamp: context.timestamp,
    delta: delta.fatePoints,
    rollId: snapshot.rootRollId,
    aspectId: request.aspectId,
    ...(paid ? {} : { freeInvokeDelta: -1 }),
  };
  return { ok: true, snapshot: next, result: resolveFateRoll(next, rules), delta, ledgerEntry };
}

/** Apply an invoke or reward delta to aspect rows (inside the host's functional update). */
export function applyFateAspectDelta(
  rows: readonly FateAspectRow[], delta: Pick<FateInvokeDelta, "freeInvokes" | "removeAspectId"> & { add?: FateAspectRow },
): FateAspectRow[] {
  const next = rows
    .filter(row => row.id !== delta.removeAspectId)
    .map(row => delta.freeInvokes && row.id === delta.freeInvokes.aspectId && row.kind !== "boost"
      ? { ...row, freeInvokes: Math.max(0, row.freeInvokes + delta.freeInvokes.delta) }
      : row);
  return delta.add ? [...next, delta.add] : next;
}

/** Deterministic receipt ID: one reward per root roll, whatever invokes revised it. */
export const fateRewardReceiptId = (rootRollId: string) => `${rootRollId}:reward`;

const BOOST_OFFERS = new Set<FateOutcomeOffer["id"]>(["boost", "failWithBoost", "successWithBoost", "armorBoost", "hitWithBoost"]);

export type FateRewardTarget =
  | { kind: "existing"; aspectId: string }
  | { kind: "new"; aspectId: string; text: string; secret?: boolean };

/**
 * After the outcome is confirmed, assign its earned boost or free invokes to a row of this
 * character only. Refused when the offer was not on the result or a reward was already taken.
 */
export function planFateRollReward(
  input: {
    snapshot: FateRollSnapshot;
    result: FateRollResult;
    offerId: FateOutcomeOffer["id"];
    target: FateRewardTarget;
    aspects: readonly Pick<FateAspectRow, "id" | "kind">[];
    receipts: Readonly<Record<string, FateOperationReceipt>>;
    readOnly: boolean;
  },
  context: FateCommandContext,
): FateVerdict<{ add?: FateAspectRow; freeInvokes: { aspectId: string; delta: number } | null; receipt: FateOperationReceipt; ledgerEntry: FateLedgerEntry },
  "readOnly" | "notOffered" | "noReward" | "alreadyClaimed" | "boostNeedsNewRow" | "unknownAspect" | "aspectExists" | "blankText" | "newAspectRequired"> {
  const { snapshot, result, offerId, target } = input;
  if (input.readOnly) return refuse("readOnly");
  const offer = result.offers.find(o => o.id === offerId);
  if (!offer) return refuse("notOffered");
  const receiptId = fateRewardReceiptId(snapshot.rootRollId);
  if (input.receipts[receiptId]) return refuse("alreadyClaimed");
  const isBoost = BOOST_OFFERS.has(offer.id);
  const freeInvokes = offer.id === "freeInvokes" ? offer.freeInvokes : 0;
  if (!isBoost && freeInvokes === 0) return refuse("noReward");
  if (target.kind === "new") {
    if (input.aspects.some(row => row.id === target.aspectId)) return refuse("aspectExists");
    if (target.text.trim() === "") return refuse("blankText");
  } else {
    if (isBoost) return refuse("boostNeedsNewRow");
    if (offer.id === "freeInvokes" && offer.newAspect) return refuse("newAspectRequired");
    if (!input.aspects.some(row => row.id === target.aspectId && row.kind !== "boost")) return refuse("unknownAspect");
  }
  const add: FateAspectRow | undefined = target.kind === "new"
    ? { id: target.aspectId, kind: isBoost ? "boost" : "situation", text: target.text, freeInvokes: isBoost ? 1 : freeInvokes, secret: target.secret === true }
    : undefined;
  const aspectId = target.aspectId;
  return {
    ok: true,
    ...(add ? { add } : {}),
    freeInvokes: target.kind === "existing" ? { aspectId, delta: freeInvokes } : null,
    receipt: { id: receiptId, status: "local", payload: { offerId: offer.id, aspectId, operationId: context.operationId } },
    ledgerEntry: {
      operationId: context.operationId, reason: "adjustment", timestamp: context.timestamp, delta: 0,
      freeInvokeDelta: isBoost ? 1 : freeInvokes, rollId: snapshot.rootRollId, aspectId,
    },
  };
}

/** Compensating command for a definitely rejected invoke; its ID is derived so it applies once. */
export const fateReversalOperationId = (operationId: string) => `${operationId}:reverse`;

export function planFateInvokeReversal(
  ledger: readonly FateLedgerEntry[], targetOperationId: string, timestamp: string,
): FateVerdict<{ delta: FateInvokeDelta; ledgerEntry: FateLedgerEntry }, "unknownOperation" | "notAnInvoke" | "alreadyReversed"> {
  const original = ledger.find(entry => entry.operationId === targetOperationId);
  if (!original) return refuse("unknownOperation");
  if (original.reason !== "invokePaid" && original.reason !== "invokeFree") return refuse("notAnInvoke");
  const operationId = fateReversalOperationId(targetOperationId);
  if (ledger.some(entry => entry.operationId === operationId)) return refuse("alreadyReversed");
  const freeDelta = -(original.freeInvokeDelta ?? 0);
  return {
    ok: true,
    delta: {
      fatePoints: -original.delta,
      freeInvokes: freeDelta !== 0 && original.aspectId ? { aspectId: original.aspectId, delta: freeDelta } : null,
      removeAspectId: null,
    },
    ledgerEntry: {
      operationId, reason: "invokeReverse", timestamp, delta: -original.delta,
      ...(freeDelta !== 0 ? { freeInvokeDelta: freeDelta } : {}),
      ...(original.rollId ? { rollId: original.rollId } : {}),
      ...(original.aspectId ? { aspectId: original.aspectId } : {}),
    },
  };
}
