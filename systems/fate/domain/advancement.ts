import type { FateAspectRow, FateInjuryMetadata, FateMilestoneEntry, FateStuntRow } from "./character";
import { isNonNegativeInteger, refuse, type FateCommandContext, type FateVerdict } from "./engine";
import { checkFateStuntPurchase, fateRecoveryStatus, startRecovery, type FateBoundaries, type FateInjuryRef, type FateRefreshInput } from "./lifecycle";
import { checkFateColumns, type FateAdvancementConfig, type FateEconomyConfig, type FateRecoveryConfig, type FateRosterSkill } from "./presets";

export interface FateAdvancementState {
  readOnly: boolean;
  /** Active roster (see `projectFateSkills`). */
  skills: readonly FateRosterSkill[];
  aspects: readonly Pick<FateAspectRow, "id" | "kind" | "text">[];
  stunts: readonly Pick<FateStuntRow, "id">[];
  refresh: FateRefreshInput;
  bankedSkillRanks: number;
  boundaries: FateBoundaries;
  milestones: readonly Pick<FateMilestoneEntry, "operationId">[];
  injuries: readonly FateInjuryRef[];
  /** The aspect an extreme consequence replaced, renamable only at a major milestone. */
  extremeAspectId?: string;
}

/** The single lateral change of a minor milestone (also allowed once in a major one). */
export type FateLateralOption =
  | { kind: "swapSkills"; skillA: string; skillB: string }
  | { kind: "replaceAverage"; from: string; to: string }
  | { kind: "rewriteStunt"; stuntId: string }
  | { kind: "purchaseStunt" }
  | { kind: "rewriteAspect"; aspectId: string; text: string };

export interface FateAdvancementDelta {
  /** Next rating of every changed skill. */
  skills: Record<string, number>;
  /** Next text of every rewritten aspect. */
  aspects: Record<string, string>;
  /** Stunt the player may now rewrite in the same apply. */
  rewriteStuntId?: string;
  /** A new stunt may be added; with a legacy override the override drops by its cost. */
  purchaseStunt?: { cost: 0 | 1; refreshOverride?: number };
  refreshEarnedDelta: number;
  bankedSkillRanks: number;
  majorMilestoneSequence?: number;
  injuries: { begin: Record<string, { text: string; metadata: FateInjuryMetadata }>; clear: string[] };
  extremeText?: string;
}

export type FateAdvancementRefusal =
  | "readOnly" | "duplicateOperation" | "unknownSkill" | "noChange" | "notAverage" | "alreadyRated" | "unknownStunt"
  | "belowMinimumRefresh" | "unknownAspect" | "highConceptLocked" | "extremeAspectLocked" | "blankText" | "notCharacterAspect"
  | "decrease" | "insufficientPoints" | "columns" | "notEligibleForRecovery" | "notRecovering" | "noExtreme" | "invalidRating";

interface Working { ratings: Map<string, number>; delta: FateAdvancementDelta }

const hasText = (value: string | undefined) => typeof value === "string" && value.trim() !== "";

