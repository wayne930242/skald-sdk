import { describe, expect, it } from "bun:test";
import { buildRollRenderModelFromExpressionResult, executeRollExpression, readPool, type PoolKind } from "../index";

function play(kind: PoolKind, rating: number, faces: number[], extra?: number) {
  let i = 0;
  const expression = `pool:test:{{@rating}}d6${extra === undefined ? "" : "+{{@extra}}d6"}`;
  return executeRollExpression(expression, { rating, extra: extra ?? 0 }, {
    dslRollRules: { rules: { test: { type: "poolHighest", dice: "d6", kind } } },
    faces: { draw(sides) { expect(sides).toBe(6); return faces[i++]; } },
  });
}

describe("poolHighest", () => {
  for (const [kind, rating, faces, total, tier, stressDelta] of [
    ["action", 0, [6, 6], 6, "full", undefined],
    ["fortune", -1, [6, 2], 2, "bad", undefined],
    ["engagement", 1, [3], 3, "bad", undefined],
    ["fortune", 2, [1, 4], 4, "partial", undefined],
    ["action", 4, [2, 6, 5, 1], 6, "full", undefined],
    ["engagement", 6, [3, 6, 6, 1, 2, 6], 6, "critical", undefined],
    ["resistance", 0, [6, 3], 3, "bad", 3],
    ["resistance", 1, [5], 5, "partial", 1],
    ["resistance", 2, [1, 6], 6, "full", 0],
    ["resistance", 2, [6, 6], 6, "critical", -1],
    ["indulgeVice", 2, [2, 5], 5, "partial", -5],
  ] as const) {
    it(`${kind} ${rating}d ${faces}: ${tier}`, () => {
      const result = play(kind, rating, [...faces]);
      expect(result).toMatchObject({ rolls: faces, rolled: total, successLevel: `pool-${tier}`, pool: { kind, rating, tier } });
      expect(result?.pool?.stressDelta).toBe(stressDelta);
    });
  }

  it("retains each threat die in draw order, including ties; multiple sixes award one Edge", () => {
    const result = play("threat", 2, [6, 4, 6, 2], 2)!;
    expect(result).toMatchObject({ resolvedDiceExpr: "4d6", rolled: 6, pool: { extraThreats: 2, tier: "full", edge: true } });
    expect(buildRollRenderModelFromExpressionResult(result).diceGroups).toEqual([
      { id: "dice", label: "dice", values: [6, 4, 6, 2], selectedIndices: [0, 2] },
    ]);
    expect(play("threat", 0, [6, 6])?.pool?.edge).toBeUndefined();
  });

  it("refuses an unsupported rule, mixed dice, out-of-range counts and invalid stored faces", () => {
    expect(executeRollExpression("pool:nope:3d6", {})).toBeNull();
    expect(play("action", 1, [], 1)).toBeNull();
    expect(play("threat", 999, [], 2)).toBeNull();
    expect(readPool({ kind: "action", rating: 1, extraThreats: 0 }, [7], 7)).toBeUndefined();
    expect(readPool({ kind: "action", rating: 0, extraThreats: 0 }, [1, 6], 6)).toBeUndefined();
    expect(executeRollExpression("2d6", {}, { dslRollRules: { default: "act", rules: { act: { type: "poolHighest", dice: "d6", kind: "action" } } }, faces: { draw: () => 6 } })).toMatchObject({ rolled: 12 });
  });
});
