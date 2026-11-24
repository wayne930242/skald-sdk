import type { Die } from "./types";

export const MAX_DICE_COUNT = 1000;
export const MAX_EXPRESSION_LENGTH = 4096;

export function isValidDie(die: Die): boolean {
  return Number.isSafeInteger(die.count) && die.count > 0 && die.count <= MAX_DICE_COUNT &&
    (die.sides === "F" || (Number.isSafeInteger(die.sides) && die.sides > 0 &&
      Number.isSafeInteger(die.sides * (die.count + 100))));
}
