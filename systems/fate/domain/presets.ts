import type { FatePresetState } from "./character";
import type { FateCite, FateHitKind } from "./engine";

/**
 * Rule presets are data: every calculator reads the variant fields of a fixture option
 * (counts, thresholds, flags, `kind` discriminants), never a preset or option ID.
 */
export const FATE_PRESET_AXES = ["skills", "allocation", "stress", "injuries", "extreme", "ratings", "scale"] as const;
export type FatePresetAxis = (typeof FATE_PRESET_AXES)[number];
export type FatePresetSelection = Record<FatePresetAxis, string>;

export type FateSeverityId = "mild" | "moderate" | "severe";

export interface FateSkillListOption {
  id: string;
  group: "standard" | "short";
  kind?: "approaches";
  skills: string[];
  /** Skills whose rating lengthens stress or grants extra slots, per hit kind. */
  trackLinks: Partial<Record<FateHitKind, string>>;
  suggestedAllocation?: string;
  growth?: "slow";
  cite: FateCite;
}

export interface FateShapeSlot { rank: number; count: number }
export type FateAllocationOption =
  | { id: string; kind: "shape"; slots: FateShapeSlot[]; cap: number; cite: FateCite }
  | { id: string; kind: "pointBuy"; budget: number; cap: number; cite: FateCite };

export interface FateStressTrackConfig { id: string; hitKinds: FateHitKind[]; links: FateHitKind[] }
export interface FateStressOption {
  id: string;
  tracks: FateStressTrackConfig[];
  thresholds: { min: number; boxes: number }[];
  /** Capacity when no linked skill exists on the active list. */
  defaultBoxes: number;
  cite: FateCite;
}

export interface FateConsequenceSlotConfig {
  id: string;
  severity: FateSeverityId;
  value: number;
  link?: FateHitKind;
  min?: number;
  hitKinds?: FateHitKind[];
}
export interface FateConditionConfig {
  id: string;
  severity: FateSeverityId;
  value: number;
  boxes: number;
  row: string;
  hitKinds?: FateHitKind[];
  extraBoxes?: { link: FateHitKind; min: number; count: number; hitKinds: FateHitKind[] };
}
export type FateInjuryModelOption =
  | { id: string; kind: "consequences"; slots: FateConsequenceSlotConfig[]; extraSlots: FateConsequenceSlotConfig[]; cite: FateCite }
  | { id: string; kind: "conditions"; conditions: FateConditionConfig[]; rowCutoff?: number; cite: FateCite };

export type FateExtremeOption =
  | { id: string; enabled: false }
  | { id: string; enabled: true; value: number; activeWithKinds: FateInjuryModelOption["kind"][]; replacesAspect: boolean; protectedKinds: string[]; cite: FateCite };

export type FateRatingsOption =
  | { id: string; enabled: false }
  | { id: string; enabled: true; min: number; max: number; weaponOnTie: boolean; armorZeroBoost: boolean; cite: FateCite };

export interface FateScaleMode {
  id: string;
  timing: "beforeRoll" | "afterRoll" | "result";
  perTier: number;
  effect: "total" | "freeInvokes";
  requiresOutcome?: ("fail" | "tie" | "success" | "style")[];
  actions?: string[];
}
export interface FateScaleOption { id: string; enabled: boolean; tiers: string[]; modes: FateScaleMode[]; cite?: FateCite }

export interface FateEconomyConfig { baseRefresh: number; freeStunts: number; minRefresh: number; sessionStart: "topUp"; cite: FateCite }
export interface FateRecoveryConfig {
  treatmentDifficulty: Record<FateSeverityId, number>;
  selfTreatmentPenalty: number;
  boundary: Record<FateSeverityId, "scene" | "session" | "majorMilestone">;
  cite: FateCite;
}
export interface FateAdvancementConfig {
  minor: string[];
  major: { skillPoints: number; gmRefresh: number; gmSkillPoints: number };
  cite: FateCite;
}

export interface FatePresetDefinition { id: string; version: number; axes: FatePresetSelection; cite: FateCite }
export interface FateRecipe {
  id: string;
  /** The recipe lets the user pick any option of this axis. */
  choose?: FatePresetAxis;
  /** Options the recipe switches on. */
  set?: Partial<FatePresetSelection>;
  /** Options offered alongside, applied only with consent. */
  suggest?: Partial<FatePresetSelection>;
  cite: FateCite;
}

