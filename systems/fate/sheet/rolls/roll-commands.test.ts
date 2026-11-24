import { describe, expect, it } from "vitest";
import type { FateCharacterData } from "../../domain/character";
import { applyFateInvoke, type FateInvokeRequest } from "../../domain/invoke";
import { readFateAspects, readFateResources, readFateStunts } from "../../domain/normalize";
import { createFateRoll, defaultFateRollOptions, resolveFateRoll, type FateRollSnapshot } from "../../domain/roll";
import { claimFateReward, commitFateInvoke, markFateStuntsUsed, reverseFateInvoke, setFateReceiptStatus, type FateCommandVerdict } from "./roll-commands";
import { FATE_ROLL_RULES_OFF } from "./roll-rules";

const base: FateCharacterData = {
  name: "沈青霜",
  fatePoints: 2,
  unknownRoot: { keep: true },
  aspects: { format: 2, aspects: [
    { id: "highConcept", kind: "highConcept", text: "遭東廠追殺的忠臣之女", freeInvokes: 0, secret: false },
    { id: "boost-1", kind: "boost", text: "看穿他的破綻", freeInvokes: 1, secret: false },
    { id: "situation-1", kind: "situation", text: "滿堂賓客都在看", freeInvokes: 1, secret: false },
  ] },
  stunts: { stunts: [{ id: "once", type: "bonus", circumstance: "x", skillId: "fight", oncePerSession: true }] },
  fateV2: { ledger: [{ operationId: "older", reason: "compel", timestamp: "t0", delta: 1 }], extra: "kept" },
};

function rolled(faces: FateRollSnapshot["faces"] = [0, 0, 0, 0]): FateRollSnapshot {
  const made = createFateRoll(
    { rootRollId: "root-1", characterId: "char-1", skillId: "fight", rating: 4, faces, options: { ...defaultFateRollOptions(), opposition: 4 }, visibility: "all" },
    FATE_ROLL_RULES_OFF,
  );
  if (!made.ok) throw new Error(made.reason);
  return made.snapshot;
}

function command(data: FateCharacterData, request: FateInvokeRequest, operationId = "op-1", snapshot = rolled()) {
  const { rows } = readFateAspects(data);
  const { fatePoints } = readFateResources(data);
  const applied = applyFateInvoke(snapshot, request, { readOnly: false, characterId: "char-1", fatePoints, aspects: rows }, { operationId, timestamp: "t1" }, () => 0.9, FATE_ROLL_RULES_OFF);
  if (!applied.ok) throw new Error(applied.reason);
  return { context: { operationId, timestamp: "t1" }, characterId: "char-1", snapshot, request, delta: applied.delta, ledgerEntry: applied.ledgerEntry, status: "pending" as const };
}

const v2 = (data: FateCharacterData) => data.fateV2 as Record<string, unknown> & { ledger: { operationId: string; reason: string; delta: number }[]; receipts: Record<string, { status: string; payload: Record<string, unknown> }> };

describe("commitFateInvoke", () => {
  it("applies FP, ledger and receipt together and keeps unknown keys", () => {
    const verdicts: FateCommandVerdict[] = [];
    const next = commitFateInvoke(base, command(base, { aspectId: "highConcept", payment: "paid", effect: "plus2" }), undefined, (v) => verdicts.push(v));
    expect(verdicts).toEqual(["applied"]);
    expect(next.fatePoints).toBe(1);
    expect(next.unknownRoot).toEqual({ keep: true });
    expect(v2(next).extra).toBe("kept");
    expect(v2(next).ledger.map((e) => [e.operationId, e.reason, e.delta])).toEqual([["older", "compel", 1], ["op-1", "invokePaid", -1]]);
    expect(v2(next).receipts["op-1"]).toMatchObject({ status: "pending", payload: { aspectId: "highConcept", payment: "paid", effect: "plus2" } });
    // No aspect text in the receipt of a permanent aspect.
    expect(JSON.stringify(v2(next).receipts["op-1"])).not.toContain("忠臣");
  });

  it("is a no-op when the same operation is replayed (retry never debits twice)", () => {
    const cmd = command(base, { aspectId: "highConcept", payment: "paid", effect: "plus2" });
    const once = commitFateInvoke(base, cmd);
    const verdicts: FateCommandVerdict[] = [];
    const twice = commitFateInvoke(once, cmd, undefined, (v) => verdicts.push(v));
    expect(twice).toBe(once);
    expect(verdicts).toEqual(["duplicate"]);
    expect(twice.fatePoints).toBe(1);
  });

  it("refuses against a stale record: FP spent elsewhere or the free use gone", () => {
    const paid = command(base, { aspectId: "highConcept", payment: "paid", effect: "plus2" });
    const broke = { ...base, fatePoints: 0 };
    const verdicts: FateCommandVerdict[] = [];
    expect(commitFateInvoke(broke, paid, undefined, (v) => verdicts.push(v))).toBe(broke);
    const free = command(base, { aspectId: "situation-1", payment: "free", effect: "plus2" }, "op-2");
    const used = commitFateInvoke(base, command(base, { aspectId: "situation-1", payment: "free", effect: "plus2" }, "op-other"));
    expect(commitFateInvoke(used, free, undefined, (v) => verdicts.push(v))).toBe(used);
    expect(verdicts).toEqual(["refused", "refused"]);
  });

  it("removes a used boost and keeps its row in the receipt for a reversal", () => {
    const next = commitFateInvoke(base, command(base, { aspectId: "boost-1", payment: "free", effect: "reroll" }));
    expect(readFateAspects(next).rows.map((row) => row.id)).toEqual(["highConcept", "situation-1"]);
    expect(next.fatePoints).toBe(2);
    expect(v2(next).receipts["op-1"].payload.removedRow).toMatchObject({ id: "boost-1", kind: "boost" });
  });
});

