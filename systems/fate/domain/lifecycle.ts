import type { FateBoundaryState, FateInjuryMetadata, FateLedgerEntry, FateLedgerReason, FateStuntRow } from "./character";
import { isNonNegativeInteger, refuse, type FateCommandContext, type FateVerdict } from "./engine";
import type { FateEconomyConfig, FateRecoveryConfig, FateSeverityId } from "./presets";

/**
 * Explicit character-local boundary counters: `scene` counts ended scenes, `session` counts
 * started sessions, `majorMilestone` counts major milestones. No wall clock is involved.
 */
export interface FateBoundaries { scene: number; session: number; majorMilestone: number }

export function fateBoundaries(state: { scene?: FateBoundaryState; session?: FateBoundaryState; majorMilestoneSequence?: number }): FateBoundaries {
  const count = (value: unknown) => isNonNegativeInteger(value) ? value : 0;
  return { scene: count(state.scene?.sequence), session: count(state.session?.sequence), majorMilestone: count(state.majorMilestoneSequence) };
}

// ---------------------------------------------------------------------------
// Ledger: character-local history (not a security log). An operation ID applies once.

export const fateLedgerHas = (ledger: readonly FateLedgerEntry[], operationId: string) =>
  ledger.some(entry => entry.operationId === operationId);

export function appendFateLedger(ledger: readonly FateLedgerEntry[], entry: FateLedgerEntry):
  FateVerdict<{ ledger: FateLedgerEntry[] }, "duplicateOperation"> {
  if (fateLedgerHas(ledger, entry.operationId)) return refuse("duplicateOperation");
  return { ok: true, ledger: [...ledger, entry] };
}

/** Balance implied by replaying entries from a starting balance; replaying the same IDs adds nothing. */
export function replayFateLedger(start: number, entries: readonly FateLedgerEntry[]): number {
  const seen = new Set<string>();
  let balance = start;
  for (const entry of entries) {
    if (seen.has(entry.operationId)) continue;
    seen.add(entry.operationId);
    balance += entry.delta;
  }
  return balance;
}

export interface FateEconomyState {
  fatePoints: number;
  ledger: readonly FateLedgerEntry[];
  readOnly: boolean;
}

export type FateEconomyRefusal = "readOnly" | "duplicateOperation" | "insufficientFatePoints" | "invalidDelta";

/** One validated balance change with its ledger entry. FP never goes below zero. */
export function changeFatePoints(
  state: FateEconomyState,
  change: { reason: FateLedgerReason; delta: number; aspectId?: string; actorId?: string; rollId?: string },
  context: FateCommandContext,
): FateVerdict<{ fatePoints: number; ledgerEntry: FateLedgerEntry }, FateEconomyRefusal> {
  if (state.readOnly) return refuse("readOnly");
  if (!Number.isSafeInteger(change.delta)) return refuse("invalidDelta");
  if (fateLedgerHas(state.ledger, context.operationId)) return refuse("duplicateOperation");
  const fatePoints = state.fatePoints + change.delta;
  if (fatePoints < 0) return refuse("insufficientFatePoints");
  const { reason, delta, aspectId, actorId, rollId } = change;
  return {
    ok: true, fatePoints,
    ledgerEntry: {
      operationId: context.operationId, reason, timestamp: context.timestamp, delta,
      ...(aspectId ? { aspectId } : {}), ...(actorId ? { actorId } : {}), ...(rollId ? { rollId } : {}),
    },
  };
}

/** An agreed compel: accepting earns 1; refusing costs 1 (impossible at 0). Withdrawal records nothing. */
export function resolveFateCompel(state: FateEconomyState, input: { accepted: boolean; aspectId?: string }, context: FateCommandContext) {
  return changeFatePoints(state, { reason: "compel", delta: input.accepted ? 1 : -1, aspectId: input.aspectId }, context);
}

/** Conceding earns 1 plus 1 per consequence taken in this conflict. */
export function concedeFateConflict(state: FateEconomyState, input: { consequencesTaken: number }, context: FateCommandContext) {
  if (!isNonNegativeInteger(input.consequencesTaken)) return refuse("invalidDelta" as const);
  return changeFatePoints(state, { reason: "concession", delta: 1 + input.consequencesTaken }, context);
}

// ---------------------------------------------------------------------------
// Refresh and stunts

export interface FateRefreshInput { base: number; earned: number; override?: number; nonblankStunts: number }

