import { rollDice, type RandomSource } from "@skald/dice";
import type { FateAction } from "./character";
import { refuse, type FateFace, type FateFaces, type FateVerdict } from "./engine";
import type { FateRatingsOption, FateRules, FateScaleMode, FateScaleOption } from "./presets";

/** The named adjective ladder; totals outside it keep their number and have no rung. */
export const FATE_LADDER_MIN = -4;
export const FATE_LADDER_MAX = 8;
export const FATE_ACTIONS = ["overcome", "createAdvantage", "attack", "defend"] as const satisfies readonly FateAction[];

export type FateOutcome = "fail" | "tie" | "success" | "style";

export interface FateLadderPosition {
  total: number;
  /** Rung key for the ladder labels, or null beyond the named ladder. */
  rung: number | null;
  beyond: "below" | "above" | null;
}

export function fateLadder(total: number): FateLadderPosition {
  if (total < FATE_LADDER_MIN) return { total, rung: null, beyond: "below" };
  if (total > FATE_LADDER_MAX) return { total, rung: null, beyond: "above" };
  return { total, rung: total, beyond: null };
}

export function gradeFateRoll(total: number, opposition: number): { shifts: number; outcome: FateOutcome } {
  const shifts = total - opposition;
  return { shifts, outcome: shifts < 0 ? "fail" : shifts === 0 ? "tie" : shifts >= 3 ? "style" : "success" };
}

const isFace = (value: number): value is FateFace => value === -1 || value === 0 || value === 1;

/** One four-face sample from the shared Fate dice: exactly four reads of `random`. */
export function rollFateFaces(random: RandomSource): FateFaces {
  const faces = rollDice({ count: 4, sides: "F" }, random).rolls;
  return toFateFaces(faces);
}

export function toFateFaces(values: readonly number[]): FateFaces {
  if (values.length !== 4 || !values.every(isFace)) throw new RangeError("Fate rolls have exactly four faces of −1, 0 or +1");
  return [values[0], values[1], values[2], values[3]] as FateFaces;
}

export const sumFateFaces = (faces: FateFaces) => faces[0] + faces[1] + faces[2] + faces[3];

export type FateAdvantageTarget = "new" | "known" | "unknown";

/** Options for one roll. Defaults (B-022): overcome against +0, nothing preselected. */
export interface FateRollOptions {
  action: FateAction;
  opposition: number;
  /** Stunts the player confirmed apply to this fiction; each adds its bonus. */
  stunts: { stuntId: string; bonus: number }[];
  /** Create an advantage: a new aspect or an existing known/unknown one. */
  advantage: FateAdvantageTarget;
  /** Scale tiers of this character and the opposition when scale is enabled and applies. */
  scale: { selfTier: string; otherTier: string; modeId: string } | null;
  /** Weapon/armor ratings, only when ratings are enabled; attack weapon, target armor. */
  weapon: number;
  armor: number;
}

export function defaultFateRollOptions(): FateRollOptions {
  return { action: "overcome", opposition: 0, stunts: [], advantage: "new", scale: null, weapon: 0, armor: 0 };
}

export type FateRollModifier =
  | { kind: "stunt"; stuntId: string; value: number }
  | { kind: "scale"; modeId: string; value: number }
  | { kind: "invoke"; aspectId: string; payment: "free" | "paid"; effect: "plus2" | "reroll"; operationId: string; value: number };

export type FateRollVisibility = "all" | "gm" | "local";

/** Character-scoped roll result. A later invoke yields a new snapshot whose parent is this one. */
export interface FateRollSnapshot {
  rootRollId: string;
  resultId: string;
  parentResultId?: string;
  characterId: string;
  skillId?: string;
  rating: number;
  faces: FateFaces;
  action: FateAction;
  opposition: number;
  advantage: FateAdvantageTarget;
  modifiers: FateRollModifier[];
  visibility: FateRollVisibility;
  /** The one scale mode in effect, if any; after-roll modes are added by `applyFateScaleAfterRoll`. */
  scale: { modeId: string; difference: number; perTier: number; effect: FateScaleMode["effect"] } | null;
  weapon: number;
  armor: number;
}

export type FateRollRefusal = "ratingsDisabled" | "ratingOutOfRange" | "scaleDisabled" | "unknownTier" | "unknownScaleMode" | "notHigher" | "scaleNotApplicable" | "invalidOpposition";

export function fateScaleDifference(scale: FateScaleOption, selfTier: string, otherTier: string): number | undefined {
  const self = scale.tiers.indexOf(selfTier);
  const other = scale.tiers.indexOf(otherTier);
  return self < 0 || other < 0 ? undefined : self - other;
}

/** Scale modes the higher side may pick from for this action; never more than one applies. */
export function fateScaleModes(scale: FateScaleOption, action: FateAction): FateScaleMode[] {
  return scale.enabled ? scale.modes.filter(mode => !mode.actions || mode.actions.includes(action)) : [];
}

