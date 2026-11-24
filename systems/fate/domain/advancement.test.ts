import { describe, expect, it } from "vitest";
import { checkFateSkillGrowth, planFateMajorMilestone, planFateMinorMilestone, type FateAdvancementState } from "./advancement";
import { loadFatePresetCatalog, type FateRosterSkill } from "./presets";
const catalog = await loadFatePresetCatalog();

const { economy, recovery, advancement } = catalog;
const config = { economy, recovery, advancement };
const ctx = (operationId: string) => ({ operationId, timestamp: "2026-11-22T08:00:00.000Z" });
const skills = (ratings: Record<string, number>): FateRosterSkill[] =>
  Object.entries(ratings).map(([id, rating]) => ({ id, rating, explicit: true, custom: false }));

// Ruth (SRD 1180–1182): one Great, two Good, three Fair, four Average.
const ruth = { fight: 4, lore: 1, will: 3, notice: 3, athletics: 2, rapport: 2, investigate: 2, academics: 1, contacts: 1, crafts: 1, empathy: 0 };

const state = (overrides: Partial<FateAdvancementState> = {}): FateAdvancementState => ({
  readOnly: false,
  skills: skills(ruth),
  aspects: [
    { id: "highConcept", kind: "highConcept", text: "Occult Librarian" },
    { id: "trouble", kind: "trouble", text: "Curious to a Fault" },
    { id: "fog", kind: "situation", text: "Fog" },
  ],
  stunts: [{ id: "st1" }],
  refresh: { base: 3, earned: 0, nonblankStunts: 3 },
  bankedSkillRanks: 0,
  boundaries: { scene: 5, session: 3, majorMilestone: 1 },
  milestones: [],
  injuries: [],
  ...overrides,
});

describe("minor milestones", () => {
  it("accept doing nothing", () => {
    const minor = planFateMinorMilestone(state(), null, config, ctx("m1"));
    expect(minor).toEqual({
      ok: true,
      delta: { skills: {}, aspects: {}, refreshEarnedDelta: 0, bankedSkillRanks: 0, injuries: { begin: {}, clear: [] } },
      entry: { id: "m1", kind: "minor", timestamp: "2026-11-22T08:00:00.000Z", operationId: "m1", skillPointDelta: 0, refreshDelta: 0 },
    });
    expect(planFateMinorMilestone(state({ milestones: [{ operationId: "m1" }] }), null, config, ctx("m1"))).toEqual({ ok: false, reason: "duplicateOperation" });
  });

  it("swap two ranks or replace an Average skill with an unrated one", () => {
    const swap = planFateMinorMilestone(state(), { kind: "swapSkills", skillA: "fight", skillB: "lore" }, config, ctx("m"));
    expect(swap.ok && swap.delta.skills).toEqual({ fight: 1, lore: 4 });
    const replace = planFateMinorMilestone(state(), { kind: "replaceAverage", from: "lore", to: "empathy" }, config, ctx("m"));
    expect(replace.ok && replace.delta.skills).toEqual({ lore: 0, empathy: 1 });
    expect(planFateMinorMilestone(state(), { kind: "replaceAverage", from: "fight", to: "empathy" }, config, ctx("m"))).toEqual({ ok: false, reason: "notAverage" });
    expect(planFateMinorMilestone(state(), { kind: "replaceAverage", from: "lore", to: "crafts" }, config, ctx("m"))).toEqual({ ok: false, reason: "alreadyRated" });
  });

  it("rewrite any aspect except the high concept or the extreme replacement", () => {
    expect(planFateMinorMilestone(state(), { kind: "rewriteAspect", aspectId: "highConcept", text: "X" }, config, ctx("m"))).toEqual({ ok: false, reason: "highConceptLocked" });
    expect(planFateMinorMilestone(state({ extremeAspectId: "trouble" }), { kind: "rewriteAspect", aspectId: "trouble", text: "X" }, config, ctx("m")))
      .toEqual({ ok: false, reason: "extremeAspectLocked" });
    expect(planFateMinorMilestone(state(), { kind: "rewriteAspect", aspectId: "fog", text: "X" }, config, ctx("m"))).toEqual({ ok: false, reason: "notCharacterAspect" });
    const rewrite = planFateMinorMilestone(state(), { kind: "rewriteAspect", aspectId: "trouble", text: "Reckless Reader" }, config, ctx("m"));
    expect(rewrite.ok && rewrite.delta.aspects).toEqual({ trouble: "Reckless Reader" });
  });

  it("buy a stunt only while refresh stays at least 1", () => {
    const buy = planFateMinorMilestone(state(), { kind: "purchaseStunt" }, config, ctx("m"));
    expect(buy.ok && buy.delta.purchaseStunt).toEqual({ cost: 1 });
    expect(planFateMinorMilestone(state({ refresh: { base: 3, earned: 0, nonblankStunts: 5 } }), { kind: "purchaseStunt" }, config, ctx("m")))
      .toEqual({ ok: false, reason: "belowMinimumRefresh" });
  });
});

