import type {
  Die,
  DieRollResult,
  DiceRollResult,
  SkillCheckRoll,
  SingleRoll,
  DiceModifiers,
} from "./types";
import { parseDiceExpression } from "./parser";
import { calculateSuccessLevel } from "./check";
import { isValidDie, MAX_DICE_COUNT } from "./limits";
import { markKeptRolls } from "./kept-rolls";

/**
 * A source of uniform numbers in [0, 1), as `Math.random` gives them. Every
 * die of a roll reads it; a caller that needs reproducible dice (a seeded
 * test run) passes its own instead of `Math.random`.
 */
export type RandomSource = () => number;

/**
 * Roll a single die (returns the value)
 */
function rollSingleDie(sides: number | "F", random: RandomSource = Math.random): number {
  if (sides === "F") {
    // Fudge die: -1, 0, or +1
    return Math.floor(random() * 3) - 1;
  }
  // Standard die: 1 to sides (inclusive)
  return Math.floor(random() * sides) + 1;
}

/**
 * Check if a roll should explode
 */
function shouldExplode(
  value: number,
  sides: number | "F",
  modifiers: DiceModifiers
): boolean {
  if (sides === "F") return false; // Fudge dice don't explode
  const explodeOn = modifiers.explodeOn ?? sides; // Default: explode on max
  return value >= explodeOn;
}

/**
 * Roll a single die specification with modifiers
 */
export function rollDice(die: Die, random: RandomSource = Math.random): DieRollResult {
  if (!isValidDie(die)) throw new RangeError("Invalid dice specification or dice limit exceeded");
  const mods = die.modifiers || {};
  const detailedRolls: SingleRoll[] = [];

  // Roll base dice
  for (let i = 0; i < die.count; i++) {
    const value = rollSingleDie(die.sides, random);
    detailedRolls.push({ value, kept: true, exploded: false });
  }

  // Handle exploding/compounding/penetrating dice
  if (
    (mods.exploding || mods.compounding || mods.penetrating) &&
    die.sides !== "F"
  ) {
    const maxExplosions = 100; // Prevent infinite loops
    let explosionCount = 0;

    for (let i = 0; i < detailedRolls.length && explosionCount < maxExplosions; i++) {
      const roll = detailedRolls[i];
      if (shouldExplode(roll.value, die.sides, mods)) {
        roll.exploded = true;

        if (mods.compounding) {
          // Compounding: keep rolling and add to same roll
          let additionalValue = 0;
          let newRoll = rollSingleDie(die.sides, random);
          additionalValue += newRoll;
          explosionCount++;

          while (
            shouldExplode(newRoll, die.sides, mods) &&
            explosionCount < maxExplosions
          ) {
            newRoll = rollSingleDie(die.sides, random);
            additionalValue += newRoll;
            explosionCount++;
          }
          roll.value += additionalValue;
        } else {
          // Exploding or Penetrating: add new dice
          let newValue = rollSingleDie(die.sides, random);
          if (mods.penetrating) {
            newValue = Math.max(1, newValue - 1); // Penetrating: -1 on rerolls
          }
          detailedRolls.push({ value: newValue, kept: true, exploded: false });
          explosionCount++;
        }
      }
    }
  }

  // Apply keep/drop modifiers
  markKeptRolls(detailedRolls, mods);

  // Calculate subtotal from kept rolls only
  const subtotal = detailedRolls
    .filter((r) => r.kept)
    .reduce((sum, r) => sum + r.value, 0);

  // For backward compatibility, also provide flat rolls array
  const rolls = detailedRolls.map((r) => r.value);

  return {
    die,
    rolls,
    detailedRolls,
    subtotal,
  };
}

/**
 * Parse and roll a dice expression
 * Returns null if expression is invalid
 */
export function rollDiceExpression(
  expr: string,
  random: RandomSource = Math.random,
): DiceRollResult | null {
  const parsed = parseDiceExpression(expr);
  if (!parsed) return null;

  const diceResults: DieRollResult[] = [];
  let total = 0;

  for (const die of parsed.dice) {
    const result = rollDice(die, random);
    diceResults.push(result);
    total += (die.sign === -1 ? -1 : 1) * result.subtotal;
  }

  // Apply modifier
  total += parsed.modifier;

  // Apply multiplier
  total *= parsed.multiplier;

  return {
    expression: expr,
    dice: diceResults,
    modifier: parsed.modifier,
    total,
    timestamp: new Date(),
  };
}

/**
 * Roll D100 (percentile dice)
 */
export function rollD100(random: RandomSource = Math.random): number {
  return rollSingleDie(100, random);
}

/**
 * Roll a tens die (0, 10, 20, ..., 90)
 */
function rollTensDie(random: RandomSource): number {
  return (rollSingleDie(10, random) - 1) * 10;
}

/**
 * Roll a units die (0-9)
 */
function rollUnitsDie(random: RandomSource): number {
  return rollSingleDie(10, random) - 1;
}

/** Input for CoC 7e skill check */
export interface SkillCheckInput {
  skillName: string;
  targetValue: number;
  bonusDice?: number; // Positive = bonus, negative = penalty
}

/**
 * Roll a CoC 7e skill check with optional bonus/penalty dice
 *
 * Bonus dice: Roll extra tens dice, keep the lowest (better chance of success)
 * Penalty dice: Roll extra tens dice, keep the highest (worse chance)
 */
export function rollCoC7eSkillCheck(
  input: SkillCheckInput,
  random: RandomSource = Math.random,
): Omit<
  SkillCheckRoll,
  "id" | "timestamp" | "rollerId" | "rollerName" | "visibility"
> {
  const { skillName, targetValue, bonusDice = 0 } = input;
  if (!Number.isSafeInteger(bonusDice) || Math.abs(bonusDice) >= MAX_DICE_COUNT) {
    throw new RangeError("Invalid bonus dice or dice limit exceeded");
  }

  // Roll units die (always 1)
  const unitsDice = [rollUnitsDie(random)];
  const selectedUnits = unitsDice[0];

  // Roll tens dice (1 base + abs(bonusDice))
  const tensDiceCount = 1 + Math.abs(bonusDice);
  const tensDice: number[] = [];
  for (let i = 0; i < tensDiceCount; i++) {
    tensDice.push(rollTensDie(random));
  }

  // Select the best/worst tens die based on bonus/penalty
  let selectedTens: number;
  if (bonusDice > 0) {
    // Bonus: pick lowest tens (better for success)
    selectedTens = Math.min(...tensDice);
  } else if (bonusDice < 0) {
    // Penalty: pick highest tens (worse for success)
    selectedTens = Math.max(...tensDice);
  } else {
    // No bonus/penalty
    selectedTens = tensDice[0];
  }

  // Combine to get final roll
  // Handle special case: 00 + 0 = 100, not 0
  let roll = selectedTens + selectedUnits;
  if (roll === 0) {
    roll = 100;
  }

  const successLevel = calculateSuccessLevel(roll, targetValue);

  return {
    type: "skill_check",
    skillName,
    targetValue,
    roll,
    successLevel,
    bonusDice: bonusDice || undefined,
    unitsDice,
    tensDice,
    selectedUnits,
    selectedTens,
  };
}
