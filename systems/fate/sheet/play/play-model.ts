/**
 * The B play view's reading of a Fate Condensed character: who may see which aspect, the skill
 * ladder, the spread hint and the compact vitals summary. Pure functions over the stored record
 * (v1 or v2 shape, through the F1 readers), so the rules are tested without rendering. Writes go
 * through the F1 updaters inside the host's functional `setData`.
 */
import type { FateSkillPyramidField } from "@skald/types/schema";
import type { FateAspectKind, FateCharacterData } from "../../domain/character";
import type { FateHarmModel } from "../../domain/harm";
import { fateRecord, readFateAspects, readFateResources } from "../../domain/normalize";
import { checkFateAllocation, type FateAllocationOption, type FateRosterSkill, type FateSeverityId } from "../../domain/presets";

/**
 * Fields of the 1.0.0 built-in schema that the play view reads or writes; v2 keeps all of them
 * (its `fateV2` root is optional), so an old Template Version still gets the view. `resetButton`
 * (v1 only) is deliberately absent: the view never offers a destructive reset.
 */
export const FATE_PLAY_FIELDS = [
  "name", "player", "description", "portrait",
  "highConcept", "trouble", "relationship", "freeAspect1", "freeAspect2", "aspects",
  "refresh", "fatePoints", "skills",
  "physicalStress", "mentalStress", "mildConsequence", "moderateConsequence", "severeConsequence", "extraMildConsequence",
  "stunts", "extras", "notes",
] as const;

// ---------------------------------------------------------------------------
// Aspects and who may read them
// ---------------------------------------------------------------------------

/**
 * Whether this viewer is known to be the owner or the GM. Nothing supplies `authorized` yet
 * (plan C2): until a host passes a verified capability, every secret aspect stays hidden.
 */
export type FateSecretAccess = "unknown" | "authorized";

export const PERMANENT_ASPECT_KINDS: ReadonlySet<FateAspectKind> = new Set(["highConcept", "trouble", "relationship", "free"]);

export interface FatePlayAspect {
  id: string;
  kind: FateAspectKind;
  /** Empty when hidden: the stored text never reaches the projection. */
  text: string;
  freeInvokes: number;
  secret: boolean;
  /** A secret row this viewer may not read: a face-down card with no text, label or conflict. */
  hidden: boolean;
  /** The player's own label for the card, instead of the kind's name. */
  label?: string;
  /** An older flat value still stored beside the row (v1 collision), shown under the text. */
  conflict?: string;
}

/** The common projection every surface reads: secret text is dropped here, not in the markup. */
export function projectFatePlayAspects(data: FateCharacterData, access: FateSecretAccess): { permanent: FatePlayAspect[]; held: FatePlayAspect[] } {
  const { rows, conflicts } = readFateAspects(data);
  const permanent: FatePlayAspect[] = [];
  const held: FatePlayAspect[] = [];
  for (const row of rows) {
    const hidden = row.secret && access !== "authorized";
    const aspect: FatePlayAspect = { id: row.id, kind: row.kind, text: hidden ? "" : row.text, freeInvokes: row.freeInvokes, secret: row.secret, hidden };
    if (!hidden) {
      if (row.labelOverride) aspect.label = row.labelOverride;
      const conflict = conflicts.find((candidate) => candidate.id === row.id);
      if (conflict) aspect.conflict = conflict.flatText;
    }
    (PERMANENT_ASPECT_KINDS.has(row.kind) ? permanent : held).push(aspect);
  }
  return { permanent, held };
}

/** The first readable high concept, for the identity line; a secret one shows nothing. */
export function visibleHighConcept(aspects: readonly FatePlayAspect[]): string {
  return aspects.find((aspect) => aspect.kind === "highConcept" && !aspect.hidden && aspect.text.trim())?.text.trim() ?? "";
}

// ---------------------------------------------------------------------------
// Skills and the ladder
// ---------------------------------------------------------------------------

export interface FatePlaySkill {
  id: string;
  rating: number;
  /** The player's own name; stock skills without one read their translated name. */
  customName?: string;
}

interface StoredSkill {
  id: string;
  name?: string;
  level?: number;
  isCustomName?: boolean;
}

function storedSkills(data: FateCharacterData): StoredSkill[] {
  const list = fateRecord(data.skills).skills;
  if (!Array.isArray(list)) return [];
  return list.flatMap((value) => {
    const row = fateRecord(value);
    return typeof row.id === "string" && row.id.trim()
      ? [{ id: row.id, name: typeof row.name === "string" ? row.name : undefined, level: typeof row.level === "number" && Number.isSafeInteger(row.level) ? row.level : undefined, isCustomName: row.isCustomName === true }]
      : [];
  });
}

/**
 * The roster in the field's stored order: the schema's stock skills (rated or +0) and the
 * character's own. A stock skill's saved name counts as the player's only when it differs from
 * the schema's stock name (the old renderer saves the stock name with every rating).
 */
