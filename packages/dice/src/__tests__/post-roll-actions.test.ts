import { describe, it, expect } from "vitest";
import {
  evaluatePostRollActions,
  findPostRollActions,
  resolveRollRuleId,
  shouldAutoImprove,
  decideAutoImprove,
  type PostRollAction,
  type PostRollState,
} from "../post-roll-actions";
import type { RollRulesDefinition } from "../dsl-roll-evaluator";

/** The CoC 7e declaration, as it appears in dsl-roll-rules.json */
const COC_ACTIONS: PostRollAction[] = [
  { id: "push", kind: "reroll", when: ["failure"], once: true, notFor: ["san", "luck", "luck_track"] },
  {
    id: "spendLuck",
    kind: "spend",
    resource: "luck.current",
    fallback: "luck.value",
    cost: "toThreshold",
    ladder: ["fumble", "failure", "regular", "hard", "extreme", "critical"],
    levels: [
      { id: "regular", threshold: "{{@target}}" },
      { id: "hard", threshold: "{{@target /floor 2}}" },
      { id: "extreme", threshold: "{{@target /floor 5}}" },
    ],
    notFrom: ["fumble"],
    notAfter: ["push"],
    notFor: ["san", "luck", "luck_track"],
  },
  {
    id: "autoImprove",
    kind: "improve",
    levels: ["regular", "hard", "extreme", "critical"],
    excludeBonus: true,
    excludePushed: true,
  },
];

function state(overrides: Partial<PostRollState> = {}): PostRollState {
  return {
    successLevel: "failure",
    rolled: 63,
    targetValue: 55,
    pushed: false,
    wasPushed: false,
    luckSpent: 0,
    resource: { value: 30, writable: true },
    ...overrides,
  };
}

describe("evaluatePostRollActions: push", () => {
  it("is available after an ordinary failure", () => {
    const result = evaluatePostRollActions(COC_ACTIONS, state());
    expect(result.push).toMatchObject({ available: true });
  });

  it.each(["regular", "hard", "extreme", "critical"])(
    "is not available after a %s success",
    (successLevel) => {
      const result = evaluatePostRollActions(COC_ACTIONS, state({ successLevel }));
      expect(result.push).toMatchObject({ available: false, reason: "not-failed" });
    },
  );

  it("is not available after a fumble (the rulebook: a fumble cannot be pushed)", () => {
    const result = evaluatePostRollActions(
      COC_ACTIONS,
      state({ successLevel: "fumble", rolled: 100 }),
    );
    expect(result.push).toMatchObject({ available: false, reason: "not-failed" });
  });

  it("is available at most once: not on a pushed roll, not on a roll already pushed", () => {
    expect(evaluatePostRollActions(COC_ACTIONS, state({ pushed: true })).push).toMatchObject({
      available: false,
      reason: "already-pushed",
    });
    expect(evaluatePostRollActions(COC_ACTIONS, state({ wasPushed: true })).push).toMatchObject({
      available: false,
      reason: "already-pushed",
    });
  });

  it.each(["san", "luck", "luck_track"])("is not available for a %s roll", (rollKey) => {
    expect(evaluatePostRollActions(COC_ACTIONS, state({ rollKey })).push).toMatchObject({
      available: false,
      reason: "excluded",
    });
  });

  it("is not available for a roll without a target (a plain dice roll)", () => {
    const result = evaluatePostRollActions(COC_ACTIONS, state({ targetValue: undefined }));
    expect(result.push).toMatchObject({ available: false, reason: "no-target" });
  });

  it("is absent when the system declares no push", () => {
    expect(evaluatePostRollActions([], state()).push).toBeNull();
    expect(evaluatePostRollActions(undefined, state()).push).toBeNull();
  });
});

