import type {
  DiceRoll,
  RollExpressionResult,
  RollRenderModel,
  SuccessLevel,
} from "@skald/dice";
import {
  buildRollRenderModelFromDiceRoll,
  buildRollRenderModelFromExpressionResult,
} from "@skald/dice";

type ToastTranslator = (
  key: "coc7Breakdown" | "diceBreakdown",
  values: Record<string, string | number>,
) => string;

type SuccessTranslator = (level: SuccessLevel | string) => string;

export interface RollSummaryLines {
  headline: string;
  breakdown?: string;
}

export function toRollRenderModelFromDiceRoll(roll: DiceRoll): RollRenderModel {
  return buildRollRenderModelFromDiceRoll(roll);
}

export function toRollRenderModelFromExpressionResult(
  result: RollExpressionResult,
): RollRenderModel {
  return buildRollRenderModelFromExpressionResult(result);
}

export function formatRollSummaryLines(
  model: RollRenderModel,
  tToast: ToastTranslator,
  tSuccess: SuccessTranslator,
): RollSummaryLines {
  const headline =
    model.successLevel && model.target !== undefined
      ? `${model.total} / ${model.target} → ${tSuccess(model.successLevel)}`
      : `${model.total}`;

  const tensGroup = model.diceGroups.find((group) => group.label === "tens");
  const unitsGroup = model.diceGroups.find((group) => group.label === "units");
  if (tensGroup || unitsGroup) {
    return {
      headline,
      breakdown: tToast("coc7Breakdown", {
        tens: tensGroup?.values.join(", ") ?? "",
        units: unitsGroup?.values.join(", ") ?? "",
        selectedTotal: model.total,
      }),
    };
  }

  const diceGroup = model.diceGroups.find((group) => group.label === "dice");
  if (diceGroup?.values.length) {
    return {
      headline,
      breakdown: tToast("diceBreakdown", {
        rolls: diceGroup.values.join(", "),
      }),
    };
  }

  return { headline };
}
