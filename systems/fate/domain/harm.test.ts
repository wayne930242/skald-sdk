import { describe, expect, it } from "vitest";
import type { FateAspectRow } from "./character";
import {
  assignFateLegacyExtraMild,
  checkFateHarmSwitch,
  clearFateStress,
  confirmFateHarm,
  fateConditionBoxKey,
  planFateHarm,
  readFateConditionMarks,
  resolveFateHarmModel,
  type FateHarmInput,
  type FateHarmPlan,
} from "./harm";
import { fateLinkRatings, loadFatePresetCatalog, resolveFateRules, type FatePresetSelection } from "./presets";
const catalog = await loadFatePresetCatalog();

const ctx = (operationId: string) => ({ operationId, timestamp: "2026-11-22T08:00:00.000Z" });
const empty: FateHarmInput = { stress: {}, consequences: {}, conditions: {}, majorMilestoneSequence: 0 };
const rulesFor = (selection: Partial<FatePresetSelection> = {}) => resolveFateRules(catalog, { selection }).rules;
const model = (selection: Partial<FatePresetSelection>, ratings: Record<string, number>, harm: Partial<FateHarmInput> = {}) => {
  const rules = rulesFor(selection);
  return resolveFateHarmModel(rules, fateLinkRatings(rules.skills, ratings), { ...empty, ...harm });
};
const plans = (m: ReturnType<typeof model>, shifts: number, kind: "physical" | "mental" = "physical") => {
  const options = planFateHarm(m, shifts, kind);
  if (options.kind !== "plans") throw new Error(options.kind);
  return options.plans;
};
const summary = (plan: FateHarmPlan) => [plan.stress?.boxes.length ?? 0, ...plan.slots, ...plan.conditions.map(c => `${c.conditionId}×${c.boxes.length}`)].join(" ");
const aspects: FateAspectRow[] = [
  { id: "highConcept", kind: "highConcept", text: "Ghost postmaster", freeInvokes: 0, secret: false },
  { id: "trouble", kind: "trouble", text: "The dead write back", freeInvokes: 0, secret: false },
  { id: "fog", kind: "situation", text: "Fog", freeInvokes: 1, secret: false },
];

describe("stress capacity", () => {
  it("split tracks are 3/4/6 one-point boxes at the linked skill's +0/+1/+3", () => {
    const capacity = (rating: number) => model({}, { physique: rating, will: rating }).stress.map(t => t.capacity);
    expect([-1, 0, 1, 2, 3, 4, 5].map(capacity)).toEqual([[3, 3], [3, 3], [4, 4], [4, 4], [6, 6], [6, 6], [6, 6]]);
  });

  it("the unified track is 6/7/9 from the higher of Physique and Will", () => {
    const capacity = (physique: number, will: number) => model({ stress: "unified" }, { physique, will }).stress.map(t => [t.id, t.capacity]);
    expect(capacity(0, 0)).toEqual([["unified", 6]]);
    expect(capacity(1, 0)).toEqual([["unified", 7]]);
    expect(capacity(0, 2)).toEqual([["unified", 7]]);
    expect(capacity(1, 3)).toEqual([["unified", 9]]);
  });

  it("falls back to the default when the active list has no linked skills", () => {
    expect(model({ skills: "short-approaches" }, { physique: 5 }).stress.map(t => t.capacity)).toEqual([3, 3]);
    expect(model({ skills: "short-approaches", stress: "unified" }, {}).stress.map(t => t.capacity)).toEqual([6]);
  });

  it("keeps marks beyond the current capacity as inactive, not free", () => {
    const m = model({}, { physique: 0 }, { stress: { physical: [1, 5] } });
    expect(m.stress[0]).toMatchObject({ capacity: 3, free: [2, 3], outOfCap: [5] });
    expect(m.inactive).toEqual([{ kind: "stress", trackId: "physical", index: 5 }]);
  });
});