function applyLateral(
  state: FateAdvancementState, option: FateLateralOption, work: Working, economy: Pick<FateEconomyConfig, "freeStunts" | "minRefresh">,
): FateAdvancementRefusal | null {
  const { ratings, delta } = work;
  const setRating = (id: string, value: number) => { ratings.set(id, value); delta.skills[id] = value; };
  switch (option.kind) {
    case "swapSkills": {
      const a = ratings.get(option.skillA);
      const b = ratings.get(option.skillB);
      if (a === undefined || b === undefined) return "unknownSkill";
      if (option.skillA === option.skillB || a === b) return "noChange";
      setRating(option.skillA, b);
      setRating(option.skillB, a);
      return null;
    }
    case "replaceAverage": {
      const from = ratings.get(option.from);
      const to = ratings.get(option.to);
      if (from === undefined || to === undefined) return "unknownSkill";
      if (from !== 1) return "notAverage";
      if (to !== 0) return "alreadyRated";
      setRating(option.from, 0);
      setRating(option.to, 1);
      return null;
    }
    case "rewriteStunt":
      if (!state.stunts.some(s => s.id === option.stuntId)) return "unknownStunt";
      delta.rewriteStuntId = option.stuntId;
      return null;
    case "purchaseStunt": {
      const check = checkFateStuntPurchase(economy, { ...state.refresh, earned: state.refresh.earned + delta.refreshEarnedDelta });
      if (!check.ok) return check.reason;
      delta.purchaseStunt = { cost: check.cost, ...(check.overrideAfter !== undefined ? { refreshOverride: check.overrideAfter } : {}) };
      return null;
    }
    case "rewriteAspect": {
      const aspect = state.aspects.find(a => a.id === option.aspectId);
      if (!aspect) return "unknownAspect";
      if (aspect.kind === "highConcept") return "highConceptLocked";
      if (aspect.kind === "situation" || aspect.kind === "boost") return "notCharacterAspect";
      if (aspect.id === state.extremeAspectId) return "extremeAspectLocked";
      if (!hasText(option.text)) return "blankText";
      if (option.text === aspect.text) return "noChange";
      delta.aspects[aspect.id] = option.text;
      return null;
    }
  }
}

function start(state: FateAdvancementState): Working {
  return {
    ratings: new Map(state.skills.map(s => [s.id, s.rating])),
    delta: { skills: {}, aspects: {}, refreshEarnedDelta: 0, bankedSkillRanks: state.bankedSkillRanks, injuries: { begin: {}, clear: [] } },
  };
}

const duplicate = (state: FateAdvancementState, context: FateCommandContext) =>
  state.milestones.some(m => m.operationId === context.operationId);

/** A minor milestone: at most one lateral option; choosing none is valid. */
export function planFateMinorMilestone(
  state: FateAdvancementState, option: FateLateralOption | null,
  config: { economy: Pick<FateEconomyConfig, "freeStunts" | "minRefresh"> }, context: FateCommandContext,
): FateVerdict<{ delta: FateAdvancementDelta; entry: FateMilestoneEntry }, FateAdvancementRefusal> {
  if (state.readOnly) return refuse("readOnly");
  if (duplicate(state, context)) return refuse("duplicateOperation");
  const work = start(state);
  if (option) {
    const failure = applyLateral(state, option, work, config.economy);
    if (failure) return refuse(failure);
  }
  return {
    ok: true, delta: work.delta,
    entry: { id: context.operationId, kind: "minor", timestamp: context.timestamp, operationId: context.operationId, skillPointDelta: 0, refreshDelta: 0 },
  };
}

/**
 * Validate a growth allocation as a set: increases only, total steps within the points, and no
 * column (rank > rank below) made worse than before. A starting shape that already breaks columns
 * (e.g. the diamond) is not itself an error. Unspent points stay banked.
 */
export function checkFateSkillGrowth(
  ratings: ReadonlyMap<string, number>, increases: Readonly<Record<string, number>>, points: number,
): FateVerdict<{ next: Map<string, number>; cost: number; banked: number }, "unknownSkill" | "decrease" | "invalidRating" | "insufficientPoints" | "columns"> {
  const next = new Map(ratings);
  let cost = 0;
  for (const [id, rating] of Object.entries(increases)) {
    const before = ratings.get(id);
    if (before === undefined) return refuse("unknownSkill", { skillId: id });
    if (!Number.isSafeInteger(rating)) return refuse("invalidRating", { skillId: id });
    if (rating < before) return refuse("decrease", { skillId: id });
    cost += rating - before;
    next.set(id, rating);
  }
  if (cost > points) return refuse("insufficientPoints", { cost, points });
  const excess = (values: Iterable<number>) => new Map(checkFateColumns([...values]).map(v => [v.rank, v.count - v.below]));
  const before = excess(ratings.values());
  const worse = [...excess(next.values())].filter(([rank, over]) => over > (before.get(rank) ?? 0));
  if (worse.length) return refuse("columns", { ranks: worse.map(([rank]) => rank) });
  return { ok: true, next, cost, banked: points - cost };
}