describe("receipts and reversal", () => {
  it("moves a receipt only from the allowed states", () => {
    const next = commitFateInvoke(base, command(base, { aspectId: "highConcept", payment: "paid", effect: "plus2" }));
    const posted = setFateReceiptStatus(next, "op-1", "posted", ["pending"]);
    expect(v2(posted).receipts["op-1"].status).toBe("posted");
    expect(setFateReceiptStatus(posted, "op-1", "rejected", ["pending"])).toBe(posted);
  });

  it("refunds a rejected invoke once and restores a used boost", () => {
    const paid = setFateReceiptStatus(commitFateInvoke(base, command(base, { aspectId: "highConcept", payment: "paid", effect: "plus2" })), "op-1", "rejected", ["pending"]);
    const back = reverseFateInvoke(paid, "op-1", "t2");
    expect(back.fatePoints).toBe(2);
    expect(v2(back).receipts["op-1"].status).toBe("reversed");
    const verdicts: FateCommandVerdict[] = [];
    expect(reverseFateInvoke(back, "op-1", "t3", undefined, (v) => verdicts.push(v))).toBe(back);
    expect(verdicts).toEqual(["duplicate"]);

    const boosted = setFateReceiptStatus(commitFateInvoke(base, command(base, { aspectId: "boost-1", payment: "free", effect: "plus2" })), "op-1", "rejected", ["pending"]);
    const restored = reverseFateInvoke(boosted, "op-1", "t2");
    expect(readFateAspects(restored).rows.find((row) => row.id === "boost-1")).toMatchObject({ kind: "boost", freeInvokes: 1, text: "看穿他的破綻" });
  });

  it("does not reverse a rejected invoke after its roll reward was claimed", () => {
    const paid = commitFateInvoke(base, command(base, { aspectId: "highConcept", payment: "paid", effect: "plus2" }));
    const rejected = setFateReceiptStatus(paid, "op-1", "rejected", ["pending"]);
    const settled = { ...rejected, fateV2: { ...v2(rejected), receipts: { ...v2(rejected).receipts, "root-1:reward": { status: "local" } } } };
    expect(reverseFateInvoke(settled, "op-1", "t2")).toBe(settled);
  });

  it("does not reverse a posted or unknown delivery", () => {
    const next = commitFateInvoke(base, command(base, { aspectId: "highConcept", payment: "paid", effect: "plus2" }));
    for (const status of ["posted", "unknown", "pending"] as const) {
      const marked = setFateReceiptStatus(next, "op-1", status, ["pending"]);
      expect(reverseFateInvoke(marked, "op-1", "t2")).toBe(marked);
    }
  });
});

describe("stunts and rewards", () => {
  it("marks a once-per-session stunt used only with a session", () => {
    expect(readFateStunts(markFateStuntsUsed(base, ["once"], "s-1"))[0].usedSessionId).toBe("s-1");
    expect(markFateStuntsUsed(base, ["once"], undefined)).toBe(base);
  });

  it("claims a result's free invokes once per root roll", () => {
    const made = createFateRoll(
      { rootRollId: "root-2", characterId: "char-1", rating: 2, faces: [1, 1, 0, 0], options: { ...defaultFateRollOptions(), action: "createAdvantage", opposition: 0 }, visibility: "local" },
      FATE_ROLL_RULES_OFF,
    );
    if (!made.ok) throw new Error(made.reason);
    const result = resolveFateRoll(made.snapshot, FATE_ROLL_RULES_OFF);
    const target = { kind: "new" as const, aspectId: "new-1", text: "桌上的油燈" };
    const once = claimFateReward(base, { snapshot: made.snapshot, result, offerId: "freeInvokes", target }, { operationId: "c-1", timestamp: "t" });
    expect(readFateAspects(once).rows.find((row) => row.id === "new-1")).toMatchObject({ kind: "situation", freeInvokes: 2 });
    const verdicts: FateCommandVerdict[] = [];
    expect(claimFateReward(once, { snapshot: made.snapshot, result, offerId: "freeInvokes", target: { ...target, aspectId: "new-2" } }, { operationId: "c-2", timestamp: "t" }, undefined, (v) => verdicts.push(v))).toBe(once);
    expect(verdicts).toEqual(["duplicate"]);
  });
});