describe("consequence slots", () => {
  it("each +5 grants its own extra mild, usable only for its hit kind", () => {
    const both = model({}, { physique: 5, will: 6 });
    expect(both.slots.map(s => s.id)).toEqual(["mild", "moderate", "severe", "extraMild-physical", "extraMild-mental"]);
    const physicalHit = planFateHarm(both, 2, "physical");
    const mentalHit = planFateHarm(both, 2, "mental");
    const slotsUsed = (o: typeof physicalHit) => o.kind === "plans" ? o.plans.flatMap(p => p.slots) : [];
    expect(slotsUsed(physicalHit)).toContain("extraMild-physical");
    expect(slotsUsed(physicalHit)).not.toContain("extraMild-mental");
    expect(slotsUsed(mentalHit)).toContain("extraMild-mental");
    expect(slotsUsed(mentalHit)).not.toContain("extraMild-physical");
    expect(model({}, { physique: 4, will: 5 }).slots.map(s => s.id)).toEqual(["mild", "moderate", "severe", "extraMild-mental"]);
  });

  it("an unassigned legacy extra mild blocks the extra slots until it is assigned", () => {
    const m = model({}, { physique: 5, will: 5 }, { legacyExtraMild: "Burnt fingers" });
    expect(m.slots.filter(s => s.extra).map(s => s.blocked)).toEqual(["legacyUnassigned", "legacyUnassigned"]);
    expect(assignFateLegacyExtraMild(m, "mild", false)).toEqual({ ok: false, reason: "notExtraSlot" });
    expect(assignFateLegacyExtraMild(m, "extraMild-mental", false)).toEqual({
      ok: true, consequence: { slotId: "extraMild-mental", text: "Burnt fingers" }, clearLegacy: true,
    });
    expect(assignFateLegacyExtraMild(m, "extraMild-mental", true)).toEqual({ ok: false, reason: "readOnly" });
  });
});

describe("legal harm plans", () => {
  it("lists every minimal combination, grouped by stress count", () => {
    const m = model({}, { physique: 0 });
    expect(plans(m, 2).map(summary)).toEqual(["2", "0 mild", "0 moderate", "0 severe"]);
    expect(plans(m, 5).map(summary)).toEqual(["1 moderate", "3 mild", "0 severe", "0 mild moderate"]);
  });

  it("allows excess capacity such as a severe alone for 4, but never an unneeded extra cell", () => {
    const m = model({}, { physique: 0 });
    const four = plans(m, 4);
    expect(four.find(p => summary(p) === "0 severe")).toMatchObject({ absorbed: 6, excess: 2 });
    expect(four.map(summary)).not.toContain("1 severe");
    expect(four.map(summary)).not.toContain("2 mild moderate");
  });

  it("skips occupied slots and marked boxes, picking stable box IDs", () => {
    const m = model({}, { physique: 0 }, { stress: { physical: [1] }, consequences: { mild: "Broken nose" } });
    expect(plans(m, 2).map(p => [summary(p), p.stress?.boxes ?? []])).toEqual([["2", [2, 3]], ["0 moderate", []], ["0 severe", []]]);
  });

  it("reports taken out with the exact shortfall", () => {
    const m = model({}, { physique: 0 }, { stress: { physical: [1, 2, 3] }, consequences: { moderate: "Gaping Chest Wound" } });
    expect(planFateHarm(m, 9, "physical")).toEqual({ kind: "takenOut", maxAbsorb: 8, shortfall: 1 });
    expect(planFateHarm(m, 0, "physical")).toEqual({ kind: "noHit" });
  });

  it("uses the unified track for both hit kinds", () => {
    const m = model({ stress: "unified" }, { physique: 1, will: 0 });
    expect(plans(m, 7, "mental").map(summary)).toContain("7");
    expect(plans(m, 7, "physical").map(summary)).toContain("1 severe");
  });
});

