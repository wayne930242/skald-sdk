/**
 * Post-roll actions
 *
 * What a system lets you do once a roll is on the table, declared as data in
 * `dsl-roll-rules.json` (`postRollActions` on a rule) and decided here by pure
 * functions, so the decision table is testable without React or a database:
 *
 * - `reroll`: push the roll (re-roll the same target, once, after a failure)
 * - `spend`: spend a character resource (Luck) to move the result up the ladder
 * - `improve`: tick the skill for an improvement check when the roll earned it
 *
 * A system without `postRollActions` gets no actions and nothing in the UI.
 */

import type { DiceVisibility } from "./types";
import type { DeclaredDifficulty } from "./difficulty";
import { evaluateRollThreshold, type RollRulesDefinition } from "./dsl-roll-evaluator";

interface PostRollActionBase {
  id: string;
  /** Roll keys (field or row ids) this action never applies to, e.g. SAN and Luck rolls */
  notFor?: string[];
}

/** Re-roll the same check */
export interface RerollPostRollAction extends PostRollActionBase {
  kind: "reroll";
  /** Success level ids after which the roll may be re-rolled */
  when: string[];
  /** At most once per roll */
  once?: boolean;
}

/** A level a spend can buy and the number the effective roll must come down to */
export interface SpendPostRollLevel {
  id: string;
  /** `{{ }}` formula over `@target`; the effective roll must be at or below it */
  threshold: string;
}

/** Spend a character resource to lower the roll */
export interface SpendPostRollAction extends PostRollActionBase {
  kind: "spend";
  /** Character data path of the resource, e.g. `luck.current` */
  resource: string;
  /** Path read when `resource` was never stored (a new character shows its start value) */
  fallback?: string;
  /** The cost is the effective roll minus the threshold of the level bought */
  cost: "toThreshold";
  /** Success level ids ordered weakest to strongest; a spend only moves up this ladder */
  ladder: string[];
  levels: SpendPostRollLevel[];
  /** Levels a spend cannot change */
  notFrom?: string[];
  /** Ids of other actions that, once used on the roll, rule this one out */
  notAfter?: string[];
}

/** Tick the skill for an improvement check */
export interface ImprovePostRollAction extends PostRollActionBase {
  kind: "improve";
  levels: string[];
  /** A bonus die was involved: no tick (a penalty die still ticks) */
  excludeBonus?: boolean;
  excludePushed?: boolean;
}

export type PostRollAction =
  | RerollPostRollAction
  | SpendPostRollAction
  | ImprovePostRollAction;

/** The state of one roll the actions are decided against */
export interface PostRollState {
  /** What rolled (field or row id); matched against `notFor` */
  rollKey?: string;
  successLevel: string;
  /** The dice total as rolled, before any Luck was spent */
  rolled: number;
  /** Only a check against a target can be pushed or bought up */
  targetValue?: number;
  bonusDice?: number;
  /** This roll is itself a push */
  pushed: boolean;
  /** A push has already been made from this roll */
  wasPushed: boolean;
  /** Points already spent on this roll */
  luckSpent: number;
  /**
   * The difficulty declared for the roll. A spend never buys a level below it: at Hard, a
   * Regular result is still a failure.
   */
  difficulty?: DeclaredDifficulty;
  /** The spendable resource; absent or not writable when the sheet cannot be changed */
  resource?: { value: number; writable: boolean };
}

export type PushBlockReason = "no-target" | "excluded" | "already-pushed" | "not-failed";
export type SpendBlockReason =
  | "no-target"
  | "excluded"
  | "after-push"
  | "nothing-to-buy"
  | "not-writable"
  | "too-low";

export interface SpendOption {
  level: string;
  threshold: number;
  cost: number;
  affordable: boolean;
}

export interface PushDecision {
  rule: RerollPostRollAction;
  available: boolean;
  reason?: PushBlockReason;
}

export interface SpendDecision {
  rule: SpendPostRollAction;
  resource: string;
  available: boolean;
  reason?: SpendBlockReason;
  /** Every level that could be bought, cheapest first; unaffordable ones included so the UI can say what it would cost */
  options: SpendOption[];
  /** The cheapest option, when it is out of reach (`too-low`) */
  cheapest?: SpendOption;
}

export interface PostRollEvaluation {
  push: PushDecision | null;
  spend: SpendDecision | null;
}

function matchesPattern(pattern: string, rollKey: string): boolean {
  if (!pattern.endsWith("*")) return pattern === rollKey;
  const prefix = pattern.slice(0, -1);
  if (rollKey.startsWith(prefix)) return true;
  // `fighting:*` names a skill group: its blank slots (`fighting[1]`) and the bare group id
  // (`fighting`, the stored name of a slot) belong to it as much as `fighting:brawl` does
  if (prefix.length > 1 && prefix.endsWith(":")) {
    const group = prefix.slice(0, -1);
    return rollKey === group || (rollKey.startsWith(`${group}[`) && /^\[\d+\]$/.test(rollKey.slice(group.length)));
  }
  return false;
}

/** Whether a rule's `notFor` patterns rule this roll key out (an unknown key is never ruled out) */
export function postRollActionExcludes(rule: PostRollActionBase, rollKey: string | undefined): boolean {
  if (rollKey === undefined) return false;
  // A trailing `*` excludes every key sharing the prefix (`fighting:*`); a `group:*` also
  // covers the group's own id and its blank slots
  return (rule.notFor ?? []).some((pattern) => matchesPattern(pattern, rollKey));
}

