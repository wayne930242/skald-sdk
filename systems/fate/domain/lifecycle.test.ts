import { describe, expect, it } from "vitest";
import type { FateLedgerEntry } from "./character";
import {
  appendFateLedger,
  changeFatePoints,
  checkFateStuntPurchase,
  concedeFateConflict,
  endFateScene,
  fateBoundaries,
  fateRecoveryReady,
  fateRecoveryStatus,
  fateRefresh,
  fateTreatmentDifficulty,
  replayFateLedger,
  resolveFateCompel,
  startFateSession,
  treatFateInjury,
  useFateStunt,
  type FateBoundaries,
  type FateInjuryRef,
} from "./lifecycle";
import { loadFatePresetCatalog } from "./presets";
const catalog = await loadFatePresetCatalog();

const { economy, recovery } = catalog;
const ctx = (operationId: string) => ({ operationId, timestamp: "2026-11-22T08:00:00.000Z" });
const economyState = (fatePoints: number, ledger: FateLedgerEntry[] = []) => ({ fatePoints, ledger, readOnly: false });

describe("fate point economy", () => {
  it("records a compel: accepting earns 1, refusing costs 1 and is impossible at 0", () => {
    const accepted = resolveFateCompel(economyState(0), { accepted: true, aspectId: "trouble" }, ctx("c1"));
    expect(accepted).toEqual({
      ok: true, fatePoints: 1,
      ledgerEntry: { operationId: "c1", reason: "compel", timestamp: "2026-11-22T08:00:00.000Z", delta: 1, aspectId: "trouble" },
    });
    expect(resolveFateCompel(economyState(0), { accepted: false }, ctx("c2"))).toEqual({ ok: false, reason: "insufficientFatePoints" });
    expect(resolveFateCompel(economyState(1), { accepted: false }, ctx("c2")).ok).toBe(true);
  });

  it("conceding earns 1 plus 1 per consequence taken", () => {
    const conceded = concedeFateConflict(economyState(0), { consequencesTaken: 2 }, ctx("x"));
    expect(conceded.ok && conceded.fatePoints).toBe(3);
  });

  it("applies an operation once; replaying the ledger is idempotent", () => {
    const first = changeFatePoints(economyState(2), { reason: "adjustment", delta: 1 }, ctx("a1"));
    if (!first.ok) throw new Error(first.reason);
    const ledger = [first.ledgerEntry];
    expect(changeFatePoints(economyState(3, ledger), { reason: "adjustment", delta: 1 }, ctx("a1"))).toEqual({ ok: false, reason: "duplicateOperation" });
    expect(appendFateLedger(ledger, first.ledgerEntry)).toEqual({ ok: false, reason: "duplicateOperation" });
    expect(replayFateLedger(2, [...ledger, ...ledger])).toBe(3);
    expect(changeFatePoints({ ...economyState(3), readOnly: true }, { reason: "adjustment", delta: 1 }, ctx("a2"))).toEqual({ ok: false, reason: "readOnly" });
  });
});