describe("confirming a plan", () => {
  it("rechecks free cells and requires text for new consequences", () => {
    const m = model({}, { physique: 0 });
    const plan = plans(m, 3).find(p => summary(p) === "1 mild");
    if (!plan) throw new Error("plan");
    const input = { plan, texts: { mild: "Bruised Ribs" }, aspects, readOnly: false, majorMilestoneSequence: 0 };
    expect(confirmFateHarm(m, { ...input, texts: { mild: " " } }, ctx("op"))).toEqual({ ok: false, reason: "missingText", detail: { slots: ["mild"] } });
    expect(confirmFateHarm(m, { ...input, readOnly: true }, ctx("op"))).toEqual({ ok: false, reason: "readOnly" });
    const done = confirmFateHarm(m, input, ctx("op"));
    expect(done).toEqual({
      ok: true,
      delta: {
        stress: { physical: [1] },
        consequences: { mild: { text: "Bruised Ribs", metadata: { injuryId: "op:mild", injuryText: "Bruised Ribs", externalClaim: true } } },
        conditions: {},
      },
    });
    const after = model({}, { physique: 0 }, { stress: { physical: [1] } });
    expect(confirmFateHarm(after, input, ctx("op2"))).toEqual({ ok: false, reason: "stale" });
  });
});

describe("extreme consequences", () => {
  it("absorb 8 by replacing a non-high-concept character aspect, once between major milestones", () => {
    const m = model({ extreme: "srd" }, { physique: 0 }, { stress: { physical: [1, 2, 3] }, consequences: { mild: "a", moderate: "b", severe: "c" } });
    const plan = plans(m, 8).find(p => p.replacesAspect);
    if (!plan) throw new Error("plan");
    const input = { plan, texts: {}, aspects, readOnly: false, majorMilestoneSequence: 2 };
    expect(confirmFateHarm(m, { ...input, extreme: { aspectId: "highConcept", text: "Haunted" } }, ctx("op"))).toEqual({ ok: false, reason: "extremeTarget" });
    expect(confirmFateHarm(m, { ...input, extreme: { aspectId: "fog", text: "Haunted" } }, ctx("op"))).toEqual({ ok: false, reason: "extremeTarget" });
    const done = confirmFateHarm(m, { ...input, extreme: { aspectId: "trouble", text: "Haunted" } }, ctx("op"));
    expect(done.ok && done.delta.extreme).toEqual({ aspectId: "trouble", text: "Haunted", operationId: "op", majorMilestoneSequence: 2 });
    expect(done.ok && done.delta.aspectReplacement).toEqual({ aspectId: "trouble", text: "Haunted" });

    const used = model({ extreme: "srd" }, {}, { extreme: { majorMilestoneSequence: 2 }, majorMilestoneSequence: 2 });
    expect(used.slots.find(s => s.id === "extreme")?.blocked).toBe("extremeUsed");
    expect(plans(used, 8).some(p => p.replacesAspect)).toBe(false);
    const unlocked = model({ extreme: "srd" }, {}, { extreme: { majorMilestoneSequence: 2 }, majorMilestoneSequence: 3 });
    expect(unlocked.slots.find(s => s.id === "extreme")?.blocked).toBeNull();
  });

  it("stays a preference but is inactive under conditions", () => {
    const m = model({ extreme: "srd", injuries: "conditions" }, {});
    expect(m.extreme).toEqual({ enabled: true, active: false, available: false, protectedKinds: ["highConcept"] });
    expect(m.slots).toEqual([]);
  });
});