export function fateRefresh(economy: Pick<FateEconomyConfig, "freeStunts" | "minRefresh">, input: FateRefreshInput) {
  const stuntCost = Math.max(0, input.nonblankStunts - economy.freeStunts);
  const unclamped = input.base + input.earned - stuntCost;
  return { stuntCost, unclamped, effective: input.override ?? Math.max(economy.minRefresh, unclamped) };
}

/** A paid stunt (one beyond the free ones) may not take effective refresh below the minimum. */
export function checkFateStuntPurchase(economy: Pick<FateEconomyConfig, "freeStunts" | "minRefresh">, input: FateRefreshInput):
  FateVerdict<{ cost: 0 | 1; effectiveAfter: number; overrideAfter?: number }, "belowMinimumRefresh"> {
  const after = { ...input, nonblankStunts: input.nonblankStunts + 1 };
  const cost = input.nonblankStunts + 1 > economy.freeStunts ? 1 : 0;
  if (input.override !== undefined) {
    const overrideAfter = input.override - cost;
    if (overrideAfter < economy.minRefresh) return refuse("belowMinimumRefresh");
    return { ok: true, cost, effectiveAfter: overrideAfter, overrideAfter };
  }
  const { unclamped } = fateRefresh(economy, after);
  if (unclamped < economy.minRefresh) return refuse("belowMinimumRefresh");
  return { ok: true, cost, effectiveAfter: unclamped };
}

export const fateStuntAvailable = (stunt: Pick<FateStuntRow, "oncePerSession" | "usedSessionId">, sessionId: string | undefined) =>
  stunt.oncePerSession !== true || (sessionId !== undefined && stunt.usedSessionId !== sessionId);

/** Mark a once-per-session stunt used on an accepted roll; other stunts need no state. */
export function useFateStunt(stunt: Pick<FateStuntRow, "id" | "oncePerSession" | "usedSessionId">, sessionId: string | undefined, readOnly: boolean):
  FateVerdict<{ patch: { usedSessionId: string } | null }, "readOnly" | "noSession" | "alreadyUsed"> {
  if (readOnly) return refuse("readOnly");
  if (stunt.oncePerSession !== true) return { ok: true, patch: null };
  if (sessionId === undefined) return refuse("noSession");
  if (stunt.usedSessionId === sessionId) return refuse("alreadyUsed");
  return { ok: true, patch: { usedSessionId: sessionId } };
}

// ---------------------------------------------------------------------------
// Session and scene boundaries

/**
 * Start a session: top up to effective refresh, never lower carried FP. Starting the same session
 * again (or replaying the operation) is refused, so it cannot reset FP. Once-per-session stunt use
 * resets implicitly because usage is keyed by session ID.
 */
export function startFateSession(
  state: FateEconomyState & { effectiveRefresh: number; session?: FateBoundaryState },
  input: { sessionId: string }, context: FateCommandContext,
): FateVerdict<{ fatePoints: number; session: FateBoundaryState; ledgerEntry: FateLedgerEntry | null }, "readOnly" | "alreadyStarted" | "duplicateOperation"> {
  if (state.readOnly) return refuse("readOnly");
  if (state.session?.id === input.sessionId) return refuse("alreadyStarted");
  if (fateLedgerHas(state.ledger, context.operationId)) return refuse("duplicateOperation");
  const fatePoints = Math.max(state.fatePoints, state.effectiveRefresh);
  const delta = fatePoints - state.fatePoints;
  return {
    ok: true, fatePoints,
    session: { id: input.sessionId, sequence: fateBoundaries({ session: state.session }).session + 1 },
    ledgerEntry: delta > 0 ? { operationId: context.operationId, reason: "sessionStart", timestamp: context.timestamp, delta } : null,
  };
}

/**
 * End the current scene: clear this character's stress (see `clearFateStress`), advance the scene
 * counter and credit hostile-invoke FP the player recorded as owed. Ending a scene that is no longer
 * current is refused. Recovery reminders come from `fateRecoveryReady`; nothing heals by itself.
 */