/**
 * A major milestone: one optional lateral option, optional high-concept rewrite, recovery of
 * moderate/severe consequences, skill points (bankable) and the GM's optional power-ups the player
 * acknowledges locally. Unlocks the next extreme consequence; may rename (not restore) the extreme aspect.
 */
export function planFateMajorMilestone(
  state: FateAdvancementState,
  input: {
    lateral?: FateLateralOption | null;
    highConcept?: string;
    beginRecovery?: Readonly<Record<string, string>>;
    clear?: readonly string[];
    increases?: Readonly<Record<string, number>>;
    gm?: { refresh?: boolean; secondSkillPoint?: boolean };
    extremeRename?: string;
  },
  config: { economy: Pick<FateEconomyConfig, "freeStunts" | "minRefresh">; recovery: FateRecoveryConfig; advancement: FateAdvancementConfig },
  context: FateCommandContext,
): FateVerdict<{ delta: FateAdvancementDelta; entry: FateMilestoneEntry }, FateAdvancementRefusal> {
  if (state.readOnly) return refuse("readOnly");
  if (duplicate(state, context)) return refuse("duplicateOperation");
  const work = start(state);
  const { delta } = work;
  const { major } = config.advancement;
  const refreshDelta = input.gm?.refresh ? major.gmRefresh : 0;
  delta.refreshEarnedDelta = refreshDelta;
  if (input.lateral) {
    const failure = applyLateral(state, input.lateral, work, config.economy);
    if (failure) return refuse(failure);
  }
  if (input.highConcept !== undefined) {
    const aspect = state.aspects.find(a => a.kind === "highConcept");
    if (!aspect) return refuse("unknownAspect");
    if (!hasText(input.highConcept)) return refuse("blankText");
    if (input.highConcept !== aspect.text) delta.aspects[aspect.id] = input.highConcept;
  }
  if (input.extremeRename !== undefined) {
    if (state.extremeAspectId === undefined) return refuse("noExtreme");
    if (!hasText(input.extremeRename)) return refuse("blankText");
    delta.aspects[state.extremeAspectId] = input.extremeRename;
    delta.extremeText = input.extremeRename;
  }
  for (const [key, text] of Object.entries(input.beginRecovery ?? {})) {
    const injury = state.injuries.find(i => i.key === key);
    if (!injury || injury.severity === "mild" || fateRecoveryStatus(injury, state.boundaries) !== "untreated" || injury.text.trim() === "") {
      return refuse("notEligibleForRecovery", { key });
    }
    const nextText = injury.renamable ? text : injury.text;
    if (injury.renamable && !hasText(nextText)) return refuse("blankText", { key });
    delta.injuries.begin[key] = {
      text: nextText,
      metadata: startRecovery(injury, nextText, `${context.operationId}:${key}`, state.boundaries, config.recovery, true),
    };
  }
  for (const key of input.clear ?? []) {
    const injury = state.injuries.find(i => i.key === key);
    if (!injury || injury.severity === "mild" || fateRecoveryStatus(injury, state.boundaries) === "untreated") return refuse("notRecovering", { key });
    delta.injuries.clear.push(key);
  }
  if (!isNonNegativeInteger(state.bankedSkillRanks)) return refuse("invalidRating");
  const gained = major.skillPoints + (input.gm?.secondSkillPoint ? major.gmSkillPoints : 0);
  const growth = checkFateSkillGrowth(work.ratings, input.increases ?? {}, state.bankedSkillRanks + gained);
  if (!growth.ok) return growth;
  for (const [id, rating] of growth.next) if (rating !== work.ratings.get(id)) delta.skills[id] = rating;
  delta.bankedSkillRanks = growth.banked;
  delta.majorMilestoneSequence = state.boundaries.majorMilestone + 1;
  return {
    ok: true, delta,
    entry: { id: context.operationId, kind: "major", timestamp: context.timestamp, operationId: context.operationId, skillPointDelta: gained, refreshDelta },
  };
}