describe("refresh and stunts", () => {
  it("defaults to refresh 3 with three free stunts, then −1 each to a minimum of 1", () => {
    const refresh = (nonblankStunts: number) => fateRefresh(economy, { base: 3, earned: 0, nonblankStunts }).effective;
    expect([0, 3, 4, 5, 6, 9].map(refresh)).toEqual([3, 3, 2, 1, 1, 1]);
    expect(fateRefresh(economy, { base: 3, earned: 0, override: 5, nonblankStunts: 6 }).effective).toBe(5);
  });

  it("refuses a paid stunt that would take refresh below 1", () => {
    expect(checkFateStuntPurchase(economy, { base: 3, earned: 0, nonblankStunts: 2 })).toEqual({ ok: true, cost: 0, effectiveAfter: 3 });
    expect(checkFateStuntPurchase(economy, { base: 3, earned: 0, nonblankStunts: 4 })).toEqual({ ok: true, cost: 1, effectiveAfter: 1 });
    expect(checkFateStuntPurchase(economy, { base: 3, earned: 0, nonblankStunts: 5 })).toEqual({ ok: false, reason: "belowMinimumRefresh" });
    expect(checkFateStuntPurchase(economy, { base: 3, earned: 0, override: 2, nonblankStunts: 5 })).toEqual({ ok: true, cost: 1, effectiveAfter: 1, overrideAfter: 1 });
  });

  it("marks a once-per-session stunt per session ID", () => {
    const stunt = { id: "s", oncePerSession: true };
    expect(useFateStunt(stunt, "sess-1", false)).toEqual({ ok: true, patch: { usedSessionId: "sess-1" } });
    expect(useFateStunt({ ...stunt, usedSessionId: "sess-1" }, "sess-1", false)).toEqual({ ok: false, reason: "alreadyUsed" });
    expect(useFateStunt({ ...stunt, usedSessionId: "sess-1" }, "sess-2", false).ok).toBe(true);
    expect(useFateStunt(stunt, undefined, false)).toEqual({ ok: false, reason: "noSession" });
    expect(useFateStunt({ id: "t" }, undefined, false)).toEqual({ ok: true, patch: null });
  });
});

describe("session and scene boundaries", () => {
  it("tops up to refresh, keeps carried FP and cannot be replayed into a reset", () => {
    const low = startFateSession({ ...economyState(1), effectiveRefresh: 3 }, { sessionId: "s1" }, ctx("o1"));
    expect(low).toEqual({
      ok: true, fatePoints: 3, session: { id: "s1", sequence: 1 },
      ledgerEntry: { operationId: "o1", reason: "sessionStart", timestamp: "2026-11-22T08:00:00.000Z", delta: 2 },
    });
    const carried = startFateSession({ ...economyState(5), effectiveRefresh: 2, session: { id: "s1", sequence: 1 } }, { sessionId: "s2" }, ctx("o2"));
    expect(carried).toEqual({ ok: true, fatePoints: 5, session: { id: "s2", sequence: 2 }, ledgerEntry: null });
    expect(startFateSession({ ...economyState(0), effectiveRefresh: 3, session: { id: "s2", sequence: 2 } }, { sessionId: "s2" }, ctx("o3")))
      .toEqual({ ok: false, reason: "alreadyStarted" });
    expect(startFateSession({ ...economyState(0), effectiveRefresh: 0 }, { sessionId: "s9" }, ctx("o4"))).toMatchObject({ ok: true, fatePoints: 0 });
  });

  it("ends only the current scene and credits recorded hostile-invoke FP", () => {
    const ended = endFateScene({ ...economyState(1), scene: { id: "sc1", sequence: 4 } }, { sceneId: "sc1", nextSceneId: "sc2", hostileInvokeCredit: 2 }, ctx("e1"));
    expect(ended).toEqual({
      ok: true, clearStress: true, scene: { id: "sc2", sequence: 5 }, fatePoints: 3,
      ledgerEntry: { operationId: "e1", reason: "hostileInvokeCredit", timestamp: "2026-11-22T08:00:00.000Z", delta: 2 },
    });
    expect(endFateScene({ ...economyState(1), scene: { id: "sc2", sequence: 5 } }, { sceneId: "sc1", nextSceneId: "sc3" }, ctx("e2")))
      .toEqual({ ok: false, reason: "staleScene" });
    expect(endFateScene({ ...economyState(1) }, { sceneId: "first", nextSceneId: "second" }, ctx("e3"))).toMatchObject({ ok: true, scene: { sequence: 1 } });
  });
});

