import { describe, expect, it } from "vitest";
import { loadFatePresetCatalog, resolveFateRules } from "./presets";
import {
  FATE_LADDER_MAX,
  FATE_LADDER_MIN,
  applyFateScaleAfterRoll,
  createFateRoll,
  defaultFateRollOptions,
  fateHitShifts,
  fateLadder,
  gradeFateRoll,
  previewFateRoll,
  resolveFateRoll,
  rollFateFaces,
  toFateFaces,
  type FateRollOptions,
} from "./roll";
const catalog = await loadFatePresetCatalog();

function countedRandom(values: readonly number[]) {
  let calls = 0;
  return { random: () => values[calls++ % values.length], calls: () => calls };
}
// Math.floor(r * 3) - 1: 0 → −1, 0.5 → 0, 0.9 → +1
const MINUS = 0, BLANK = 0.5, PLUS = 0.9;

const standard = resolveFateRules(catalog).rules;
const gear = resolveFateRules(catalog, { selection: { ratings: "srd", scale: "srd" } }).rules;

function roll(options: Partial<FateRollOptions>, faces = [0, 0, 0, 0], rating = 0, rules = standard) {
  const made = createFateRoll({
    rootRollId: "root", characterId: "char", rating, faces: toFateFaces(faces), visibility: "all",
    options: { ...defaultFateRollOptions(), ...options },
  }, rules);
  if (!made.ok) throw new Error(made.reason);
  return made.snapshot;
}

describe("Fate dice and ladder", () => {
  it("reads exactly four random values for one roll", () => {
    const rng = countedRandom([MINUS, BLANK, PLUS, PLUS]);
    expect(rollFateFaces(rng.random)).toEqual([-1, 0, 1, 1]);
    expect(rng.calls()).toBe(4);
  });

  it("names −4…+8 and keeps totals beyond the ladder numeric", () => {
    expect([FATE_LADDER_MIN, FATE_LADDER_MAX]).toEqual([-4, 8]);
    expect(fateLadder(-4)).toEqual({ total: -4, rung: -4, beyond: null });
    expect(fateLadder(8)).toEqual({ total: 8, rung: 8, beyond: null });
    expect(fateLadder(-5)).toEqual({ total: -5, rung: null, beyond: "below" });
    expect(fateLadder(11)).toEqual({ total: 11, rung: null, beyond: "above" });
  });

  it("grades shifts as fail < 0, tie 0, success 1–2, style ≥ 3", () => {
    expect([-1, 0, 1, 2, 3, 6].map(total => gradeFateRoll(total, 0).outcome)).toEqual(["fail", "tie", "success", "success", "style", "style"]);
    expect(gradeFateRoll(2, 4)).toEqual({ shifts: -2, outcome: "fail" });
  });

  it("rejects faces that are not four Fate dice", () => {
    expect(() => toFateFaces([0, 0, 0])).toThrow(RangeError);
    expect(() => toFateFaces([2, 0, 0, 0])).toThrow(RangeError);
  });
});

describe("default roll options (tap to roll)", () => {
  it("overcome against +0 with no stunt, scale or gear preselected", () => {
    expect(defaultFateRollOptions()).toEqual({ action: "overcome", opposition: 0, stunts: [], advantage: "new", scale: null, weapon: 0, armor: 0 });
  });

  it("rolls a blank +0 card without any setup", () => {
    const snapshot = roll({});
    expect(resolveFateRoll(snapshot, standard)).toEqual({
      total: 0, ladder: { total: 0, rung: 0, beyond: null }, shifts: 0, outcome: "tie", offers: [{ id: "minorCost" }, { id: "failWithBoost" }],
    });
  });

  it("previews every dice result before rolling, stunt bonus included", () => {
    const preview = previewFateRoll(2, { opposition: 3, stunts: [{ stuntId: "s", bonus: 2 }] });
    expect(preview.map(p => [p.dice, p.total, p.outcome])).toEqual([
      [-4, 0, "fail"], [-3, 1, "fail"], [-2, 2, "fail"], [-1, 3, "tie"], [0, 4, "success"], [1, 5, "success"], [2, 6, "style"], [3, 7, "style"], [4, 8, "style"],
    ]);
  });
});

describe("outcomes by action", () => {
  it("overcome: style yields a boost; fail offers failure or major cost", () => {
    expect(resolveFateRoll(roll({ opposition: -3 }), standard).offers).toEqual([{ id: "successWithBoost" }]);
    expect(resolveFateRoll(roll({ opposition: 1 }), standard).offers).toEqual([{ id: "fail" }, { id: "majorCost" }]);
  });

  it("create an advantage: new vs existing aspects", () => {
    const at = (opposition: number, advantage: FateRollOptions["advantage"]) =>
      resolveFateRoll(roll({ action: "createAdvantage", opposition, advantage }), standard).offers;
    expect(at(-1, "new")).toEqual([{ id: "freeInvokes", freeInvokes: 1, newAspect: true }]);
    expect(at(-3, "new")).toEqual([{ id: "freeInvokes", freeInvokes: 2, newAspect: true }]);
    expect(at(0, "new")).toEqual([{ id: "boost" }]);
    expect(at(1, "new")).toEqual([{ id: "noAspect" }, { id: "enemyFreeInvoke" }]);
    expect(at(0, "known")).toEqual([{ id: "freeInvokes", freeInvokes: 1 }]);
    expect(at(0, "unknown")).toEqual([{ id: "boost" }]);
    expect(at(-1, "unknown")).toEqual([{ id: "freeInvokes", freeInvokes: 1, reveal: true }]);
    expect(at(1, "unknown")).toEqual([{ id: "enemyMayReveal" }]);
  });

  it("attack: tie boost; style may trade one shift for a boost", () => {
    expect(resolveFateRoll(roll({ action: "attack" }), standard).offers).toEqual([{ id: "boost" }]);
    expect(resolveFateRoll(roll({ action: "attack", opposition: -3 }), standard).offers).toEqual([{ id: "hit", shifts: 3 }, { id: "hitWithBoost", shifts: 2 }]);
    expect(resolveFateRoll(roll({ action: "attack", opposition: 1 }), standard).offers).toEqual([{ id: "fail" }]);
  });

  it("defend: failing takes the hit, style denies and earns a boost", () => {
    expect(resolveFateRoll(roll({ action: "defend", opposition: 2 }), standard).offers).toEqual([{ id: "takeHit", shifts: 2 }]);
    expect(resolveFateRoll(roll({ action: "defend", opposition: -3 }), standard).offers).toEqual([{ id: "deny" }, { id: "boost" }]);
  });
});

