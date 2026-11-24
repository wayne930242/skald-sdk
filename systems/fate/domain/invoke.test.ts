import { describe, expect, it } from "vitest";
import type { FateAspectRow } from "./character";
import {
  applyFateAspectDelta,
  applyFateInvoke,
  checkFateInvoke,
  fateRewardReceiptId,
  planFateInvokeReversal,
  planFateRollReward,
  type FateInvokeAvailability,
} from "./invoke";
import { loadFatePresetCatalog, resolveFateRules } from "./presets";
import { createFateRoll, defaultFateRollOptions, resolveFateRoll, toFateFaces, type FateRollSnapshot } from "./roll";
const catalog = await loadFatePresetCatalog();

const rules = resolveFateRules(catalog).rules;
const ctx = (operationId: string) => ({ operationId, timestamp: "2026-11-22T08:00:00.000Z" });

function counted(values: readonly number[]) {
  let calls = 0;
  return { random: () => values[calls++ % values.length], calls: () => calls };
}

const aspects: FateAspectRow[] = [
  { id: "highConcept", kind: "highConcept", text: "Courier to the dead", freeInvokes: 0, secret: false },
  { id: "fog", kind: "situation", text: "Thick Fog", freeInvokes: 2, secret: false },
  { id: "boost-1", kind: "boost", text: "Off Balance", freeInvokes: 1, secret: false },
];

function base(faces = [-1, -1, 0, 0], opposition = 2): FateRollSnapshot {
  const made = createFateRoll({
    rootRollId: "root-1", characterId: "char-1", skillId: "fight", rating: 2, faces: toFateFaces(faces), visibility: "all",
    options: { ...defaultFateRollOptions(), opposition },
  }, rules);
  if (!made.ok) throw new Error(made.reason);
  return made.snapshot;
}

const available = (overrides: Partial<FateInvokeAvailability> = {}): FateInvokeAvailability =>
  ({ readOnly: false, characterId: "char-1", fatePoints: 3, aspects, ...overrides });

describe("invoking aspects on a roll", () => {
  it("+2 keeps the faces and reads no randomness", () => {
    const rng = counted([0.9]);
    const result = applyFateInvoke(base(), { aspectId: "highConcept", payment: "paid", effect: "plus2" }, available(), ctx("op-1"), rng.random, rules);
    if (!result.ok) throw new Error(result.reason);
    expect(rng.calls()).toBe(0);
    expect(result.snapshot.faces).toEqual([-1, -1, 0, 0]);
    expect(result.result.total).toBe(2);
    expect(result.result.outcome).toBe("tie");
    expect(result.snapshot).toMatchObject({ rootRollId: "root-1", parentResultId: "root-1", resultId: "op-1" });
    expect(result.delta).toEqual({ fatePoints: -1, freeInvokes: null, removeAspectId: null });
    expect(result.ledgerEntry).toEqual({
      operationId: "op-1", reason: "invokePaid", timestamp: "2026-11-22T08:00:00.000Z", delta: -1, rollId: "root-1", aspectId: "highConcept",
    });
  });

  it("a reroll reads exactly four new faces and keeps earlier +2 modifiers", () => {
    const first = applyFateInvoke(base(), { aspectId: "highConcept", payment: "paid", effect: "plus2" }, available(), ctx("op-1"), Math.random, rules);
    if (!first.ok) throw new Error(first.reason);
    const rng = counted([0.9]);
    const reroll = applyFateInvoke(first.snapshot, { aspectId: "fog", payment: "free", effect: "reroll" }, available({ fatePoints: 2 }), ctx("op-2"), rng.random, rules);
    if (!reroll.ok) throw new Error(reroll.reason);
    expect(rng.calls()).toBe(4);
    expect(reroll.snapshot.faces).toEqual([1, 1, 1, 1]);
    expect(reroll.result.total).toBe(2 + 4 + 2);
    expect(reroll.result.shifts).toBe(6);
    expect(reroll.snapshot.parentResultId).toBe("op-1");
    expect(reroll.delta).toEqual({ fatePoints: 0, freeInvokes: { aspectId: "fog", delta: -1 }, removeAspectId: null });
  });

  it("allows one paid invoke per aspect per roll but stacks free invokes", () => {
    const paid = applyFateInvoke(base(), { aspectId: "fog", payment: "paid", effect: "plus2" }, available(), ctx("op-1"), Math.random, rules);
    if (!paid.ok) throw new Error(paid.reason);
    expect(checkFateInvoke(paid.snapshot, { aspectId: "fog", payment: "paid", effect: "plus2" }, available())).toEqual({ ok: false, reason: "paidRepeat" });
    const free1 = applyFateInvoke(paid.snapshot, { aspectId: "fog", payment: "free", effect: "plus2" }, available(), ctx("op-2"), Math.random, rules);
    if (!free1.ok) throw new Error(free1.reason);
    const afterOne = applyFateAspectDelta(aspects, free1.delta);
    const free2 = applyFateInvoke(free1.snapshot, { aspectId: "fog", payment: "free", effect: "plus2" }, available({ aspects: afterOne }), ctx("op-3"), Math.random, rules);
    if (!free2.ok) throw new Error(free2.reason);
    const afterTwo = applyFateAspectDelta(afterOne, free2.delta);
    expect(afterTwo.find(a => a.id === "fog")?.freeInvokes).toBe(0);
    expect(resolveFateRoll(free2.snapshot, rules).total).toBe(6);
    expect(checkFateInvoke(free2.snapshot, { aspectId: "fog", payment: "free", effect: "plus2" }, available({ aspects: afterTwo })))
      .toEqual({ ok: false, reason: "noFreeInvokes" });
  });

  it("treats zero fate points as a real balance", () => {
    expect(checkFateInvoke(base(), { aspectId: "highConcept", payment: "paid", effect: "plus2" }, available({ fatePoints: 0 })))
      .toEqual({ ok: false, reason: "noFatePoints" });
    expect(checkFateInvoke(base(), { aspectId: "fog", payment: "free", effect: "plus2" }, available({ fatePoints: 0 })).ok).toBe(true);
  });

  it("uses a boost once for free and removes it; it cannot be bought", () => {
    expect(checkFateInvoke(base(), { aspectId: "boost-1", payment: "paid", effect: "plus2" }, available())).toEqual({ ok: false, reason: "boostCannotBePaid" });
    const used = applyFateInvoke(base(), { aspectId: "boost-1", payment: "free", effect: "plus2" }, available(), ctx("op-1"), Math.random, rules);
    if (!used.ok) throw new Error(used.reason);
    expect(used.delta).toEqual({ fatePoints: 0, freeInvokes: null, removeAspectId: "boost-1" });
    expect(applyFateAspectDelta(aspects, used.delta).map(a => a.id)).toEqual(["highConcept", "fog"]);
  });

  it("refuses read-only, another character's roll, unknown aspects and a replayed operation", () => {
    const request = { aspectId: "fog", payment: "free", effect: "plus2" } as const;
    expect(checkFateInvoke(base(), request, available({ readOnly: true }))).toEqual({ ok: false, reason: "readOnly" });
    expect(checkFateInvoke(base(), request, available({ characterId: "char-2" }))).toEqual({ ok: false, reason: "wrongCharacter" });
    expect(checkFateInvoke(base(), { ...request, aspectId: "theirs" }, available())).toEqual({ ok: false, reason: "unknownAspect" });
    const once = applyFateInvoke(base(), request, available(), ctx("op-1"), Math.random, rules);
    if (!once.ok) throw new Error(once.reason);
    expect(applyFateInvoke(once.snapshot, request, available(), ctx("op-1"), Math.random, rules)).toEqual({ ok: false, reason: "duplicateOperation" });
  });
});

