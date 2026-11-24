import { executeRollExpression } from "@skald/dice";
import { expect, it } from "vitest";
import { toToastDiceRoll } from "./roll-result-format";

it("keeps the flat faces of a Fate skill check in roll order", () => {
  const randoms = [0.9, 0.1, 0.5, 0.9];
  const result = executeRollExpression(
    "fate:4dF+{{@skill}}>={{@target}}",
    { skill: 3, target: 2 },
    { random: () => randoms.shift()! },
  );
  expect(result?.rolls).toEqual([1, -1, 0, 1]);
  const payload = toToastDiceRoll({ ...result!, successLevel: "success" }, "Athletics", null, null, undefined, undefined, "Check", "gm");
  expect(JSON.parse(JSON.stringify(payload))).toMatchObject({
    type: "skill_check", roll: 4, targetValue: 2, visibility: "gm",
    faces: { kind: "fate", values: [1, -1, 0, 1] },
  });
});

it("serializes a CoC percentile payload without adding flat faces", () => {
  const payload = toToastDiceRoll({
    expression: "coc7:1d100<=55", rolled: 24, rolls: [20, 4], targetValue: 55,
    successLevel: "hard", bonusDice: 0, unitsDice: [4], tensDice: [20],
    selectedUnits: 4, selectedTens: 20,
  }, "Spot Hidden", "u", "Keeper", undefined, undefined, "Check", "all");
  expect(JSON.stringify(payload)).toBe(JSON.stringify({
    id: payload.id, timestamp: payload.timestamp, rollerId: "u", rollerName: "Keeper",
    visibility: "all", type: "skill_check", skillName: "Spot Hidden", targetValue: 55,
    roll: 24, successLevel: "hard", bonusDice: 0, unitsDice: [4], tensDice: [20],
    selectedUnits: 4, selectedTens: 20,
  }));
});

it("adds no faces to a non-Fate flat skill check", () => {
  const randoms = [0.5, 0.9];
  const result = executeRollExpression("2d20kh1+{{@skill}}>={{@target}}", { skill: 3, target: 12 }, {
    random: () => randoms.shift()!,
  });
  expect(result).toBeTruthy();
  const payload = toToastDiceRoll({ ...result!, successLevel: "success" }, "Athletics", null, null, undefined, undefined, "Check", "all");
  expect(payload).not.toHaveProperty("faces");
});