describe("conditions", () => {
  it("replace consequences entirely with [1,1,2,2,3,3]", () => {
    const m = model({ injuries: "conditions" }, { physique: 0, will: 0 });
    expect(m.slots).toEqual([]);
    expect(m.conditions.map(c => [c.id, c.value, c.boxes.length])).toEqual([
      ["hurt", 1, 1], ["scared", 1, 1], ["injured", 2, 1], ["shaken", 2, 1], ["wounded", 3, 1], ["demoralized", 3, 1],
    ]);
    // The base six fit any hit when it makes sense.
    expect(plans(m, 1, "mental").map(summary)).toEqual(["1", "0 hurt×1", "0 scared×1", "0 injured×1", "0 shaken×1", "0 demoralized×1", "0 wounded×1"]);
  });

  it("+5 adds two one-point boxes of the matching condition for that hit kind only", () => {
    const m = model({ injuries: "conditions" }, { physique: 5, will: 0 });
    expect(m.conditions[0].boxes.map(b => [b.index, b.extra, b.hitKinds])).toEqual([[1, false, null], [2, true, ["physical"]], [3, true, ["physical"]]]);
    expect(m.conditions[1].boxes).toHaveLength(1);
    expect(plans(m, 3, "physical").map(summary)).toContain("0 hurt×3");
    expect(plans(m, 3, "mental").map(summary)).not.toContain("0 hurt×3");
  });

  it("the kept-apart variant caps marks per row and raises the cap per added box", () => {
    const m = model({ injuries: "conditions-separate" }, { physique: 0, will: 0 }, { conditions: { hurt: [1] } });
    expect(m.rows.find(r => r.id === "mild")).toEqual({ id: "mild", cutoff: 2, marked: 1 });
    const mental = plans(m, 2, "mental").map(summary);
    expect(mental).not.toContain("0 scared×2");
    expect(mental).toContain("1 scared×1");
    const strong = model({ injuries: "conditions-separate" }, { physique: 5, will: 0 }, { conditions: { hurt: [1] } });
    expect(strong.rows.find(r => r.id === "mild")).toEqual({ id: "mild", cutoff: 4, marked: 1 });
  });

  it("records each marked box under a stable key", () => {
    const m = model({ injuries: "conditions" }, {});
    const plan = plans(m, 2).find(p => summary(p) === "0 injured×1");
    if (!plan) throw new Error("plan");
    const done = confirmFateHarm(m, { plan, texts: {}, aspects, readOnly: false, majorMilestoneSequence: 0 }, ctx("op"));
    const key = fateConditionBoxKey("injured", 1);
    expect(done.ok && done.delta.conditions).toEqual({ [key]: { text: key, metadata: { injuryId: `op:${key}`, injuryText: key, externalClaim: true } } });
    expect(readFateConditionMarks({ [key]: {}, "hurt:2": {}, "hurt:1": {}, junk: {}, "hurt:0": {} })).toEqual({ injured: [1], hurt: [1, 2] });
  });
});

describe("switching injury and stress models", () => {
  it("is blocked while active harm would leave the effective model", () => {
    const harm = { consequences: { mild: "Broken nose" } };
    const current = model({}, { physique: 0 }, harm);
    const next = model({ injuries: "conditions" }, { physique: 0 }, harm);
    expect(checkFateHarmSwitch(current, next)).toEqual({ ok: false, reason: "activeHarm", detail: { blockers: [{ kind: "consequence", slotId: "mild", text: "Broken nose" }] } });
    const marked = { stress: { physical: [2] } };
    expect(checkFateHarmSwitch(model({}, {}, marked), model({ stress: "unified" }, {}, marked)).ok).toBe(false);
  });

  it("is allowed without active harm and keeps inactive harm visible", () => {
    const harm = { stress: { unified: [1] } };
    const current = model({}, {}, harm);
    expect(current.inactive).toEqual([{ kind: "stress", trackId: "unified", index: 1 }]);
    expect(checkFateHarmSwitch(current, model({ injuries: "conditions" }, {}, harm))).toEqual({
      ok: true, retainedInactive: [{ kind: "stress", trackId: "unified", index: 1 }],
    });
    expect(clearFateStress(current)).toEqual({ unified: [] });
  });
});
