import type { FateAspectRow, FateExtremeInjury, FateInjury } from "./character";
import { refuse, type FateCommandContext, type FateHitKind, type FateVerdict } from "./engine";
import type { FateRules, FateSeverityId } from "./presets";

/**
 * Harm as stored, keyed by the fixture's own IDs: stress by track ID, consequence text by slot ID
 * (`mild`, `extraMild-physical`, …), condition marks by condition ID. Callers adapt `readFateHarm`.
 */
export interface FateHarmInput {
  stress: Readonly<Record<string, readonly number[]>>;
  consequences: Readonly<Record<string, string>>;
  /** Legacy v1 extra mild text not yet assigned to a track. */
  legacyExtraMild?: string;
  /** Marked 1-based box indices per condition ID. */
  conditions: Readonly<Record<string, readonly number[]>>;
  extreme?: Pick<FateExtremeInjury, "majorMilestoneSequence">;
  majorMilestoneSequence: number;
}

/** Condition box key inside `fateV2.harm.conditions`; presence marks the box. */
export const fateConditionBoxKey = (conditionId: string, index: number) => `${conditionId}:${index}`;

export function readFateConditionMarks(stored: Readonly<Record<string, unknown>>): Record<string, number[]> {
  const marks: Record<string, number[]> = {};
  for (const key of Object.keys(stored)) {
    const match = /^(.+):(\d+)$/.exec(key);
    const index = match ? Number(match[2]) : 0;
    if (!match || !Number.isSafeInteger(index) || index < 1) continue;
    (marks[match[1]] ??= []).push(index);
  }
  for (const list of Object.values(marks)) list.sort((a, b) => a - b);
  return marks;
}

export interface FateStressTrackState {
  id: string;
  hitKinds: FateHitKind[];
  capacity: number;
  /** Every stored mark, including ones beyond the current capacity. */
  marks: number[];
  free: number[];
  outOfCap: number[];
}

export interface FateSlotState {
  id: string;
  kind: "consequence" | "extreme";
  severity: FateSeverityId | "extreme";
  value: number;
  /** Null: any hit may use it. */
  hitKinds: FateHitKind[] | null;
  extra: boolean;
  text: string;
  occupied: boolean;
  blocked: null | "legacyUnassigned" | "extremeUsed";
}

export interface FateConditionBox { index: number; hitKinds: FateHitKind[] | null; marked: boolean; extra: boolean }
export interface FateConditionState {
  id: string;
  severity: FateSeverityId;
  value: number;
  row: string;
  boxes: FateConditionBox[];
  outOfCap: number[];
}

export type FateHarmItem =
  | { kind: "stress"; trackId: string; index: number }
  | { kind: "consequence"; slotId: string; text: string }
  | { kind: "condition"; conditionId: string; index: number };

export interface FateHarmModel {
  injuryKind: FateRules["injuries"]["kind"];
  stress: FateStressTrackState[];
  slots: FateSlotState[];
  conditions: FateConditionState[];
  rows: { id: string; cutoff: number; marked: number }[];
  extreme: { enabled: boolean; active: boolean; available: boolean; protectedKinds: string[] };
  legacyExtraMild?: string;
  /** Harm that counts now. */
  active: FateHarmItem[];
  /** Harm kept in storage that this model does not count: shown, never treated as free capacity. */
  inactive: FateHarmItem[];
}

const harmItemKey = (item: FateHarmItem) =>
  item.kind === "stress" ? `stress:${item.trackId}:${item.index}`
    : item.kind === "consequence" ? `consequence:${item.slotId}` : `condition:${item.conditionId}:${item.index}`;

function stressCapacity(option: FateRules["stress"], ratings: number[]): number {
  if (ratings.length === 0) return option.defaultBoxes;
  const rating = Math.max(...ratings);
  let boxes = option.defaultBoxes;
  for (const threshold of option.thresholds) if (rating >= threshold.min) boxes = threshold.boxes;
  return boxes;
}

const linked = (links: Partial<Record<FateHitKind, number>>, kind: FateHitKind | undefined, min: number | undefined) =>
  kind !== undefined && min !== undefined && links[kind] !== undefined && (links[kind] as number) >= min;