function ratingAllowed(ratings: FateRatingsOption, value: number): boolean {
  if (value === 0) return true;
  return ratings.enabled && Number.isSafeInteger(value) && value >= ratings.min && value <= ratings.max;
}

/**
 * Build the initial snapshot from the faces the host roller returned. Only a before-roll scale
 * mode is accepted here; after-roll and result modes are chosen once the outcome is known.
 */
export function createFateRoll(
  input: { rootRollId: string; characterId: string; skillId?: string; rating: number; faces: FateFaces; options: FateRollOptions; visibility: FateRollVisibility },
  rules: Pick<FateRules, "ratings" | "scale">,
): FateVerdict<{ snapshot: FateRollSnapshot }, FateRollRefusal> {
  const { options } = input;
  if (!Number.isSafeInteger(options.opposition)) return refuse("invalidOpposition");
  if ((options.weapon !== 0 || options.armor !== 0) && !rules.ratings.enabled) return refuse("ratingsDisabled");
  if (!ratingAllowed(rules.ratings, options.weapon) || !ratingAllowed(rules.ratings, options.armor)) return refuse("ratingOutOfRange");
  const modifiers: FateRollModifier[] = options.stunts.map(s => ({ kind: "stunt", stuntId: s.stuntId, value: s.bonus }));
  let scale: FateRollSnapshot["scale"] = null;
  if (options.scale) {
    if (!rules.scale.enabled) return refuse("scaleDisabled");
    const difference = fateScaleDifference(rules.scale, options.scale.selfTier, options.scale.otherTier);
    if (difference === undefined) return refuse("unknownTier");
    const mode = fateScaleModes(rules.scale, options.action).find(m => m.id === options.scale?.modeId);
    if (!mode) return refuse(rules.scale.modes.some(m => m.id === options.scale?.modeId) ? "scaleNotApplicable" : "unknownScaleMode");
    // After-roll and result modes are chosen with `applyFateScaleAfterRoll` once the outcome is known.
    if (mode.timing !== "beforeRoll") return refuse("scaleNotApplicable");
    if (difference <= 0) return refuse("notHigher");
    scale = { modeId: mode.id, difference, perTier: mode.perTier, effect: mode.effect };
    modifiers.push({ kind: "scale", modeId: mode.id, value: mode.perTier * difference });
  }
  return {
    ok: true,
    snapshot: {
      rootRollId: input.rootRollId, resultId: input.rootRollId, characterId: input.characterId, skillId: input.skillId,
      rating: input.rating, faces: input.faces, action: options.action, opposition: options.opposition,
      advantage: options.advantage, modifiers, visibility: input.visibility, scale,
      weapon: options.weapon, armor: options.armor,
    },
  };
}

/** A pre-dice preview: what each possible dice result (−4…+4) would yield with the chosen options. */
export function previewFateRoll(rating: number, options: Pick<FateRollOptions, "opposition" | "stunts">, beforeRollBonus = 0) {
  const base = rating + options.stunts.reduce((sum, s) => sum + s.bonus, 0) + beforeRollBonus;
  return [-4, -3, -2, -1, 0, 1, 2, 3, 4].map(dice => ({ dice, total: base + dice, ...gradeFateRoll(base + dice, options.opposition) }));
}

export type FateOutcomeOffer =
  | { id: "fail" | "majorCost" | "minorCost" | "success" | "deny" | "noAspect" }
  | { id: "boost" | "failWithBoost" | "successWithBoost" | "armorBoost" }
  | { id: "enemyFreeInvoke" | "enemyMayReveal" }
  | { id: "freeInvokes"; freeInvokes: number; reveal?: boolean; newAspect?: boolean }
  | { id: "hit"; shifts: number }
  | { id: "hitWithBoost"; shifts: number }
  | { id: "takeHit"; shifts: number };

export interface FateRollResult {
  total: number;
  ladder: FateLadderPosition;
  shifts: number;
  outcome: FateOutcome;
  /** Choices the table adjudicates; nothing is applied automatically. */
  offers: FateOutcomeOffer[];
}

export function fateRollTotal(snapshot: Pick<FateRollSnapshot, "faces" | "rating" | "modifiers">): number {
  return sumFateFaces(snapshot.faces) + snapshot.rating + snapshot.modifiers.reduce((sum, m) => sum + m.value, 0);
}

/** Weapon adds shifts to a hit (and makes a tie hit); armor subtracts after the hit lands. */
export function fateHitShifts(shifts: number, weapon: number, armor: number, ratings: FateRatingsOption):
  { kind: "miss" } | { kind: "boost" } | { kind: "armorBoost" } | { kind: "hit"; shifts: number } {
  if (shifts < 0) return { kind: "miss" };
  const tieHits = shifts === 0 && ratings.enabled && ratings.weaponOnTie && weapon > 0;
  if (shifts === 0 && !tieHits) return { kind: "boost" };
  const hit = shifts + (ratings.enabled ? weapon - armor : 0);
  if (hit <= 0) return ratings.enabled && ratings.armorZeroBoost ? { kind: "armorBoost" } : { kind: "miss" };
  return { kind: "hit", shifts: hit };
}

