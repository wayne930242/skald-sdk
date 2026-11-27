import type { DiceRoll, SuccessLevel } from "../types";
import type { RollExpressionResult } from "../roll-expression/types";

import { poolSelected, type PoolOutcome } from "../pool-highest";

export type RollRuleId =
  | "poolHighest"
  | "coc7-normal"
  | "coc7-bonus"
  | "coc7-penalty"
  | "compare"
  | "sum";

export interface RollRuleMeta {
  id: RollRuleId;
  comparator?: string;
  amount?: number;
}

export interface RollDieGroup {
  id: string;
  label: "tens" | "units" | "dice";
  values: number[];
  selected?: number;
  selectedIndices?: number[];
}

export interface RollRenderModel {
  kind: "skill_check" | "simple" | "opposed";
  expression?: string;
  total: number;
  target?: number;
  successLevel?: SuccessLevel | string;
  rule: RollRuleMeta;
  pool?: PoolOutcome;
  diceGroups: RollDieGroup[];
}

function parseRuleMeta(input: {
  bonusDice?: number;
  comparator?: string;
  hasCocDice: boolean;
}): RollRuleMeta {
  if (input.hasCocDice) {
    const amount = Math.abs(input.bonusDice ?? 0);
    if ((input.bonusDice ?? 0) > 0) return { id: "coc7-bonus", amount };
    if ((input.bonusDice ?? 0) < 0) return { id: "coc7-penalty", amount };
    return { id: "coc7-normal" };
  }
  if (input.comparator) return { id: "compare", comparator: input.comparator };
  return { id: "sum" };
}

function buildDieGroups(input: {
  rolls?: number[];
  tensDice?: number[];
  unitsDice?: number[];
  selectedTens?: number;
  selectedUnits?: number;
}): RollDieGroup[] {
  if ((input.tensDice?.length ?? 0) > 0 || (input.unitsDice?.length ?? 0) > 0) {
    const groups: RollDieGroup[] = [];
    if (input.tensDice?.length) {
      groups.push({
        id: "tens",
        label: "tens",
        values: input.tensDice,
        selected: input.selectedTens,
      });
    }
    if (input.unitsDice?.length) {
      groups.push({
        id: "units",
        label: "units",
        values: input.unitsDice,
        selected: input.selectedUnits,
      });
    }
    return groups;
  }

  if (input.rolls?.length) {
    return [{ id: "dice", label: "dice", values: input.rolls }];
  }

  return [];
}

function poolModel(pool: PoolOutcome, rolls: number[], total: number, expression: string): RollRenderModel {
  return {
    kind: "simple", expression, total, pool, rule: { id: "poolHighest" }, successLevel: `pool-${pool.tier}`,
    diceGroups: [{ id: "dice", label: "dice", values: rolls, selectedIndices: poolSelected(pool, rolls, total) }],
  };
}

export function buildRollRenderModelFromExpressionResult(
  result: RollExpressionResult,
): RollRenderModel {
  if (result.pool) return poolModel(result.pool, result.rolls, result.rolled, result.expression);
  const hasCocDice =
    (result.tensDice?.length ?? 0) > 0 || (result.unitsDice?.length ?? 0) > 0;

  return {
    kind: result.successLevel && result.targetValue !== undefined ? "skill_check" : "simple",
    expression: result.expression,
    total: result.rolled,
    target: result.targetValue,
    successLevel:
      typeof result.successLevel === "string"
        ? result.successLevel
        : result.successLevel?.id,
    rule: parseRuleMeta({
      bonusDice: result.bonusDice,
      comparator: result.comparator,
      hasCocDice,
    }),
    diceGroups: buildDieGroups({
      rolls: result.rolls,
      tensDice: result.tensDice,
      unitsDice: result.unitsDice,
      selectedTens: result.selectedTens,
      selectedUnits: result.selectedUnits,
    }),
  };
}

export function buildRollRenderModelFromDiceRoll(roll: DiceRoll): RollRenderModel {
  if (roll.type === "simple") {
    if (roll.pool) return poolModel(roll.pool, roll.rolls, roll.total, roll.notation);
    return {
      kind: "simple",
      expression: roll.notation,
      total: roll.total,
      rule: { id: "sum" },
      diceGroups: buildDieGroups({ rolls: roll.rolls }),
    };
  }

  if (roll.type === "opposed") {
    return {
      kind: "opposed",
      expression: "opposed",
      total: roll.attackerRoll.roll,
      target: roll.attackerRoll.targetValue,
      successLevel: roll.attackerRoll.successLevel,
      rule: parseRuleMeta({
        bonusDice: roll.attackerRoll.bonusDice,
        hasCocDice:
          (roll.attackerRoll.tensDice?.length ?? 0) > 0 ||
          (roll.attackerRoll.unitsDice?.length ?? 0) > 0,
      }),
      diceGroups: buildDieGroups({
        tensDice: roll.attackerRoll.tensDice,
        unitsDice: roll.attackerRoll.unitsDice,
        selectedTens: roll.attackerRoll.selectedTens,
        selectedUnits: roll.attackerRoll.selectedUnits,
      }),
    };
  }

  return {
    kind: "skill_check",
    expression:
      roll.bonusDice && roll.bonusDice !== 0
        ? `1d100${roll.bonusDice > 0 ? `b${roll.bonusDice}` : `p${Math.abs(roll.bonusDice)}`}`
        : "1d100",
    total: roll.roll,
    target: roll.targetValue,
    successLevel: roll.successLevel,
    rule: parseRuleMeta({
      bonusDice: roll.bonusDice,
      hasCocDice:
        (roll.tensDice?.length ?? 0) > 0 || (roll.unitsDice?.length ?? 0) > 0,
    }),
    diceGroups: buildDieGroups({
      tensDice: roll.tensDice,
      unitsDice: roll.unitsDice,
      selectedTens: roll.selectedTens,
      selectedUnits: roll.selectedUnits,
    }),
  };
}