export function endFateScene(
  state: FateEconomyState & { scene?: FateBoundaryState },
  input: { sceneId: string; nextSceneId: string; hostileInvokeCredit?: number },
  context: FateCommandContext,
): FateVerdict<{ scene: FateBoundaryState; clearStress: true; fatePoints: number; ledgerEntry: FateLedgerEntry | null },
  "readOnly" | "staleScene" | "duplicateOperation" | "invalidCredit"> {
  if (state.readOnly) return refuse("readOnly");
  if (state.scene !== undefined && state.scene.id !== input.sceneId) return refuse("staleScene");
  if (input.nextSceneId === input.sceneId) return refuse("staleScene");
  if (fateLedgerHas(state.ledger, context.operationId)) return refuse("duplicateOperation");
  const credit = input.hostileInvokeCredit ?? 0;
  if (!isNonNegativeInteger(credit)) return refuse("invalidCredit");
  return {
    ok: true, clearStress: true,
    scene: { id: input.nextSceneId, sequence: fateBoundaries({ scene: state.scene }).scene + 1 },
    fatePoints: state.fatePoints + credit,
    ledgerEntry: credit > 0 ? { operationId: context.operationId, reason: "hostileInvokeCredit", timestamp: context.timestamp, delta: credit } : null,
  };
}

// ---------------------------------------------------------------------------
// Treatment and recovery

/** A current injury: a consequence slot or a marked condition box. */
export interface FateInjuryRef {
  key: string;
  severity: FateSeverityId;
  text: string;
  metadata?: FateInjuryMetadata;
  /** Consequences are renamed on treatment; condition boxes keep their fixed name. */
  renamable: boolean;
}

export function fateTreatmentDifficulty(recovery: FateRecoveryConfig, severity: FateSeverityId, selfTreatment: boolean): number {
  return recovery.treatmentDifficulty[severity] + (selfTreatment ? recovery.selfTreatmentPenalty : 0);
}

/**
 * Begin recovery after a successful overcome. The interval in progress at treatment never counts:
 * mild needs one full scene, moderate one full session, severe the next major milestone.
 */
export function treatFateInjury(
  injury: FateInjuryRef,
  input: { succeeded: boolean; renamedText?: string; boundaries: FateBoundaries; injuryId: string; readOnly: boolean },
  recovery: FateRecoveryConfig,
): FateVerdict<{ text: string; metadata: FateInjuryMetadata }, "readOnly" | "notInjured" | "alreadyRecovering" | "treatmentFailed" | "renameRequired"> {
  if (input.readOnly) return refuse("readOnly");
  if (injury.text.trim() === "") return refuse("notInjured");
  if (injury.metadata?.recovery) return refuse("alreadyRecovering");
  if (!input.succeeded) return refuse("treatmentFailed");
  const text = injury.renamable ? input.renamedText ?? "" : injury.text;
  if (injury.renamable && (text.trim() === "" || text === injury.text)) return refuse("renameRequired");
  return { ok: true, text, metadata: startRecovery(injury, text, input.injuryId, input.boundaries, recovery) };
}

export function startRecovery(
  injury: FateInjuryRef, text: string, injuryId: string, boundaries: FateBoundaries, recovery: FateRecoveryConfig, atMajorMilestone = false,
): FateInjuryMetadata {
  const boundary = recovery.boundary[injury.severity];
  // Begun during a major milestone, a severe injury waits for the next one.
  const treatedAtSequence = boundary === "majorMilestone" ? boundaries.majorMilestone + (atMajorMilestone ? 1 : 0)
    : boundary === "scene" ? boundaries.scene : boundaries.session;
  return {
    injuryId: injury.metadata?.injuryId ?? injuryId,
    injuryText: text,
    ...(injury.metadata?.externalClaim !== undefined ? { externalClaim: injury.metadata.externalClaim } : {}),
    recovery: { boundary, treatedAtSequence },
  };
}

export type FateRecoveryStatus = "untreated" | "recovering" | "clearable";

export function fateRecoveryStatus(injury: Pick<FateInjuryRef, "metadata">, boundaries: FateBoundaries): FateRecoveryStatus {
  const recovery = injury.metadata?.recovery;
  if (!recovery) return "untreated";
  if (recovery.boundary === "majorMilestone") return boundaries.majorMilestone >= recovery.treatedAtSequence + 1 ? "clearable" : "recovering";
  const current = recovery.boundary === "scene" ? boundaries.scene : boundaries.session;
  return current >= recovery.treatedAtSequence + 2 ? "clearable" : "recovering";
}

/** Keys of injuries whose full recovery interval has passed; clearing them is a separate confirm. */
export function fateRecoveryReady(injuries: readonly FateInjuryRef[], boundaries: FateBoundaries): string[] {
  return injuries.filter(injury => fateRecoveryStatus(injury, boundaries) === "clearable").map(injury => injury.key);
}