export interface FatePresetCatalog {
  version: number;
  defaultPreset: string;
  axes: FatePresetAxis[];
  skillLists: FateSkillListOption[];
  allocations: FateAllocationOption[];
  growth: { columns: boolean; cite: FateCite };
  stress: FateStressOption[];
  injuryModels: FateInjuryModelOption[];
  extreme: FateExtremeOption[];
  ratings: FateRatingsOption[];
  scale: FateScaleOption[];
  economy: FateEconomyConfig;
  recovery: FateRecoveryConfig;
  advancement: FateAdvancementConfig;
  presets: FatePresetDefinition[];
  recipes: FateRecipe[];
}

/**
 * Built-in data stays lazy: callers load the catalog (and one locale's labels) on demand and pass
 * it in. Its shape is checked by `validateFatePresetCatalog` in the colocated tests.
 */
export function loadFatePresetCatalog(): Promise<FatePresetCatalog> {
  return import("@skald/system-fate/data/fate-condensed/presets/catalog.json").then(module => module.default as unknown as FatePresetCatalog);
}

export function loadFatePresetLabels(locale: "en" | "zh-TW"): Promise<FatePresetLabels> {
  return locale === "zh-TW"
    ? import("@skald/system-fate/data/fate-condensed/presets/labels/zh-TW.json").then(module => module.default as FatePresetLabels)
    : import("@skald/system-fate/data/fate-condensed/presets/labels/en.json").then(module => module.default as FatePresetLabels);
}

const AXIS_OPTIONS = {
  skills: "skillLists",
  allocation: "allocations",
  stress: "stress",
  injuries: "injuryModels",
  extreme: "extreme",
  ratings: "ratings",
  scale: "scale",
} as const satisfies Record<FatePresetAxis, keyof FatePresetCatalog>;

export function fateAxisOptions(catalog: FatePresetCatalog, axis: FatePresetAxis): readonly { id: string }[] {
  return catalog[AXIS_OPTIONS[axis]];
}

export interface FateRules {
  presetId: string;
  presetVersion: number;
  selection: FatePresetSelection;
  skills: FateSkillListOption;
  allocation: FateAllocationOption;
  stress: FateStressOption;
  injuries: FateInjuryModelOption;
  extreme: FateExtremeOption;
  ratings: FateRatingsOption;
  scale: FateScaleOption;
  economy: FateEconomyConfig;
  recovery: FateRecoveryConfig;
  advancement: FateAdvancementConfig;
}

export type FateRulesIssue =
  | { reason: "unknownPreset"; presetId: string }
  | { reason: "unsupportedVersion"; presetId: string; version: number }
  | { reason: "unknownOption"; axis: FatePresetAxis; value: string }
  | { reason: "invalidOverride"; key: string };

/** Numeric overrides a table may configure; everything else comes from the fixture. */
export interface FatePresetOverrides { pointBudget?: number; pointCap?: number }

const positiveInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0;

/**
 * Compose the active rules. Unknown or newer data falls back to the preset's own option and is
 * reported in `issues` so the UI can say so; nothing is rewritten.
 */