export function readFatePlaySkills(data: FateCharacterData, field: FateSkillPyramidField | undefined): FatePlaySkill[] {
  const stock = field?.defaultSkills ?? [];
  const stockName = new Map(stock.map((skill) => [skill.id, skill.name]));
  const rows = storedSkills(data);
  const byId = new Map(rows.map((row) => [row.id, row]));
  const ids = [...stock.map((skill) => skill.id), ...rows.map((row) => row.id).filter((id) => !stockName.has(id))];
  const order = fateRecord(data.skills).skillOrder;
  const position = new Map((Array.isArray(order) ? order : []).map((id, index) => [id, index] as const));
  const ordered = ids
    .map((id, index) => ({ id, index }))
    .sort((a, b) => (position.get(a.id) ?? Infinity) - (position.get(b.id) ?? Infinity) || a.index - b.index);
  return [...new Set(ordered.map(({ id }) => id))].map((id) => {
    const row = byId.get(id);
    const skill: FatePlaySkill = { id, rating: row?.level ?? 0 };
    const name = row?.name?.trim();
    if (name && (row?.isCustomName || !stockName.has(id) || name !== stockName.get(id))) skill.customName = name;
    return skill;
  });
}

export type FateLadderRow =
  | { kind: "rung"; rating: number; skills: FatePlaySkill[] }
  /** Empty outer rungs, folded into one line (frame 03: +8 傳奇 ～ +5 卓越). */
  | { kind: "collapsed"; from: number; to: number };

/** Rungs always shown even when empty: the pyramid's working range. */
const CORE_RUNGS = [4, 3, 2, 1] as const;

/**
 * Top to bottom: empty rungs above the highest rated skill folded, every rung from there to +1,
 * +0 (compact list) and any negative rung that holds a skill.
 */
export function fateLadderRows(skills: readonly FatePlaySkill[]): FateLadderRow[] {
  const byRating = new Map<number, FatePlaySkill[]>();
  for (const skill of skills) byRating.set(skill.rating, [...(byRating.get(skill.rating) ?? []), skill]);
  const highest = Math.max(CORE_RUNGS[0], ...skills.map((skill) => skill.rating));
  const top = Math.max(8, highest);
  const rows: FateLadderRow[] = [];
  if (top > highest) rows.push({ kind: "collapsed", from: top, to: highest + 1 });
  for (let rating = highest; rating >= 0; rating -= 1) rows.push({ kind: "rung", rating, skills: byRating.get(rating) ?? [] });
  const lowest = Math.min(0, ...skills.map((skill) => skill.rating));
  for (let rating = -1; rating >= lowest; rating -= 1) {
    const at = byRating.get(rating);
    if (at) rows.push({ kind: "rung", rating, skills: at });
  }
  return rows;
}

export type FateSpreadHint =
  /** Every column at its count; blanks are allowed, so this is guidance, never a lock. */
  | { kind: "shape"; complete: boolean; columns: { rating: number; filled: number; required: number }[] }
  | { kind: "pointBuy"; complete: boolean; spent: number; budget: number };

/**
 * The active allocation (pyramid, diamond, approach spread or point buy) against the active
 * roster, through the preset rules' own check: an explicit +0 counts toward a +0 slot.
 */
export function fateSpreadHint(skills: readonly FateRosterSkill[], allocation: FateAllocationOption): FateSpreadHint {
  const report = checkFateAllocation(skills, allocation);
  if (report.kind === "pointBuy") return { kind: "pointBuy", complete: report.complete, spent: report.spent, budget: report.budget };
  return {
    kind: "shape",
    complete: report.complete,
    columns: report.ranks.map(({ rank, expected, actual }) => ({ rating: rank, filled: actual, required: expected })),
  };
}

/**
 * The ladder's roster for the active preset: the rules' list (stock, approaches or a short list)
 * plus the character's own skills, in stored order, without hidden ones. Names follow the old
 * reading: a stock skill's saved name is the player's only when it differs from the stock name.
 */
export function projectFatePlaySkills(data: FateCharacterData, field: FateSkillPyramidField | undefined, active: readonly FateRosterSkill[]): FatePlaySkill[] {
  const named = new Map(readFatePlaySkills(data, field).map((skill) => [skill.id, skill.customName]));
  return active.map((skill) => {
    const projected: FatePlaySkill = { id: skill.id, rating: skill.rating };
    const name = named.get(skill.id);
    if (name) projected.customName = name;
    return projected;
  });
}

// ---------------------------------------------------------------------------
// Vitals summary (sticky status strip)
// ---------------------------------------------------------------------------

export interface FateVitalsSummary {
  fatePoints: number;
  refresh: number;
  /** The active stress tracks (split or unified): marked boxes within the current capacity. */
  tracks: { id: string; marked: number; boxes: number }[];
  injuryKind: FateHarmModel["injuryKind"];
  /** Consequences taken, or conditions marked, mildest first. */
  injuries: { id: string; severity: FateSeverityId | "extreme"; text?: string }[];
}

/** What the sticky strip shows, from the preset projection the vitals card also reads. */
export function readFateVitalsSummary(data: FateCharacterData, harm: FateHarmModel): FateVitalsSummary {
  const resources = readFateResources(data);
  const tracks = harm.stress.map((track) => ({ id: track.id, marked: track.marks.filter((mark) => mark <= track.capacity).length, boxes: track.capacity }));
  const injuries: FateVitalsSummary["injuries"] = harm.injuryKind === "consequences"
    ? harm.slots.filter((slot) => slot.occupied).map((slot) => ({ id: slot.id, severity: slot.severity, text: slot.text.trim() }))
    : harm.conditions.filter((condition) => condition.boxes.some((box) => box.marked)).map((condition) => ({ id: condition.id, severity: condition.severity }));
  return { fatePoints: resources.fatePoints, refresh: resources.effectiveRefresh, tracks, injuryKind: harm.injuryKind, injuries };
}