describe("weapon and armor ratings", () => {
  it("weapon adds hit shifts, not attack total, and damages on a tie", () => {
    const tie = roll({ action: "attack", weapon: 2 }, [0, 0, 0, 0], 0, gear);
    const result = resolveFateRoll(tie, gear);
    expect(result.total).toBe(0);
    expect(result.offers).toEqual([{ id: "hit", shifts: 2 }]);
    expect(resolveFateRoll(roll({ action: "attack", weapon: 2, opposition: -1 }, undefined, 0, gear), gear).offers).toEqual([{ id: "hit", shifts: 3 }]);
  });

  it("armor subtracts after the hit; reduced to zero it yields a boost", () => {
    expect(fateHitShifts(2, 0, 2, gear.ratings)).toEqual({ kind: "armorBoost" });
    expect(fateHitShifts(3, 1, 2, gear.ratings)).toEqual({ kind: "hit", shifts: 2 });
    expect(fateHitShifts(-1, 4, 0, gear.ratings)).toEqual({ kind: "miss" });
  });

  it("refuses ratings when the option is off or out of the 0–4 range", () => {
    const make = (options: Partial<FateRollOptions>, rules = standard) => createFateRoll({
      rootRollId: "r", characterId: "c", rating: 0, faces: toFateFaces([0, 0, 0, 0]), visibility: "all", options: { ...defaultFateRollOptions(), ...options },
    }, rules);
    expect(make({ weapon: 2 })).toEqual({ ok: false, reason: "ratingsDisabled" });
    expect(make({ weapon: 5 }, gear)).toEqual({ ok: false, reason: "ratingOutOfRange" });
  });
});

describe("scale: exactly one mode for the higher side", () => {
  const scaled = (modeId: string, selfTier = "supernatural", otherTier = "mundane", action: FateRollOptions["action"] = "overcome") =>
    createFateRoll({
      rootRollId: "r", characterId: "c", rating: 0, faces: toFateFaces([0, 0, 0, 0]), visibility: "all",
      options: { ...defaultFateRollOptions(), action, opposition: 1, scale: { selfTier, otherTier, modeId } },
    }, gear);

  it("adds +1 per tier before the roll", () => {
    const made = scaled("beforeRoll", "otherworldly", "mundane");
    expect(made.ok && resolveFateRoll(made.snapshot, gear).total).toBe(2);
  });

  it("refuses the lower side and a second mode", () => {
    expect(scaled("beforeRoll", "mundane", "supernatural")).toEqual({ ok: false, reason: "notHigher" });
    const made = scaled("beforeRoll");
    if (!made.ok) throw new Error(made.reason);
    expect(applyFateScaleAfterRoll(made.snapshot, { selfTier: "supernatural", otherTier: "mundane", modeId: "afterSuccess" }, gear))
      .toEqual({ ok: false, reason: "scaleAlreadyApplied" });
  });

  it("adds +2 per tier after the roll only on success", () => {
    expect(scaled("afterSuccess")).toEqual({ ok: false, reason: "scaleNotApplicable" });
    const failing = roll({ opposition: 1 }, [0, 0, 0, 0], 0, gear);
    expect(applyFateScaleAfterRoll(failing, { selfTier: "supernatural", otherTier: "mundane", modeId: "afterSuccess" }, gear))
      .toEqual({ ok: false, reason: "notSuccessful" });
    const winning = roll({ opposition: -1 }, [0, 0, 0, 0], 0, gear);
    const after = applyFateScaleAfterRoll(winning, { selfTier: "otherworldly", otherTier: "mundane", modeId: "afterSuccess" }, gear);
    expect(after.ok && resolveFateRoll(after.snapshot, gear).total).toBe(4);
  });

  it("gives extra free invokes only on a successful create an advantage", () => {
    expect(scaled("freeInvokes")).toEqual({ ok: false, reason: "scaleNotApplicable" });
    const advantage = roll({ action: "createAdvantage", opposition: -1 }, [0, 0, 0, 0], 0, gear);
    const after = applyFateScaleAfterRoll(advantage, { selfTier: "godlike", otherTier: "mundane", modeId: "freeInvokes" }, gear);
    expect(after.ok && resolveFateRoll(after.snapshot, gear).offers).toEqual([{ id: "freeInvokes", freeInvokes: 5, newAspect: true }]);
    expect(after.ok && resolveFateRoll(after.snapshot, gear).total).toBe(0);
  });

  it("is refused while scale is off", () => {
    const made = createFateRoll({
      rootRollId: "r", characterId: "c", rating: 0, faces: toFateFaces([0, 0, 0, 0]), visibility: "all",
      options: { ...defaultFateRollOptions(), scale: { selfTier: "godlike", otherTier: "mundane", modeId: "beforeRoll" } },
    }, standard);
    expect(made).toEqual({ ok: false, reason: "scaleDisabled" });
  });
});