export function resolveFateRules(
  catalog: FatePresetCatalog, state?: Partial<FatePresetState>,
): { rules: FateRules; issues: FateRulesIssue[] } {
  const issues: FateRulesIssue[] = [];
  const requested = state?.id ?? catalog.defaultPreset;
  let preset = catalog.presets.find(p => p.id === requested);
  if (!preset) {
    issues.push({ reason: "unknownPreset", presetId: requested });
    preset = catalog.presets.find(p => p.id === catalog.defaultPreset) ?? catalog.presets[0];
  } else if (typeof state?.version === "number" && state.version > preset.version) {
    issues.push({ reason: "unsupportedVersion", presetId: preset.id, version: state.version });
  }
  const selection = { ...preset.axes };
  for (const axis of FATE_PRESET_AXES) {
    const value = state?.selection?.[axis];
    if (value === undefined) continue;
    if (fateAxisOptions(catalog, axis).some(option => option.id === value)) selection[axis] = value;
    else issues.push({ reason: "unknownOption", axis, value });
  }
  const pick = <T extends { id: string }>(list: readonly T[], id: string): T => list.find(option => option.id === id) ?? list[0];
  let allocation = pick(catalog.allocations, selection.allocation);
  const overrides = (state?.overrides ?? {}) as Record<string, unknown>;
  if (allocation.kind === "pointBuy") {
    const budget = overrides.pointBudget;
    const cap = overrides.pointCap;
    if (budget !== undefined && !positiveInteger(budget)) issues.push({ reason: "invalidOverride", key: "pointBudget" });
    if (cap !== undefined && !positiveInteger(cap)) issues.push({ reason: "invalidOverride", key: "pointCap" });
    allocation = {
      ...allocation,
      budget: positiveInteger(budget) ? budget : allocation.budget,
      cap: positiveInteger(cap) ? cap : allocation.cap,
    };
  }
  return {
    rules: {
      presetId: preset.id,
      presetVersion: preset.version,
      selection,
      skills: pick(catalog.skillLists, selection.skills),
      allocation,
      stress: pick(catalog.stress, selection.stress),
      injuries: pick(catalog.injuryModels, selection.injuries),
      extreme: pick(catalog.extreme, selection.extreme),
      ratings: pick(catalog.ratings, selection.ratings),
      scale: pick(catalog.scale, selection.scale),
      economy: catalog.economy,
      recovery: catalog.recovery,
      advancement: catalog.advancement,
    },
    issues,
  };
}

/**
 * Change one axis. A suggested companion option (e.g. the approach spread for approaches) is
 * returned, never applied: the user's separately chosen shape stays until they consent.
 */
export function selectFatePresetOption(
  selection: FatePresetSelection, axis: FatePresetAxis, value: string, catalog: FatePresetCatalog,
): { ok: true; selection: FatePresetSelection; suggestions: Partial<FatePresetSelection> } | { ok: false; reason: "unknownOption" } {
  if (!fateAxisOptions(catalog, axis).some(option => option.id === value)) return { ok: false, reason: "unknownOption" };
  const next = { ...selection, [axis]: value };
  const suggestions: Partial<FatePresetSelection> = {};
  if (axis === "skills") {
    const suggested = catalog.skillLists.find(list => list.id === value)?.suggestedAllocation;
    if (suggested && suggested !== next.allocation) suggestions.allocation = suggested;
  }
  return { ok: true, selection: next, suggestions };
}

/** Apply a recipe's `set`; its `suggest` (and list suggestions) come back for consent. */
export function applyFateRecipe(
  selection: FatePresetSelection, recipeId: string, catalog: FatePresetCatalog,
): { ok: true; selection: FatePresetSelection; suggestions: Partial<FatePresetSelection> } | { ok: false; reason: "unknownRecipe" | "chooseOption" | "unknownOption" } {
  const recipe = catalog.recipes.find(r => r.id === recipeId);
  if (!recipe) return { ok: false, reason: "unknownRecipe" };
  if (!recipe.set) return { ok: false, reason: "chooseOption" };
  let next = selection;
  let suggestions: Partial<FatePresetSelection> = {};
  for (const [axis, value] of Object.entries(recipe.set) as [FatePresetAxis, string][]) {
    const step = selectFatePresetOption(next, axis, value, catalog);
    if (!step.ok) return step;
    next = step.selection;
    suggestions = { ...suggestions, ...step.suggestions };
  }
  for (const [axis, value] of Object.entries(recipe.suggest ?? {}) as [FatePresetAxis, string][]) {
    if (next[axis] !== value) suggestions[axis] = value;
    else delete suggestions[axis];
  }
  return { ok: true, selection: next, suggestions };
}

/** Summarize what differs between two selections, for the recipe preview. */
export function diffFatePresetSelection(before: FatePresetSelection, after: FatePresetSelection) {
  return FATE_PRESET_AXES.filter(axis => before[axis] !== after[axis]).map(axis => ({ axis, from: before[axis], to: after[axis] }));
}

// ---------------------------------------------------------------------------
// Skill roster

/** A stored skill row (`skills.skills[]`); `level` may be absent on drafts. */
export interface FateSkillRowInput { id: string; name?: string; level?: number }