const hasText = (value: string | undefined) => typeof value === "string" && value.trim() !== "";

/**
 * Effective harm capacity for these rules and link-skill ratings (see `fateLinkRatings`).
 * Pure projection: inactive or out-of-cap harm is listed, not dropped or converted.
 */
export function resolveFateHarmModel(
  rules: Pick<FateRules, "stress" | "injuries" | "extreme">, links: Partial<Record<FateHitKind, number>>, harm: FateHarmInput,
): FateHarmModel {
  const active: FateHarmItem[] = [];
  const inactive: FateHarmItem[] = [];
  const stress = rules.stress.tracks.map((track): FateStressTrackState => {
    const capacity = stressCapacity(rules.stress, track.links.flatMap(kind => links[kind] === undefined ? [] : [links[kind] as number]));
    const marks = [...new Set(harm.stress[track.id] ?? [])].sort((a, b) => a - b);
    const marked = new Set(marks);
    for (const index of marks) (index <= capacity ? active : inactive).push({ kind: "stress", trackId: track.id, index });
    return {
      id: track.id, hitKinds: track.hitKinds, capacity, marks,
      free: Array.from({ length: capacity }, (_, i) => i + 1).filter(i => !marked.has(i)),
      outOfCap: marks.filter(i => i > capacity),
    };
  });
  for (const [trackId, marks] of Object.entries(harm.stress)) {
    if (!stress.some(track => track.id === trackId)) for (const index of marks) inactive.push({ kind: "stress", trackId, index });
  }

  const slots: FateSlotState[] = [];
  const conditions: FateConditionState[] = [];
  const rows: FateHarmModel["rows"] = [];
  const legacy = hasText(harm.legacyExtraMild) ? harm.legacyExtraMild : undefined;
  const model = rules.injuries;
  if (model.kind === "consequences") {
    const consequence = (slot: (typeof model.slots)[number], extra: boolean): FateSlotState => {
      const text = harm.consequences[slot.id] ?? "";
      return {
        id: slot.id, kind: "consequence", severity: slot.severity, value: slot.value, hitKinds: slot.hitKinds ?? null, extra,
        text, occupied: hasText(text), blocked: extra && legacy !== undefined ? "legacyUnassigned" : null,
      };
    };
    slots.push(...model.slots.map(slot => consequence(slot, false)));
    slots.push(...model.extraSlots.filter(slot => linked(links, slot.link, slot.min)).map(slot => consequence(slot, true)));
  } else {
    const cutoffs = new Map<string, number>();
    for (const condition of model.conditions) {
      const extra = condition.extraBoxes && linked(links, condition.extraBoxes.link, condition.extraBoxes.min) ? condition.extraBoxes : undefined;
      const marks = new Set(harm.conditions[condition.id] ?? []);
      const boxes: FateConditionBox[] = [
        ...Array.from({ length: condition.boxes }, (_, i) => ({ index: i + 1, hitKinds: condition.hitKinds ?? null, marked: false, extra: false })),
        ...Array.from({ length: extra?.count ?? 0 }, (_, i) => ({ index: condition.boxes + i + 1, hitKinds: extra?.hitKinds ?? null, marked: false, extra: true })),
      ].map(box => ({ ...box, marked: marks.has(box.index) }));
      const outOfCap = [...marks].filter(i => i > boxes.length).sort((a, b) => a - b);
      for (const index of [...marks].sort((a, b) => a - b)) {
        (index <= boxes.length ? active : inactive).push({ kind: "condition", conditionId: condition.id, index });
      }
      conditions.push({ id: condition.id, severity: condition.severity, value: condition.value, row: condition.row, boxes, outOfCap });
      if (model.rowCutoff !== undefined) cutoffs.set(condition.row, (cutoffs.get(condition.row) ?? model.rowCutoff) + (extra?.count ?? 0));
    }
    for (const [id, cutoff] of cutoffs) {
      const marked = conditions.filter(c => c.row === id).reduce((sum, c) => sum + c.boxes.filter(b => b.marked).length, 0);
      rows.push({ id, cutoff, marked });
    }
  }
  for (const [conditionId, marks] of Object.entries(harm.conditions)) {
    if (!conditions.some(c => c.id === conditionId)) for (const index of marks) inactive.push({ kind: "condition", conditionId, index });
  }

  const extremeOption = rules.extreme;
  const extremeActive = extremeOption.enabled && extremeOption.activeWithKinds.includes(model.kind);
  const extremeAvailable = extremeActive && (!harm.extreme || harm.extreme.majorMilestoneSequence < harm.majorMilestoneSequence);
  if (extremeOption.enabled && extremeActive) {
    slots.push({
      id: "extreme", kind: "extreme", severity: "extreme", value: extremeOption.value, hitKinds: null, extra: false,
      text: "", occupied: false, blocked: extremeAvailable ? null : "extremeUsed",
    });
  }
  for (const slot of slots) if (slot.occupied) active.push({ kind: "consequence", slotId: slot.id, text: slot.text });
  for (const [slotId, text] of Object.entries(harm.consequences)) {
    if (hasText(text) && !slots.some(slot => slot.id === slotId)) inactive.push({ kind: "consequence", slotId, text });
  }

  return {
    injuryKind: model.kind, stress, slots, conditions, rows,
    extreme: { enabled: extremeOption.enabled, active: extremeActive, available: extremeAvailable, protectedKinds: extremeOption.enabled ? extremeOption.protectedKinds : [] },
    ...(legacy !== undefined ? { legacyExtraMild: legacy } : {}),
    active, inactive,
  };
}