function evaluateThreshold(formula: string, target: number): number | null {
  const value = evaluateRollThreshold(formula, { target });
  return value === null ? null : Math.floor(value);
}

function decidePush(rule: RerollPostRollAction, state: PostRollState): PushDecision {
  const blocked = (reason: PushBlockReason): PushDecision => ({ rule, available: false, reason });
  if (state.targetValue === undefined) return blocked("no-target");
  if (postRollActionExcludes(rule, state.rollKey)) return blocked("excluded");
  if (rule.once !== false && (state.pushed || state.wasPushed)) return blocked("already-pushed");
  if (!rule.when.includes(state.successLevel)) return blocked("not-failed");
  return { rule, available: true };
}

function decideSpend(rule: SpendPostRollAction, state: PostRollState): SpendDecision {
  const base = { rule, resource: rule.resource, options: [] as SpendOption[] };
  const blocked = (reason: SpendBlockReason, extra: Partial<SpendDecision> = {}): SpendDecision => ({
    ...base,
    available: false,
    reason,
    ...extra,
  });
  if (state.targetValue === undefined) return blocked("no-target");
  if (postRollActionExcludes(rule, state.rollKey)) return blocked("excluded");
  const afterPush = (rule.notAfter ?? []).includes("push") && (state.pushed || state.wasPushed);
  if (afterPush) return blocked("after-push");

  const current = rule.ladder.indexOf(state.successLevel);
  if ((rule.notFrom ?? []).includes(state.successLevel) || current < 0) {
    return blocked("nothing-to-buy");
  }

  const effective = state.rolled - state.luckSpent;
  const required = state.difficulty ? rule.ladder.indexOf(state.difficulty) : -1;
  const options: SpendOption[] = [];
  for (const level of rule.levels) {
    const rank = rule.ladder.indexOf(level.id);
    if (rank <= current || rank < required) continue;
    const threshold = evaluateThreshold(level.threshold, state.targetValue);
    if (threshold === null || threshold < 1) continue;
    const cost = effective - threshold;
    if (cost < 1) continue;
    options.push({ level: level.id, threshold, cost, affordable: false });
  }
  options.sort((a, b) => a.cost - b.cost);
  if (options.length === 0) return blocked("nothing-to-buy");

  if (!state.resource || !state.resource.writable) {
    return blocked("not-writable", { options });
  }
  const priced = options.map((option) => ({
    ...option,
    affordable: option.cost <= state.resource!.value,
  }));
  if (!priced.some((option) => option.affordable)) {
    return blocked("too-low", { options: priced, cheapest: priced[0] });
  }
  return { ...base, available: true, options: priced };
}

/** Decide which post-roll actions a roll can use right now */
export function evaluatePostRollActions(
  actions: readonly PostRollAction[] | undefined,
  state: PostRollState,
): PostRollEvaluation {
  const reroll = actions?.find((action): action is RerollPostRollAction => action.kind === "reroll");
  const spend = actions?.find((action): action is SpendPostRollAction => action.kind === "spend");
  return {
    push: reroll ? decidePush(reroll, state) : null,
    spend: spend ? decideSpend(spend, state) : null,
  };
}

export interface AutoImproveInput {
  rollKey?: string;
  successLevel: string;
  bonusDice?: number;
  pushed: boolean;
  /** Who can see the roll; a blind (`gm`) roll never ticks, since the sheet is watched live */
  visibility?: DiceVisibility;
}

/**
 * - `tick`: the roll earned the tick and it is written now
 * - `withheld-blind`: the roll would have ticked, but a blind roll must not show on the sheet;
 *   the player ticks it by hand when the session settles
 * - `none`: no tick was earned
 */
export type AutoImproveDecision = "tick" | "withheld-blind" | "none";

/**
 * Whether a roll earns the skill an improvement tick. Decided once, at roll time:
 * a Luck spend that later turns a failure into a success never ticks.
 */
export function decideAutoImprove(
  actions: readonly PostRollAction[] | undefined,
  input: AutoImproveInput,
): AutoImproveDecision {
  const rule = actions?.find((action): action is ImprovePostRollAction => action.kind === "improve");
  if (!rule) return "none";
  if (postRollActionExcludes(rule, input.rollKey)) return "none";
  if (!rule.levels.includes(input.successLevel)) return "none";
  if (rule.excludeBonus && (input.bonusDice ?? 0) > 0) return "none";
  if (rule.excludePushed && input.pushed) return "none";
  // Teammates watch the sheet live: a tick would tell them the blind roll succeeded
  if (input.visibility === "gm") return "withheld-blind";
  return "tick";
}

/** Whether the roll ticks the skill now (see {@link decideAutoImprove}) */
export function shouldAutoImprove(
  actions: readonly PostRollAction[] | undefined,
  input: AutoImproveInput,
): boolean {
  return decideAutoImprove(actions, input) === "tick";
}

/**
 * The rule id a roll expression belongs to: its `system:` prefix (`coc7:1d100…`),
 * else the rules' default.
 */
export function resolveRollRuleId(
  expression: string,
  rollRules: RollRulesDefinition | undefined,
): string | undefined {
  if (!rollRules) return undefined;
  return expression.match(/^([a-z0-9]+):/i)?.[1] ?? rollRules.default;
}

/** The post-roll actions a rule declares; none when the rule or the rules are missing */
export function findPostRollActions(
  rollRules: RollRulesDefinition | undefined,
  ruleId: string | undefined,
): PostRollAction[] {
  if (!rollRules || !ruleId) return [];
  return rollRules.rules[ruleId]?.postRollActions ?? [];
}
