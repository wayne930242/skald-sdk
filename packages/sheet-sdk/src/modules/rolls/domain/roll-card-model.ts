// modules/rolls/domain/roll-card-model.ts
//
// What a chat roll card needs to know about a stored roll: which kind of card it
// is, the figures it shows and how blind it is. Pure, so every dice_data shape
// the web and the Discord bot have written can be tested without rendering.
import { isFateRoll, isPbtaTier, keptRollFlags, type DiceRoll } from "@skald/dice";

export type RollCardVariant = "percentile" | "tier" | "fate" | "check" | "plain" | "pool" | "opposed";

export const BWB_TIERS = [
  { id: "bwb-extraordinary" }, { id: "bwb-strong" }, { id: "bwb-weak" }, { id: "bwb-miss" },
] as const;

export function isBwbTier(level: string | undefined) {
  return BWB_TIERS.some((tier) => tier.id === level);
}

const COC_LEVELS = new Set(["critical", "extreme", "hard", "regular", "failure", "fumble"]);

type SkillCheck = Extract<DiceRoll, { type: "skill_check" }>;
type SimpleRoll = Extract<DiceRoll, { type: "simple" }>;

export function rollCardVariant(roll: DiceRoll): RollCardVariant {
  switch (roll.type) {
    case "opposed":
      return "opposed";
    case "skill_check":
      if (roll.checkDisplay) return "check";
      return roll.tensDice?.length || roll.unitsDice?.length || COC_LEVELS.has(roll.successLevel)
        ? "percentile"
        : "check";
    default:
      if (roll.pool) return "pool";
      if (isFateRoll(roll.rolls, roll.notation)) return "fate";
      return isPbtaTier(roll.successLevel) || isBwbTier(roll.successLevel) ? "tier" : "plain";
  }
}

/** A figure for the card: a dash for anything that is not a finite number, never NaN */
export function figure(value: number | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "—";
}

export function signed(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return value > 0 ? `+${value}` : String(value);
}

/** A face of a simple roll; `kept` is false for one a keep/drop modifier (`2d20kl1`) discarded */
export interface SimpleFace {
  value: number;
  kept: boolean;
}

export function simpleFaces(roll: Pick<SimpleRoll, "rolls" | "notation">): SimpleFace[] {
  const kept = keptRollFlags(roll.rolls, roll.notation);
  return roll.rolls.map((value, index) => ({ value, kept: kept[index] }));
}

/** The number a simple roll adds to its dice: what the total holds beyond the kept faces */
export function simpleModifier(roll: SimpleRoll): number {
  if (roll.pool) return 0;
  const faces = simpleFaces(roll).reduce((sum, face) => (face.kept ? sum + face.value : sum), 0);
  const derived = roll.total - faces;
  if (Number.isFinite(derived)) return derived;
  return roll.modifier !== undefined && Number.isFinite(roll.modifier) ? roll.modifier : 0;
}

/** The digit a tens die shows: 0, 10, … 90 are stored as such */
export function tensFace(value: number): number {
  return value >= 10 && value % 10 === 0 ? value / 10 : value;
}

export function isFollowUp(roll: DiceRoll): roll is SkillCheck {
  return roll.type === "skill_check" && (roll.pushed === true || roll.luckSpent !== undefined || !!roll.followsRollId);
}

/** A Luck spend keeps `roll` as rolled; the figure that counts is the roll less the spend. */
export function effectiveRoll(roll: SkillCheck): number {
  const spent = roll.luckSpent ?? 0;
  return spent > 0 ? Math.max(0, roll.roll - spent) : roll.roll;
}

export type BlindAudience = "self" | "gm" | "roller" | "limited";

/**
 * Who can see a roll that is not open to everyone, for the viewer's label.
 * `null` when it is open to everyone.
 */
export function blindAudience(
  visibility: DiceRoll["visibility"],
  viewer: { isOwn: boolean; isGM: boolean },
): BlindAudience | null {
  if (visibility === "all") return null;
  if (visibility === "selected") return "limited";
  if (viewer.isOwn) return viewer.isGM ? "self" : "gm";
  return viewer.isGM ? "roller" : "limited";
}