describe("evaluatePostRollActions: spend Luck", () => {
  it("prices each level above the current one as rolled value minus its threshold", () => {
    const result = evaluatePostRollActions(COC_ACTIONS, state({ rolled: 63, targetValue: 55 }));
    expect(result.spend?.options).toEqual([
      { level: "regular", threshold: 55, cost: 8, affordable: true },
      { level: "hard", threshold: 27, cost: 36, affordable: false },
      { level: "extreme", threshold: 11, cost: 52, affordable: false },
    ]);
    expect(result.spend).toMatchObject({ available: true, resource: "luck.current" });
  });

  it("floors the hard and extreme thresholds", () => {
    const result = evaluatePostRollActions(
      COC_ACTIONS,
      state({ rolled: 60, targetValue: 55, resource: { value: 99, writable: true } }),
    );
    expect(result.spend?.options.map((o) => [o.level, o.threshold, o.cost])).toEqual([
      ["regular", 55, 5],
      ["hard", 27, 33],
      ["extreme", 11, 49],
    ]);
  });

  it("only offers levels above the current one", () => {
    const result = evaluatePostRollActions(
      COC_ACTIONS,
      state({ successLevel: "regular", rolled: 40, targetValue: 55, resource: { value: 99, writable: true } }),
    );
    expect(result.spend?.options.map((o) => o.level)).toEqual(["hard", "extreme"]);
  });

  it("offers nothing from a critical success", () => {
    const result = evaluatePostRollActions(
      COC_ACTIONS,
      state({ successLevel: "critical", rolled: 1 }),
    );
    expect(result.spend).toMatchObject({ available: false, reason: "nothing-to-buy", options: [] });
  });

  it("offers nothing from a fumble", () => {
    const result = evaluatePostRollActions(
      COC_ACTIONS,
      state({ successLevel: "fumble", rolled: 100, resource: { value: 99, writable: true } }),
    );
    expect(result.spend).toMatchObject({ available: false, reason: "nothing-to-buy" });
  });

  it("drops a level whose threshold is below 1 (extreme of a skill under 5)", () => {
    const result = evaluatePostRollActions(
      COC_ACTIONS,
      state({ rolled: 30, targetValue: 4, resource: { value: 99, writable: true } }),
    );
    expect(result.spend?.options.map((o) => o.level)).toEqual(["regular", "hard"]);
  });

  it("is blocked, and says why, when Luck is too low for even the cheapest level", () => {
    const result = evaluatePostRollActions(
      COC_ACTIONS,
      state({ rolled: 63, targetValue: 55, resource: { value: 5, writable: true } }),
    );
    expect(result.spend).toMatchObject({
      available: false,
      reason: "too-low",
      cheapest: { level: "regular", cost: 8 },
    });
    expect(result.spend?.options.every((o) => !o.affordable)).toBe(true);
  });

  it("is available when Luck exactly covers the cost", () => {
    const result = evaluatePostRollActions(
      COC_ACTIONS,
      state({ rolled: 63, targetValue: 55, resource: { value: 8, writable: true } }),
    );
    expect(result.spend?.available).toBe(true);
    expect(result.spend?.options[0]).toMatchObject({ level: "regular", affordable: true });
  });

  it("is blocked when the sheet cannot be written (not the owner's editable sheet)", () => {
    const result = evaluatePostRollActions(
      COC_ACTIONS,
      state({ resource: { value: 30, writable: false } }),
    );
    expect(result.spend).toMatchObject({ available: false, reason: "not-writable" });
  });

  it("is blocked when the resource cannot be read", () => {
    const result = evaluatePostRollActions(COC_ACTIONS, state({ resource: undefined }));
    expect(result.spend).toMatchObject({ available: false, reason: "not-writable" });
  });

  it("is not allowed after a push, on the pushed roll or on the one that was pushed", () => {
    expect(evaluatePostRollActions(COC_ACTIONS, state({ pushed: true })).spend).toMatchObject({
      available: false,
      reason: "after-push",
    });
    expect(evaluatePostRollActions(COC_ACTIONS, state({ wasPushed: true })).spend).toMatchObject({
      available: false,
      reason: "after-push",
    });
  });

  it.each(["san", "luck", "luck_track"])("is not allowed for a %s roll", (rollKey) => {
    expect(evaluatePostRollActions(COC_ACTIONS, state({ rollKey })).spend).toMatchObject({
      available: false,
      reason: "excluded",
    });
  });

  it("counts Luck already spent on this roll: the effective roll is rolled minus spent", () => {
    // 63 rolled, 8 spent → effective 55, regular; the next level up (hard, 27) costs 28
    const result = evaluatePostRollActions(
      COC_ACTIONS,
      state({
        successLevel: "regular",
        rolled: 63,
        luckSpent: 8,
        targetValue: 55,
        resource: { value: 99, writable: true },
      }),
    );
    expect(result.spend?.options.map((o) => [o.level, o.cost])).toEqual([
      ["hard", 28],
      ["extreme", 44],
    ]);
  });

  it("at a declared Hard difficulty buys only Hard or better (Regular is still a failure)", () => {
    // 63 on 55, Hard: regular 55 would not pass; hard ≤27 costs 36, extreme ≤11 costs 52
    const result = evaluatePostRollActions(
      COC_ACTIONS,
      state({ difficulty: "hard", resource: { value: 60, writable: true } }),
    );
    expect(result.spend?.options.map((o) => [o.level, o.cost])).toEqual([
      ["hard", 36],
      ["extreme", 52],
    ]);
  });

  it("at a declared Extreme difficulty buys only Extreme", () => {
    const result = evaluatePostRollActions(
      COC_ACTIONS,
      state({ difficulty: "extreme", resource: { value: 60, writable: true } }),
    );
    expect(result.spend?.options.map((o) => o.level)).toEqual(["extreme"]);
  });

  it("is absent when the system declares no Luck spending", () => {
    expect(evaluatePostRollActions([COC_ACTIONS[0]], state()).spend).toBeNull();
  });
});