describe("skill growth columns", () => {
  const ratings = new Map(Object.entries(ruth));

  it("refuses Ruth's Lore +2 alone and accepts it with a banked point for Empathy", () => {
    expect(checkFateSkillGrowth(ratings, { lore: 2 }, 1)).toEqual({ ok: false, reason: "columns", detail: { ranks: [2] } });
    const both = checkFateSkillGrowth(ratings, { lore: 2, empathy: 1 }, 2);
    expect(both.ok && [both.cost, both.banked]).toEqual([2, 0]);
  });

  it("validates the set: no decreases, enough points, unspent points bank", () => {
    expect(checkFateSkillGrowth(ratings, { fight: 3 }, 1)).toEqual({ ok: false, reason: "decrease", detail: { skillId: "fight" } });
    expect(checkFateSkillGrowth(ratings, { empathy: 2 }, 1)).toEqual({ ok: false, reason: "insufficientPoints", detail: { cost: 2, points: 1 } });
    const none = checkFateSkillGrowth(ratings, {}, 3);
    expect(none.ok && none.banked).toBe(3);
  });

  it("does not blame growth for a starting shape that already breaks columns", () => {
    const diamond = new Map(Object.entries({ a: 4, b: 3, c: 3, d: 2, e: 2, f: 2, g: 1, h: 1, i: 0 }));
    expect(checkFateSkillGrowth(diamond, { i: 1 }, 1).ok).toBe(true);
    expect(checkFateSkillGrowth(diamond, { g: 2 }, 1)).toMatchObject({ ok: false, reason: "columns" });
    const wide = new Map(Object.entries({ a: 3, b: 2, c: 2, d: 2, e: 2, f: 1, g: 1, z: 0 }));
    expect(checkFateSkillGrowth(wide, { z: 1 }, 1).ok).toBe(true);
  });
});

describe("major milestones", () => {
  it("grant one skill point (bankable), unlock the next extreme and allow one lateral option", () => {
    const major = planFateMajorMilestone(state({ bankedSkillRanks: 1 }), {
      lateral: { kind: "rewriteAspect", aspectId: "trouble", text: "Reckless Reader" },
      highConcept: "Keeper of the Black Archive",
      increases: { empathy: 1 },
    }, config, ctx("M1"));
    if (!major.ok) throw new Error(major.reason);
    expect(major.delta).toMatchObject({
      skills: { empathy: 1 }, bankedSkillRanks: 1, majorMilestoneSequence: 2, refreshEarnedDelta: 0,
      aspects: { trouble: "Reckless Reader", highConcept: "Keeper of the Black Archive" },
    });
    expect(major.entry).toMatchObject({ kind: "major", skillPointDelta: 1, refreshDelta: 0 });
  });

  it("acknowledges the GM's optional refresh and second skill point locally", () => {
    const major = planFateMajorMilestone(state({ refresh: { base: 3, earned: 0, nonblankStunts: 5 } }), {
      lateral: { kind: "purchaseStunt" }, gm: { refresh: true, secondSkillPoint: true }, increases: { lore: 2, empathy: 1 },
    }, config, ctx("M2"));
    if (!major.ok) throw new Error(major.reason);
    expect(major.delta).toMatchObject({ refreshEarnedDelta: 1, purchaseStunt: { cost: 1 }, bankedSkillRanks: 0, skills: { lore: 2, empathy: 1 } });
    expect(major.entry).toMatchObject({ skillPointDelta: 2, refreshDelta: 1 });
  });

  it("begins recovery of moderate/severe consequences and clears ones already recovering", () => {
    const injuries = [
      { key: "moderate", severity: "moderate" as const, text: "Gaping Wound", renamable: true },
      { key: "severe", severity: "severe" as const, text: "Healing Leg", renamable: true, metadata: { injuryId: "x", injuryText: "Healing Leg", recovery: { boundary: "majorMilestone" as const, treatedAtSequence: 1 } } },
      { key: "mild", severity: "mild" as const, text: "Bruise", renamable: true },
    ];
    const major = planFateMajorMilestone(state({ injuries }), { beginRecovery: { moderate: "Stitched Wound" }, clear: ["severe"] }, config, ctx("M3"));
    if (!major.ok) throw new Error(major.reason);
    expect(major.delta.injuries).toEqual({
      begin: { moderate: { text: "Stitched Wound", metadata: { injuryId: "M3:moderate", injuryText: "Stitched Wound", recovery: { boundary: "session", treatedAtSequence: 3 } } } },
      clear: ["severe"],
    });
    expect(planFateMajorMilestone(state({ injuries }), { beginRecovery: { mild: "x" } }, config, ctx("M4"))).toEqual({ ok: false, reason: "notEligibleForRecovery", detail: { key: "mild" } });
    expect(planFateMajorMilestone(state({ injuries }), { clear: ["moderate"] }, config, ctx("M4"))).toEqual({ ok: false, reason: "notRecovering", detail: { key: "moderate" } });
  });

  it("a severe consequence begun at a major milestone waits for the next one", () => {
    const injuries = [{ key: "severe", severity: "severe" as const, text: "Crippled Leg", renamable: true }];
    const major = planFateMajorMilestone(state({ injuries }), { beginRecovery: { severe: "Leg in a Brace" } }, config, ctx("M5"));
    expect(major.ok && major.delta.injuries.begin.severe.metadata.recovery).toEqual({ boundary: "majorMilestone", treatedAtSequence: 2 });
  });

  it("may rename the extreme replacement but needs one to exist", () => {
    expect(planFateMajorMilestone(state(), { extremeRename: "At Peace" }, config, ctx("M6"))).toEqual({ ok: false, reason: "noExtreme" });
    const renamed = planFateMajorMilestone(state({ extremeAspectId: "trouble" }), { extremeRename: "At Peace with the Dead" }, config, ctx("M6"));
    expect(renamed.ok && [renamed.delta.aspects.trouble, renamed.delta.extremeText]).toEqual(["At Peace with the Dead", "At Peace with the Dead"]);
  });

  it("refuses read-only cards and overspending", () => {
    expect(planFateMajorMilestone(state({ readOnly: true }), {}, config, ctx("M7"))).toEqual({ ok: false, reason: "readOnly" });
    expect(planFateMajorMilestone(state(), { increases: { empathy: 2 } }, config, ctx("M7"))).toMatchObject({ ok: false, reason: "insufficientPoints" });
  });
});