export interface FateRosterSkill {
  id: string;
  rating: number;
  /** Has a stored row with a rating (an explicit +0 counts toward a +0 allotment). */
  explicit: boolean;
  custom: boolean;
  name?: string;
}

const catalogSkillIds = (catalog: FatePresetCatalog) => new Set(catalog.skillLists.flatMap(list => list.skills));
const rowLevel = (row: FateSkillRowInput | undefined) =>
  typeof row?.level === "number" && Number.isSafeInteger(row.level) ? row.level : undefined;

/**
 * Project the active roster. Rows of other catalogs and hidden rows stay stored and are listed as
 * dormant when they hold a rating; switching back restores them. Custom rows (IDs outside every
 * catalog list) stay active with any list unless hidden. Order follows `order`, then list order.
 */
export function projectFateSkills(
  input: { rows: readonly FateSkillRowInput[]; order?: readonly string[]; hidden?: readonly string[] },
  list: FateSkillListOption,
  catalog: FatePresetCatalog,
): { active: FateRosterSkill[]; dormant: FateRosterSkill[] } {
  const known = catalogSkillIds(catalog);
  const hidden = new Set(input.hidden ?? []);
  const rows = new Map(input.rows.map(row => [row.id, row]));
  const inList = new Set(list.skills);
  const ids = [...list.skills, ...input.rows.map(row => row.id).filter(id => !inList.has(id) && !known.has(id))];
  const position = new Map((input.order ?? []).map((id, index) => [id, index]));
  const ordered = ids
    .map((id, index) => ({ id, index }))
    .sort((a, b) => (position.get(a.id) ?? Infinity) - (position.get(b.id) ?? Infinity) || a.index - b.index)
    .map(({ id }) => id);
  const skill = (id: string): FateRosterSkill => {
    const row = rows.get(id);
    const level = rowLevel(row);
    const result: FateRosterSkill = { id, rating: level ?? 0, explicit: level !== undefined, custom: !known.has(id) };
    if (typeof row?.name === "string") result.name = row.name;
    return result;
  };
  const active = ordered.filter(id => !hidden.has(id)).map(skill);
  const activeIds = new Set(active.map(s => s.id));
  const dormant = input.rows
    .filter(row => !activeIds.has(row.id) && rowLevel(row) !== undefined && rowLevel(row) !== 0)
    .map(row => skill(row.id));
  return { active, dormant };
}

/** Preview a skill-list switch: which ratings go dormant and which come back. Nothing is deleted. */
export function previewFateSkillListSwitch(
  input: { rows: readonly FateSkillRowInput[]; order?: readonly string[]; hidden?: readonly string[] },
  from: FateSkillListOption, to: FateSkillListOption, catalog: FatePresetCatalog,
) {
  const before = projectFateSkills(input, from, catalog);
  const after = projectFateSkills(input, to, catalog);
  const rated = (skills: FateRosterSkill[]) => new Map(skills.filter(s => s.explicit && s.rating !== 0).map(s => [s.id, s]));
  const wasActive = rated(before.active);
  const nowActive = rated(after.active);
  return {
    goingDormant: [...wasActive.values()].filter(s => !nowActive.has(s.id)),
    restored: [...nowActive.values()].filter(s => !wasActive.has(s.id)),
    active: after.active,
  };
}