describe("shouldAutoImprove: the decision table", () => {
  const tick = (overrides: Partial<Parameters<typeof shouldAutoImprove>[1]>) =>
    shouldAutoImprove(COC_ACTIONS, {
      successLevel: "regular",
      bonusDice: undefined,
      pushed: false,
      ...overrides,
    });

  it.each([
    ["critical", true],
    ["extreme", true],
    ["hard", true],
    ["regular", true],
    ["failure", false],
    ["fumble", false],
  ])("level %s without bonus die: %s", (successLevel, expected) => {
    expect(tick({ successLevel })).toBe(expected);
  });

  it.each([1, 2])("never with %i bonus die", (bonusDice) => {
    for (const level of ["critical", "extreme", "hard", "regular"]) {
      expect(tick({ successLevel: level, bonusDice })).toBe(false);
    }
  });

  it.each([-1, -2])("still ticks with %i penalty die: a harder success is an earned one", (bonusDice) => {
    expect(tick({ successLevel: "hard", bonusDice })).toBe(true);
  });

  it("treats bonusDice 0 and undefined alike", () => {
    expect(tick({ bonusDice: 0 })).toBe(true);
    expect(tick({ bonusDice: undefined })).toBe(true);
  });

  it("never on a pushed roll, whatever the level", () => {
    for (const level of ["critical", "extreme", "hard", "regular"]) {
      expect(tick({ successLevel: level, pushed: true })).toBe(false);
    }
  });

  it("never for an excluded roll", () => {
    const withExclusion: PostRollAction[] = [
      { id: "autoImprove", kind: "improve", levels: ["regular"], excludeBonus: true, excludePushed: true, notFor: ["luck"] },
    ];
    expect(
      shouldAutoImprove(withExclusion, { successLevel: "regular", pushed: false, rollKey: "luck" }),
    ).toBe(false);
    expect(
      shouldAutoImprove(withExclusion, { successLevel: "regular", pushed: false, rollKey: "spot_hidden" }),
    ).toBe(true);
  });

  it("never ticks a blind (gm) roll, and says it was withheld rather than not earned", () => {
    const base = { successLevel: "regular", pushed: false } as const;
    expect(shouldAutoImprove(COC_ACTIONS, { ...base, visibility: "gm" })).toBe(false);
    expect(decideAutoImprove(COC_ACTIONS, { ...base, visibility: "gm" })).toBe("withheld-blind");
    expect(decideAutoImprove(COC_ACTIONS, { ...base, visibility: "all" })).toBe("tick");
    expect(decideAutoImprove(COC_ACTIONS, base)).toBe("tick");
  });

  it("a blind roll that would not have ticked anyway is simply none", () => {
    const blind = { visibility: "gm", pushed: false } as const;
    expect(decideAutoImprove(COC_ACTIONS, { ...blind, successLevel: "failure" })).toBe("none");
    expect(decideAutoImprove(COC_ACTIONS, { ...blind, successLevel: "hard", bonusDice: 1 })).toBe("none");
    expect(decideAutoImprove(COC_ACTIONS, { ...blind, successLevel: "hard", pushed: true })).toBe("none");
    const excluded: PostRollAction[] = [
      { id: "autoImprove", kind: "improve", levels: ["regular"], notFor: ["luck"] },
    ];
    expect(decideAutoImprove(excluded, { ...blind, successLevel: "regular", rollKey: "luck" })).toBe("none");
    expect(decideAutoImprove([], { ...blind, successLevel: "regular" })).toBe("none");
  });

  it("is false when the system declares no auto-improve", () => {
    expect(shouldAutoImprove([], { successLevel: "regular", pushed: false })).toBe(false);
    expect(shouldAutoImprove(undefined, { successLevel: "regular", pushed: false })).toBe(false);
  });
});