export function resolveFateRoll(snapshot: FateRollSnapshot, rules: Pick<FateRules, "ratings">): FateRollResult {
  const total = fateRollTotal(snapshot);
  const { shifts, outcome } = gradeFateRoll(total, snapshot.opposition);
  const scaleInvokes = snapshot.scale?.effect === "freeInvokes" && (outcome === "success" || outcome === "style")
    ? snapshot.scale.perTier * snapshot.scale.difference : 0;
  const offers: FateOutcomeOffer[] = [];
  switch (snapshot.action) {
    case "overcome":
      if (outcome === "fail") offers.push({ id: "fail" }, { id: "majorCost" });
      else if (outcome === "tie") offers.push({ id: "minorCost" }, { id: "failWithBoost" });
      else if (outcome === "success") offers.push({ id: "success" });
      else offers.push({ id: "successWithBoost" });
      break;
    case "createAdvantage": {
      const existing = snapshot.advantage !== "new";
      if (outcome === "fail") {
        if (!existing) offers.push({ id: "noAspect" }, { id: "enemyFreeInvoke" });
        else offers.push({ id: snapshot.advantage === "known" ? "enemyFreeInvoke" : "enemyMayReveal" });
      }
      if (outcome === "tie") offers.push(snapshot.advantage === "known" ? { id: "freeInvokes", freeInvokes: 1 } : { id: "boost" });
      if (outcome === "success" || outcome === "style") {
        offers.push({
          id: "freeInvokes", freeInvokes: (outcome === "style" ? 2 : 1) + scaleInvokes,
          ...(existing ? { reveal: snapshot.advantage === "unknown" } : { newAspect: true }),
        });
      }
      break;
    }
    case "attack": {
      const hit = fateHitShifts(shifts, snapshot.weapon, snapshot.armor, rules.ratings);
      if (hit.kind === "boost") offers.push({ id: "boost" });
      else if (hit.kind === "armorBoost") offers.push({ id: "armorBoost" });
      else if (hit.kind === "hit") {
        offers.push({ id: "hit", shifts: hit.shifts });
        if (outcome === "style" && hit.shifts > 1) offers.push({ id: "hitWithBoost", shifts: hit.shifts - 1 });
      } else offers.push({ id: "fail" });
      break;
    }
    case "defend":
      if (outcome === "fail") offers.push({ id: "takeHit", shifts: -shifts });
      else if (outcome === "tie") offers.push({ id: "minorCost" });
      else if (outcome === "success") offers.push({ id: "deny" });
      else offers.push({ id: "deny" }, { id: "boost" });
      break;
  }
  return { total, ladder: fateLadder(total), shifts, outcome, offers };
}

/**
 * Choose an after-roll scale bonus once the outcome is known. Exactly one scale mode per roll:
 * refused when a mode is already in effect, on the lower side, or when the roll did not succeed.
 */
export function applyFateScaleAfterRoll(
  snapshot: FateRollSnapshot, input: { selfTier: string; otherTier: string; modeId: string }, rules: Pick<FateRules, "scale" | "ratings">,
): FateVerdict<{ snapshot: FateRollSnapshot }, "scaleDisabled" | "scaleAlreadyApplied" | "unknownTier" | "unknownScaleMode" | "scaleNotApplicable" | "notHigher" | "notSuccessful"> {
  if (!rules.scale.enabled) return refuse("scaleDisabled");
  if (snapshot.scale) return refuse("scaleAlreadyApplied");
  const difference = fateScaleDifference(rules.scale, input.selfTier, input.otherTier);
  if (difference === undefined) return refuse("unknownTier");
  const mode = fateScaleModes(rules.scale, snapshot.action).find(m => m.id === input.modeId);
  if (!mode) return refuse(rules.scale.modes.some(m => m.id === input.modeId) ? "scaleNotApplicable" : "unknownScaleMode");
  if (mode.timing === "beforeRoll") return refuse("scaleNotApplicable");
  if (difference <= 0) return refuse("notHigher");
  const { outcome } = resolveFateRoll(snapshot, rules);
  if (mode.requiresOutcome && !mode.requiresOutcome.includes(outcome)) return refuse("notSuccessful");
  const scale = { modeId: mode.id, difference, perTier: mode.perTier, effect: mode.effect };
  const modifiers: FateRollModifier[] = mode.effect === "total"
    ? [...snapshot.modifiers, { kind: "scale", modeId: mode.id, value: mode.perTier * difference }]
    : snapshot.modifiers;
  return { ok: true, snapshot: { ...snapshot, modifiers, scale } };
}