describe("claiming a confirmed roll's reward", () => {
  const style = () => {
    const made = createFateRoll({
      rootRollId: "root-9", characterId: "char-1", rating: 0, faces: toFateFaces([0, 0, 0, 0]), visibility: "all",
      options: { ...defaultFateRollOptions(), action: "createAdvantage", opposition: -3 },
    }, rules);
    if (!made.ok) throw new Error(made.reason);
    return { snapshot: made.snapshot, result: resolveFateRoll(made.snapshot, rules) };
  };

  it("creates a situation aspect with the earned free invokes, once per root roll", () => {
    const { snapshot, result } = style();
    const claim = planFateRollReward({
      snapshot, result, offerId: "freeInvokes", target: { kind: "new", aspectId: "a-new", text: "On Fire" },
      aspects, receipts: {}, readOnly: false,
    }, ctx("op-r"));
    if (!claim.ok) throw new Error(claim.reason);
    expect(claim.add).toEqual({ id: "a-new", kind: "situation", text: "On Fire", freeInvokes: 2, secret: false });
    expect(claim.receipt.id).toBe(fateRewardReceiptId("root-9"));
    const again = planFateRollReward({
      snapshot, result, offerId: "freeInvokes", target: { kind: "new", aspectId: "a-2", text: "Smoke" },
      aspects, receipts: { [claim.receipt.id]: claim.receipt }, readOnly: false,
    }, ctx("op-r2"));
    expect(again).toEqual({ ok: false, reason: "alreadyClaimed" });
  });

  it("refuses offers the result did not make and boosts on existing rows", () => {
    const { snapshot, result } = style();
    expect(planFateRollReward({ snapshot, result, offerId: "boost", target: { kind: "new", aspectId: "b", text: "x" }, aspects, receipts: {}, readOnly: false }, ctx("x")))
      .toEqual({ ok: false, reason: "notOffered" });
    expect(planFateRollReward({ snapshot, result, offerId: "freeInvokes", target: { kind: "existing", aspectId: "fog" }, aspects, receipts: {}, readOnly: false }, ctx("x")))
      .toEqual({ ok: false, reason: "newAspectRequired" });
  });
});

describe("compensating a rejected invoke", () => {
  it("restores the balance and free use once", () => {
    const ledger = [
      { operationId: "op-1", reason: "invokePaid" as const, timestamp: "t", delta: -1, rollId: "root", aspectId: "highConcept" },
      { operationId: "op-2", reason: "invokeFree" as const, timestamp: "t", delta: 0, freeInvokeDelta: -1, rollId: "root", aspectId: "fog" },
    ];
    const paid = planFateInvokeReversal(ledger, "op-1", "t2");
    expect(paid.ok && paid.delta).toEqual({ fatePoints: 1, freeInvokes: null, removeAspectId: null });
    const free = planFateInvokeReversal(ledger, "op-2", "t2");
    expect(free.ok && free.delta.freeInvokes).toEqual({ aspectId: "fog", delta: 1 });
    if (!paid.ok) throw new Error(paid.reason);
    expect(planFateInvokeReversal([...ledger, paid.ledgerEntry], "op-1", "t3")).toEqual({ ok: false, reason: "alreadyReversed" });
    expect(planFateInvokeReversal(ledger, "nope", "t")).toEqual({ ok: false, reason: "unknownOperation" });
  });
});
