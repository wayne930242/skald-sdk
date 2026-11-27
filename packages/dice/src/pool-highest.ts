import type { PostRollAction } from "./post-roll-actions";
import { MAX_DICE_COUNT } from "./limits";
import { rollDice, type DiceSource } from "./roller";
import type { RollExpressionResult } from "./roll-expression/types";

export const POOL_KINDS = ["action", "fortune", "resistance", "engagement", "indulgeVice", "threat"] as const;
export type PoolKind = (typeof POOL_KINDS)[number];
export type PoolTier = "critical" | "full" | "partial" | "bad";

export interface PoolHighestRule {
  type: "poolHighest";
  dice: "d6";
  kind: PoolKind;
  postRollActions?: PostRollAction[];
}

/** The two inputs beyond the faces, retained in dice_data for replay and threat assignment. */
export interface PoolInputs {
  kind: PoolKind;
  rating: number;
  extraThreats: number;
}

export interface PoolOutcome extends PoolInputs {
  tier: PoolTier;
  /** Positive marks stress, negative clears it. Absent for rolls that do not touch stress. */
  stressDelta?: number;
  edge?: true;
}

export function poolDiceCount({ rating, extraThreats }: PoolInputs): number {
  const size = rating + extraThreats;
  return size <= 0 ? 2 : size;
}

function validInputs(input: PoolInputs): boolean {
  return POOL_KINDS.includes(input.kind) && Number.isSafeInteger(input.rating) &&
    Math.abs(input.rating) <= MAX_DICE_COUNT && Number.isSafeInteger(input.extraThreats) &&
    input.extraThreats >= 0 && input.extraThreats <= MAX_DICE_COUNT &&
    (input.kind === "threat" || input.extraThreats === 0) && poolDiceCount(input) <= MAX_DICE_COUNT;
}

/** Grade the actual faces, never their sum. This also validates untrusted stored rows. */
export function gradePool(input: PoolInputs, faces: number[]) {
  if (!validInputs(input) || faces.length !== poolDiceCount(input) ||
    !faces.every((v) => Number.isInteger(v) && v >= 1 && v <= 6)) return null;
  const lowest = input.rating + input.extraThreats <= 0;
  const rolled = lowest ? Math.min(...faces) : Math.max(...faces);
  const doubleSix = !lowest && faces.filter((v) => v === 6).length >= 2;
  const tier: PoolTier = doubleSix && input.kind !== "threat" ? "critical" : rolled === 6 ? "full" : rolled >= 4 ? "partial" : "bad";
  const pool: PoolOutcome = {
    kind: input.kind, rating: input.rating, extraThreats: input.extraThreats, tier,
    ...(input.kind === "resistance" && { stressDelta: doubleSix ? -1 : 6 - rolled }),
    ...(input.kind === "indulgeVice" && { stressDelta: -rolled }),
    ...(input.kind === "threat" && doubleSix && { edge: true }),
  };
  return { rolled, rolls: faces, pool, successLevel: `pool-${tier}` };
}

export function rollPool(input: PoolInputs, source?: DiceSource) {
  if (!validInputs(input)) return null;
  const { rolls } = rollDice({ count: poolDiceCount(input), sides: 6 }, source);
  return gradePool(input, rolls);
}

/** Pool rows use physical notation for animation; no keep/drop or fake additive modifier. */
export function poolRowFields(result: RollExpressionResult) {
  if (!result.pool) return {};
  return { pool: result.pool, notation: `${result.rolls.length}d6`, successLevel: `pool-${result.pool.tier}` };
}

/** Ignore claimed tiers/costs; re-grade the bounded inputs and verify the stored total. */
export function readPool(raw: unknown, faces: number[], total: number): PoolOutcome | undefined {
  if (!raw || typeof raw !== "object" || !("kind" in raw) || !("rating" in raw) || !("extraThreats" in raw)) return;
  const kind = POOL_KINDS.find((k) => k === raw.kind);
  if (!kind || typeof raw.rating !== "number" || typeof raw.extraThreats !== "number") return;
  const result = gradePool({ kind, rating: raw.rating, extraThreats: raw.extraThreats }, faces);
  return result && result.rolled === total ? result.pool : undefined;
}

export function poolTierKey({ kind, tier }: PoolOutcome) {
  const ladder = kind === "indulgeVice" || kind === "resistance" ? "pips" : kind;
  return `${ladder}_${tier}` as const;
}

/** The first scoring face, or all sixes that contributed to a critical or Edge. */
export function poolSelected(pool: PoolOutcome, rolls: number[], total: number): number[] {
  return pool.tier === "critical" || pool.edge ? rolls.flatMap((v, i) => v === 6 ? [i] : []) : [rolls.indexOf(total)];
}