/** Link-skill ratings per hit kind for stress capacity and extra slots (absent link → undefined). */
export function fateLinkRatings(list: FateSkillListOption, ratings: Readonly<Record<string, number>>): Partial<Record<FateHitKind, number>> {
  const result: Partial<Record<FateHitKind, number>> = {};
  for (const [kind, skillId] of Object.entries(list.trackLinks) as [FateHitKind, string][]) {
    result[kind] = ratings[skillId] ?? 0;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Creation shape hints: gaps allowed, overages warned, nothing rebalanced.

export type FateAllocationReport =
  | {
    kind: "shape";
    ranks: { rank: number; expected: number; actual: number; status: "ok" | "under" | "over" }[];
    overCap: string[];
    /** Ratings above +0 that the shape has no slot for (e.g. a negative or unexpected rank). */
    unexpected: { id: string; rating: number }[];
    complete: boolean;
  }
  | { kind: "pointBuy"; spent: number; budget: number; remaining: number; cap: number; overCap: string[]; negative: string[]; complete: boolean };

export function checkFateAllocation(skills: readonly FateRosterSkill[], allocation: FateAllocationOption): FateAllocationReport {
  const overCap = skills.filter(s => s.rating > allocation.cap).map(s => s.id);
  if (allocation.kind === "pointBuy") {
    const spent = skills.reduce((sum, s) => sum + Math.max(0, s.rating), 0);
    const negative = skills.filter(s => s.rating < 0).map(s => s.id);
    return {
      kind: "pointBuy", spent, budget: allocation.budget, remaining: allocation.budget - spent, cap: allocation.cap,
      overCap, negative, complete: spent === allocation.budget && overCap.length === 0 && negative.length === 0,
    };
  }
  const slotRanks = new Set(allocation.slots.map(slot => slot.rank));
  const counted = skills.filter(s => slotRanks.has(s.rating) && (s.rating !== 0 || s.explicit));
  const ranks = allocation.slots.map(({ rank, count }) => {
    const actual = counted.filter(s => s.rating === rank).length;
    return { rank, expected: count, actual, status: actual === count ? "ok" as const : actual < count ? "under" as const : "over" as const };
  });
  const unexpected = skills.filter(s => s.rating !== 0 && !slotRanks.has(s.rating) && s.rating <= allocation.cap)
    .map(s => ({ id: s.id, rating: s.rating }));
  return {
    kind: "shape", ranks, overCap, unexpected,
    complete: ranks.every(r => r.status === "ok") && overCap.length === 0 && unexpected.length === 0,
  };
}

/** Column rule for growth: no rank above +1 may hold more skills than the rank below it. */
export function checkFateColumns(ratings: readonly number[]): { rank: number; count: number; below: number }[] {
  const counts = new Map<number, number>();
  for (const rating of ratings) if (rating > 0) counts.set(rating, (counts.get(rating) ?? 0) + 1);
  const top = Math.max(0, ...counts.keys());
  const violations: { rank: number; count: number; below: number }[] = [];
  for (let rank = 2; rank <= top; rank++) {
    const count = counts.get(rank) ?? 0;
    const below = counts.get(rank - 1) ?? 0;
    if (count > below) violations.push({ rank, count, below });
  }
  return violations;
}

// ---------------------------------------------------------------------------
// Catalog integrity (run by tests; exported for fixture authors).

export interface FatePresetLabels {
  presets: Record<string, string>;
  recipes: Record<string, string>;
  skillLists: Record<string, string>;
  skills: Record<string, string>;
  allocations: Record<string, string>;
  stress: Record<string, string>;
  tracks: Record<string, string>;
  injuryModels: Record<string, string>;
  slots: Record<string, string>;
  conditions: Record<string, string>;
  extreme: Record<string, string>;
  ratings: Record<string, string>;
  scale: Record<string, string>;
  scaleTiers: Record<string, string>;
  scaleModes: Record<string, string>;
}

export function validateFatePresetCatalog(
  catalog: FatePresetCatalog, options: { ruleIds?: ReadonlySet<string>; labels?: readonly FatePresetLabels[]; builtinSkillIds?: ReadonlySet<string> } = {},
): string[] {
  const issues: string[] = [];
  const unique = (what: string, ids: readonly string[]) => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) issues.push(`duplicate ${what} ${id}`);
      seen.add(id);
      if (id.includes(".")) issues.push(`${what} ${id} contains "." (message keys cannot)`);
    }
  };
  for (const axis of FATE_PRESET_AXES) unique(axis, fateAxisOptions(catalog, axis).map(o => o.id));
  unique("preset", catalog.presets.map(p => p.id));
  unique("recipe", catalog.recipes.map(r => r.id));
  for (const list of catalog.skillLists) {
    unique(`skill in ${list.id}`, list.skills);
    for (const skill of Object.values(list.trackLinks)) {
      if (skill && !list.skills.includes(skill)) issues.push(`${list.id} links missing skill ${skill}`);
    }
    if (list.suggestedAllocation && !catalog.allocations.some(a => a.id === list.suggestedAllocation)) {
      issues.push(`${list.id} suggests unknown allocation ${list.suggestedAllocation}`);
    }
  }
  const hasOption = (axis: FatePresetAxis, id: string) => fateAxisOptions(catalog, axis).some(o => o.id === id);
  for (const preset of catalog.presets) {
    for (const axis of FATE_PRESET_AXES) if (!hasOption(axis, preset.axes[axis])) issues.push(`${preset.id}.${axis} → ${preset.axes[axis]}`);
  }
  if (!catalog.presets.some(p => p.id === catalog.defaultPreset)) issues.push(`default preset ${catalog.defaultPreset} missing`);
  for (const recipe of catalog.recipes) {
    if (!recipe.choose === !recipe.set) issues.push(`recipe ${recipe.id} needs exactly one of choose/set`);
    for (const [axis, value] of Object.entries({ ...recipe.set, ...recipe.suggest }) as [FatePresetAxis, string][]) {
      if (!FATE_PRESET_AXES.includes(axis) || !hasOption(axis, value)) issues.push(`recipe ${recipe.id} → ${axis}:${value}`);
    }
  }
  for (const model of catalog.injuryModels) {
    if (model.kind === "conditions") unique(`condition in ${model.id}`, model.conditions.map(c => c.id));
    else unique(`slot in ${model.id}`, [...model.slots, ...model.extraSlots].map(s => s.id));
  }
  for (const stress of catalog.stress) {
    const mins = stress.thresholds.map(t => t.min);
    if (mins.some((min, i) => i > 0 && min <= mins[i - 1])) issues.push(`${stress.id} thresholds not ascending`);
  }
  if (options.ruleIds) {
    const cited = (options: readonly { id: string; cite?: FateCite; enabled?: boolean }[]) =>
      options.filter(o => o.enabled !== false).map(o => [o.id, o.cite] as const);
    const cites = [
      ...cited(catalog.skillLists), ...cited(catalog.allocations), ...cited(catalog.stress), ...cited(catalog.injuryModels),
      ...cited(catalog.extreme), ...cited(catalog.ratings), ...cited(catalog.scale), ...cited(catalog.presets), ...cited(catalog.recipes),
      ["growth", catalog.growth.cite], ["economy", catalog.economy.cite], ["recovery", catalog.recovery.cite], ["advancement", catalog.advancement.cite],
    ] as const;
    for (const [id, cite] of cites) {
      if (cite === undefined) {
        issues.push(`${id} has no cite`);
        continue;
      }
      if (!options.ruleIds.has(cite.rule)) issues.push(`${id} cites unknown rule ${cite.rule}`);
      if (!/^\d+(-\d+)?$/.test(cite.srd)) issues.push(`${id} has malformed srd range ${cite.srd}`);
    }
  }
  for (const labels of options.labels ?? []) {
    const need = (group: keyof FatePresetLabels, ids: readonly string[]) => {
      for (const id of ids) if (typeof labels[group]?.[id] !== "string" || labels[group][id].trim() === "") issues.push(`label ${group}.${id} missing`);
    };
    need("presets", catalog.presets.map(p => p.id));
    need("recipes", catalog.recipes.map(r => r.id));
    need("skillLists", catalog.skillLists.map(l => l.id));
    need("skills", catalog.skillLists.flatMap(l => l.skills).filter(id => !options.builtinSkillIds?.has(id)));
    need("allocations", catalog.allocations.map(a => a.id));
    need("stress", catalog.stress.map(s => s.id));
    need("tracks", catalog.stress.flatMap(s => s.tracks.map(t => t.id)));
    need("injuryModels", catalog.injuryModels.map(m => m.id));
    need("slots", [...catalog.injuryModels.flatMap(m => m.kind === "consequences" ? [...m.slots, ...m.extraSlots].map(s => s.id) : []), "extreme"]);
    need("conditions", catalog.injuryModels.flatMap(m => m.kind === "conditions" ? m.conditions.map(c => c.id) : []));
    need("extreme", catalog.extreme.map(o => o.id));
    need("ratings", catalog.ratings.map(o => o.id));
    need("scale", catalog.scale.map(o => o.id));
    need("scaleTiers", catalog.scale.flatMap(o => o.tiers));
    need("scaleModes", catalog.scale.flatMap(o => o.modes.map(m => m.id)));
  }
  return issues;
}