describe("notFor prefix patterns", () => {
  const push: PostRollAction[] = [
    { id: "push", kind: "reroll", when: ["failure"], once: true, notFor: ["dodge", "fighting:*"] },
  ];
  it("excludes every key under a `prefix*` pattern and exact keys alike", () => {
    expect(evaluatePostRollActions(push, state({ rollKey: "fighting:brawl" })).push).toMatchObject({ available: false });
    expect(evaluatePostRollActions(push, state({ rollKey: "dodge" })).push).toMatchObject({ available: false });
    expect(evaluatePostRollActions(push, state({ rollKey: "spot_hidden" })).push).toMatchObject({ available: true });
    expect(evaluatePostRollActions(push, state({ rollKey: "fightingx" })).push).toMatchObject({ available: true });
  });
});

describe("notFor group patterns (`group:*` covers the group's blank slots too)", () => {
  const pushIn = (rollKey: string) =>
    evaluatePostRollActions(
      [
        {
          id: "push",
          kind: "reroll",
          when: ["failure"],
          once: true,
          notFor: ["dodge", "fighting:*", "firearms:*", "weapon:*"],
        },
      ],
      state({ rollKey }),
    ).push;

  it.each([
    "fighting[1]",
    "fighting[12]",
    "fighting",
    "fighting:brawl",
    "firearms[2]",
    "firearms",
    "firearms:handgun",
    "weapon:1",
    "weapon[1]",
  ])("excludes the combat roll %s", (rollKey) => {
    expect(pushIn(rollKey)).toMatchObject({ available: false, reason: "excluded" });
  });

  it.each(["science[1]", "language[2]", "art_craft[1]", "science:biology", "fightingx", "fighting_stance[1]", "firearmsx"])(
    "still allows push on %s",
    (rollKey) => {
      expect(pushIn(rollKey)).toMatchObject({ available: true });
    },
  );

  it("does not widen a plain prefix pattern that is not a group (`luck*` stays a prefix)", () => {
    const push: PostRollAction[] = [{ id: "push", kind: "reroll", when: ["failure"], once: true, notFor: ["lu*"] }];
    expect(evaluatePostRollActions(push, state({ rollKey: "luck_track" })).push).toMatchObject({ available: false });
    expect(evaluatePostRollActions(push, state({ rollKey: "lu[1]" })).push).toMatchObject({ available: false });
  });
});

describe("rule lookup", () => {
  const rules: RollRulesDefinition = {
    default: "coc7",
    rules: {
      coc7: {
        type: "roll-under",
        dice: "1d100",
        successLevels: [{ id: "failure", label: "失敗", condition: "{{@rolled > @target}}" }],
        postRollActions: COC_ACTIONS,
      },
      fate: { type: "roll-over", dice: "4dF", successLevels: [{ id: "tie", label: "平手", condition: "{{@total == @target}}" }] },
    },
  };

  it("resolves the rule id from the expression prefix, else the default", () => {
    expect(resolveRollRuleId("coc7:1d100<=50", rules)).toBe("coc7");
    expect(resolveRollRuleId("fate:4dF", rules)).toBe("fate");
    expect(resolveRollRuleId("1d100", rules)).toBe("coc7");
    expect(resolveRollRuleId("1d100", undefined)).toBeUndefined();
  });

  it("finds the declared actions, or none", () => {
    expect(findPostRollActions(rules, "coc7")).toBe(COC_ACTIONS);
    expect(findPostRollActions(rules, "fate")).toEqual([]);
    expect(findPostRollActions(rules, "missing")).toEqual([]);
    expect(findPostRollActions(undefined, "coc7")).toEqual([]);
  });
});