describe("treatment and recovery", () => {
  const injury = (severity: FateInjuryRef["severity"], extra: Partial<FateInjuryRef> = {}): FateInjuryRef =>
    ({ key: severity, severity, text: "Broken Arm", renamable: true, ...extra });
  const at = (scene: number, session: number, majorMilestone: number): FateBoundaries => ({ scene, session, majorMilestone });

  it("uses difficulty 2/4/6, two higher when treating yourself", () => {
    expect((["mild", "moderate", "severe"] as const).map(s => [fateTreatmentDifficulty(recovery, s, false), fateTreatmentDifficulty(recovery, s, true)]))
      .toEqual([[2, 4], [4, 6], [6, 8]]);
  });

  it("requires a success and a rename, and never treats twice", () => {
    const input = { succeeded: true, renamedText: "Arm in a Cast", boundaries: at(0, 0, 0), injuryId: "i1", readOnly: false };
    expect(treatFateInjury(injury("mild"), { ...input, succeeded: false }, recovery)).toEqual({ ok: false, reason: "treatmentFailed" });
    expect(treatFateInjury(injury("mild"), { ...input, renamedText: "Broken Arm" }, recovery)).toEqual({ ok: false, reason: "renameRequired" });
    const treated = treatFateInjury(injury("mild"), input, recovery);
    expect(treated).toEqual({ ok: true, text: "Arm in a Cast", metadata: { injuryId: "i1", injuryText: "Arm in a Cast", recovery: { boundary: "scene", treatedAtSequence: 0 } } });
    if (!treated.ok) throw new Error(treated.reason);
    expect(treatFateInjury(injury("mild", { metadata: treated.metadata }), input, recovery)).toEqual({ ok: false, reason: "alreadyRecovering" });
    expect(treatFateInjury(injury("mild", { text: "" }), input, recovery)).toEqual({ ok: false, reason: "notInjured" });
  });

  it("mild clears after one full scene, not the partial one in progress", () => {
    const treated = treatFateInjury(injury("mild"), { succeeded: true, renamedText: "Cast", boundaries: at(3, 0, 0), injuryId: "i", readOnly: false }, recovery);
    if (!treated.ok) throw new Error(treated.reason);
    const ref = injury("mild", { metadata: treated.metadata });
    expect([3, 4, 5].map(scene => fateRecoveryStatus(ref, at(scene, 9, 9)))).toEqual(["recovering", "recovering", "clearable"]);
  });

  it("moderate needs a full session; severe the next major milestone", () => {
    const moderate = treatFateInjury(injury("moderate"), { succeeded: true, renamedText: "Stitched", boundaries: at(0, 2, 0), injuryId: "m", readOnly: false }, recovery);
    const severe = treatFateInjury(injury("severe"), { succeeded: true, renamedText: "Healing", boundaries: at(0, 2, 1), injuryId: "s", readOnly: false }, recovery);
    if (!moderate.ok || !severe.ok) throw new Error("treat");
    const refs = [injury("moderate", { metadata: moderate.metadata }), injury("severe", { metadata: severe.metadata })];
    expect(refs.map(r => fateRecoveryStatus(r, at(50, 3, 1)))).toEqual(["recovering", "recovering"]);
    expect(refs.map(r => fateRecoveryStatus(r, at(50, 4, 1)))).toEqual(["clearable", "recovering"]);
    expect(fateRecoveryReady(refs, at(0, 4, 2))).toEqual(["moderate", "severe"]);
  });

  it("conditions recover by severity, keeping their fixed name", () => {
    const box = { key: "wounded:1", severity: "severe" as const, text: "wounded:1", renamable: false };
    const treated = treatFateInjury(box, { succeeded: true, boundaries: at(0, 0, 0), injuryId: "w", readOnly: false }, recovery);
    expect(treated.ok && treated.metadata.recovery).toEqual({ boundary: "majorMilestone", treatedAtSequence: 0 });
    expect(treated.ok && treated.text).toBe("wounded:1");
  });

  it("reads absent counters as zero", () => {
    expect(fateBoundaries({})).toEqual({ scene: 0, session: 0, majorMilestone: 0 });
    expect(fateBoundaries({ scene: { id: "a", sequence: 2 }, session: { id: "b", sequence: -1 }, majorMilestoneSequence: 3 })).toEqual({ scene: 2, session: 0, majorMilestone: 3 });
  });
});