export interface FateHarmPlan {
  /** Canonical cell list; identical on recompute only while the same cells are still free. */
  key: string;
  shifts: number;
  hitKind: FateHitKind;
  stress: { trackId: string; boxes: number[] } | null;
  slots: string[];
  conditions: { conditionId: string; boxes: number[] }[];
  absorbed: number;
  excess: number;
  /** New consequence slots that need text before confirming. */
  needsText: string[];
  replacesAspect: boolean;
}

export type FateHarmOptions =
  | { kind: "noHit" }
  | { kind: "plans"; plans: FateHarmPlan[]; maxAbsorb: number }
  | { kind: "takenOut"; maxAbsorb: number; shortfall: number };

interface ConditionGroup { condition: FateConditionState; free: FateConditionBox[] }

/**
 * Every legal way to absorb a hit: unit stress cells are grouped by count (lowest free indices),
 * slots and condition boxes by their actual IDs. A plan never spends a resource it does not need:
 * dropping any one of its cells leaves the hit uncovered (so a severe alone may absorb 4).
 * Taking the hit is left to the player; no plan is preselected.
 */
export function planFateHarm(model: FateHarmModel, shifts: number, hitKind: FateHitKind): FateHarmOptions {
  if (!Number.isSafeInteger(shifts) || shifts <= 0) return { kind: "noHit" };
  const eligible = (kinds: FateHitKind[] | null) => kinds === null || kinds.includes(hitKind);
  const track = model.stress.find(t => t.hitKinds.includes(hitKind));
  const freeStress = track?.free ?? [];
  const slots = model.slots.filter(slot => !slot.occupied && slot.blocked === null && eligible(slot.hitKinds));
  const groups: ConditionGroup[] = model.conditions
    .map(condition => ({ condition, free: condition.boxes.filter(box => !box.marked && eligible(box.hitKinds)) }))
    .filter(group => group.free.length > 0);
  const rowRoom = new Map(model.rows.map(row => [row.id, Math.max(0, row.cutoff - row.marked)]));

  const plans: FateHarmPlan[] = [];
  const counts = new Array<number>(groups.length).fill(0);
  const visit = (groupIndex: number) => {
    if (groupIndex < groups.length) {
      for (let count = 0; count <= groups[groupIndex].free.length; count++) {
        counts[groupIndex] = count;
        visit(groupIndex + 1);
      }
      counts[groupIndex] = 0;
      return;
    }
    const used = new Map<string, number>();
    groups.forEach((group, i) => used.set(group.condition.row, (used.get(group.condition.row) ?? 0) + counts[i]));
    for (const [row, count] of used) if (rowRoom.has(row) && count > (rowRoom.get(row) as number)) return;
    const conditionValue = groups.reduce((sum, group, i) => sum + counts[i] * group.condition.value, 0);
    for (let mask = 0; mask < 1 << slots.length; mask++) {
      const chosen = slots.filter((_, i) => mask & (1 << i));
      const other = conditionValue + chosen.reduce((sum, slot) => sum + slot.value, 0);
      const stressCount = Math.max(0, shifts - other);
      if (stressCount > freeStress.length) continue;
      const values = [...chosen.map(s => s.value), ...groups.flatMap((g, i) => counts[i] > 0 ? [g.condition.value] : [])];
      if (stressCount > 0) values.push(1);
      if (values.length === 0) continue;
      const absorbed = other + stressCount;
      if (absorbed - Math.min(...values) >= shifts) continue;
      const conditions = groups.flatMap((g, i) => counts[i] > 0 ? [{ conditionId: g.condition.id, boxes: g.free.slice(0, counts[i]).map(b => b.index) }] : []);
      const stress = stressCount > 0 && track ? { trackId: track.id, boxes: freeStress.slice(0, stressCount) } : null;
      const key = [
        ...(stress ? [`stress:${stress.trackId}:${stress.boxes.join(",")}`] : []),
        ...chosen.map(s => `slot:${s.id}`),
        ...conditions.map(c => `condition:${c.conditionId}:${c.boxes.join(",")}`),
      ].join("|");
      plans.push({
        key, shifts, hitKind, stress, slots: chosen.map(s => s.id), conditions, absorbed, excess: absorbed - shifts,
        needsText: chosen.filter(s => s.kind === "consequence").map(s => s.id), replacesAspect: chosen.some(s => s.kind === "extreme"),
      });
    }
  };
  visit(0);

  const maxConditions = (() => {
    let total = 0;
    const byRow = new Map<string, number[]>();
    for (const group of groups) {
      const values = group.free.map(() => group.condition.value);
      if (rowRoom.has(group.condition.row)) byRow.set(group.condition.row, [...(byRow.get(group.condition.row) ?? []), ...values]);
      else total += values.reduce((a, b) => a + b, 0);
    }
    for (const [row, values] of byRow) total += values.sort((a, b) => b - a).slice(0, rowRoom.get(row)).reduce((a, b) => a + b, 0);
    return total;
  })();
  const maxAbsorb = freeStress.length + slots.reduce((sum, s) => sum + s.value, 0) + maxConditions;
  if (plans.length === 0) return { kind: "takenOut", maxAbsorb, shortfall: shifts - maxAbsorb };
  const cells = (plan: FateHarmPlan) => plan.slots.length + plan.conditions.reduce((n, c) => n + c.boxes.length, 0);
  plans.sort((a, b) => cells(a) - cells(b) || a.excess - b.excess || (a.stress?.boxes.length ?? 0) - (b.stress?.boxes.length ?? 0) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return { kind: "plans", plans, maxAbsorb };
}

export interface FateHarmDelta {
  /** Full next marks per changed track (existing and out-of-cap marks kept). */
  stress: Record<string, number[]>;
  /** New consequence text and its metadata per slot ID. */
  consequences: Record<string, FateInjury>;
  /** New condition boxes keyed by `fateConditionBoxKey`. */
  conditions: Record<string, FateInjury>;
  extreme?: FateExtremeInjury;
  aspectReplacement?: { aspectId: string; text: string };
}

export type FateHarmRefusal = "readOnly" | "stale" | "missingText" | "extremeTarget" | "extremeText";

/**
 * Confirm a plan against the current model (recomputed by the caller from current data): the
 * same cells must still be free and legal, new consequences need text, and an extreme
 * consequence needs a replaceable aspect. The attacker's free invoke on a new consequence is
 * recorded as an external claim hint, not a counter this character can spend.
 */
export function confirmFateHarm(
  model: FateHarmModel,
  input: {
    plan: FateHarmPlan;
    texts: Readonly<Record<string, string>>;
    extreme?: { aspectId: string; text: string };
    aspects: readonly Pick<FateAspectRow, "id" | "kind">[];
    readOnly: boolean;
    majorMilestoneSequence: number;
  },
  context: FateCommandContext,
): FateVerdict<{ delta: FateHarmDelta }, FateHarmRefusal> {
  const { plan } = input;
  if (input.readOnly) return refuse("readOnly");
  const current = planFateHarm(model, plan.shifts, plan.hitKind);
  if (current.kind !== "plans" || !current.plans.some(p => p.key === plan.key)) return refuse("stale");
  const missing = plan.needsText.filter(slotId => !hasText(input.texts[slotId]));
  if (missing.length) return refuse("missingText", { slots: missing });
  const delta: FateHarmDelta = { stress: {}, consequences: {}, conditions: {} };
  if (plan.replacesAspect) {
    const target = input.extreme && input.aspects.find(a => a.id === input.extreme?.aspectId);
    const replaceable = target && target.kind !== "situation" && target.kind !== "boost" && !model.extreme.protectedKinds.includes(target.kind);
    if (!input.extreme || !replaceable) return refuse("extremeTarget");
    if (!hasText(input.extreme.text)) return refuse("extremeText");
    delta.extreme = {
      aspectId: input.extreme.aspectId, text: input.extreme.text, operationId: context.operationId,
      majorMilestoneSequence: input.majorMilestoneSequence,
    };
    delta.aspectReplacement = { aspectId: input.extreme.aspectId, text: input.extreme.text };
  }
  if (plan.stress) {
    const track = model.stress.find(t => t.id === plan.stress?.trackId);
    delta.stress[plan.stress.trackId] = [...new Set([...(track?.marks ?? []), ...plan.stress.boxes])].sort((a, b) => a - b);
  }
  for (const slotId of plan.needsText) {
    const text = input.texts[slotId];
    delta.consequences[slotId] = { text, metadata: { injuryId: `${context.operationId}:${slotId}`, injuryText: text, externalClaim: true } };
  }
  for (const { conditionId, boxes } of plan.conditions) {
    for (const index of boxes) {
      const key = fateConditionBoxKey(conditionId, index);
      delta.conditions[key] = { text: key, metadata: { injuryId: `${context.operationId}:${key}`, injuryText: key, externalClaim: true } };
    }
  }
  return { ok: true, delta };
}

/**
 * Switching rules must not bury current harm: refused while anything active now would be
 * inactive (or gone) under the next model. Clear or reconcile it first; nothing converts.
 */
export function checkFateHarmSwitch(current: FateHarmModel, next: FateHarmModel):
  FateVerdict<{ retainedInactive: FateHarmItem[] }, "activeHarm"> {
  const nextActive = new Set(next.active.map(harmItemKey));
  const blockers = current.active.filter(item => !nextActive.has(harmItemKey(item)));
  if (blockers.length) return refuse("activeHarm", { blockers });
  return { ok: true, retainedInactive: next.inactive };
}

/** Give the unassigned legacy extra mild consequence to one eligible, empty extra slot. */
export function assignFateLegacyExtraMild(model: FateHarmModel, slotId: string, readOnly: boolean):
  FateVerdict<{ consequence: { slotId: string; text: string }; clearLegacy: true }, "readOnly" | "noLegacy" | "notExtraSlot" | "occupied"> {
  if (readOnly) return refuse("readOnly");
  if (model.legacyExtraMild === undefined) return refuse("noLegacy");
  const slot = model.slots.find(s => s.id === slotId);
  if (!slot || !slot.extra) return refuse("notExtraSlot");
  if (slot.occupied) return refuse("occupied");
  return { ok: true, consequence: { slotId, text: model.legacyExtraMild }, clearLegacy: true };
}

/** Stress cleared at a scene end: every stored track, including inactive and out-of-cap marks. */
export function clearFateStress(model: FateHarmModel): Record<string, number[]> {
  const tracks = new Set([...model.active, ...model.inactive].flatMap(item => item.kind === "stress" ? [item.trackId] : []));
  return Object.fromEntries([...tracks].map(id => [id, []]));
}
