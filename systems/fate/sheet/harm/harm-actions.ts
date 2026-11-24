import { FATE_CONSEQUENCE_FIELDS, type FateCharacterData, type FateInjury } from "../../domain/character";
import type { FateCommandContext, FateHitKind } from "../../domain/engine";
import { assignFateLegacyExtraMild, confirmFateHarm, fateConditionBoxKey, planFateHarm, type FateHarmPlan } from "../../domain/harm";
import { fateRecoveryStatus, treatFateInjury, type FateInjuryRef } from "../../domain/lifecycle";
import { fateRecord, updateFateAspects, updateFateSplitStress } from "../../domain/normalize";
import type { FatePresetCatalog } from "../../domain/presets";
import { projectFatePlayAspects, type FateSecretAccess } from "../play/play-model";
import { projectFateSheet } from "../presets/sheet-state";

type Sheet = ReturnType<typeof projectFateSheet>;

export interface IncomingFateHit { kind: FateHitKind; shifts: number; armor: number; useArmor: boolean }

export function planIncomingHarm(sheet: Sheet, hit: IncomingFateHit) {
  const ratings = sheet.rules.ratings;
  const armor = hit.useArmor ? hit.armor : 0;
  if (!Number.isSafeInteger(hit.shifts) || hit.shifts < 1 || hit.useArmor &&
    (!ratings.enabled || !Number.isSafeInteger(armor) || armor < ratings.min || armor > ratings.max)) return { kind: "invalid" as const };
  const net = Math.max(0, hit.shifts - armor);
  return { ...planFateHarm(sheet.harm, net, hit.kind), net };
}

function updateHarm(data: FateCharacterData, update: (harm: Record<string, unknown>) => Record<string, unknown>) {
  const v2 = fateRecord(data.fateV2);
  return { ...data, fateV2: { ...v2, harm: update(fateRecord(v2.harm)) } };
}

function writeStress(data: FateCharacterData, trackId: string, marks: number[]): FateCharacterData {
  if (trackId === "physical" || trackId === "mental") return updateFateSplitStress(data, `${trackId}Stress`, () => marks);
  return trackId === "unified" ? updateHarm(data, harm => ({ ...harm, unifiedStress: marks })) : data;
}

export function setStressMark(data: FateCharacterData, catalog: FatePresetCatalog, trackId: string, index: number, marked: boolean, editable: boolean) {
  if (!editable) return data;
  const track = projectFateSheet(data, catalog).harm.stress.find(t => t.id === trackId);
  if (!track || !Number.isSafeInteger(index) || index < 1 || index > track.capacity || track.marks.includes(index) === marked) return data;
  return writeStress(data, trackId, marked ? [...track.marks, index].sort((a, b) => a - b) : track.marks.filter(mark => mark !== index));
}

function writeInjury(data: FateCharacterData, key: string, injury: FateInjury | null): FateCharacterData {
  const write = (group: unknown, id: string, value: unknown) => {
    const next = { ...fateRecord(group) };
    if (value === undefined) delete next[id];
    else next[id] = value;
    return next;
  };
  if (key === "mild" || key === "moderate" || key === "severe") {
    return updateHarm({ ...data, [FATE_CONSEQUENCE_FIELDS[key]]: injury?.text ?? "" }, harm => ({
      ...harm, consequences: write(harm.consequences, key, injury?.metadata),
    }));
  }
  if (key === "extraMild-physical" || key === "extraMild-mental") {
    return updateHarm(data, harm => ({ ...harm, extraMild: write(harm.extraMild, key.slice("extraMild-".length), injury ?? undefined) }));
  }
  return updateHarm(data, harm => ({ ...harm, conditions: write(harm.conditions, key, injury ?? undefined) }));
}

export interface FateIncomingConfirmation {
  hit: IncomingFateHit;
  plan: FateHarmPlan;
  texts: Readonly<Record<string, string>>;
  extreme?: { aspectId: string; text: string; previousText: string };
}

/** Resolve the same option again on the live record; the submitted key is never itself a delta. */
export function applyIncomingHarm(data: FateCharacterData, catalog: FatePresetCatalog, input: FateIncomingConfirmation, operation: FateCommandContext, editable: boolean, access: FateSecretAccess): FateCharacterData {
  if (!editable) return data;
  const state = projectFateSheet(data, catalog);
  const current = planIncomingHarm(state, input.hit);
  if (current.kind !== "plans" || current.net !== input.plan.shifts || input.hit.kind !== input.plan.hitKind) return data;
  const plan = current.plans.find(candidate => candidate.key === input.plan.key && candidate.absorbed === input.plan.absorbed);
  if (!plan) return data;
  const aspects = projectFatePlayAspects(data, access).permanent.filter(aspect => !aspect.hidden);
  if (plan.replacesAspect && !aspects.some(aspect => aspect.id === input.extreme?.aspectId && aspect.text === input.extreme.previousText)) return data;
  const verdict = confirmFateHarm(state.harm, { plan, texts: input.texts, extreme: input.extreme, aspects, readOnly: !editable, majorMilestoneSequence: state.boundaries.majorMilestone }, operation);
  if (!verdict.ok) return data;
  const { delta } = verdict;
  let next = data;
  for (const [trackId, marks] of Object.entries(delta.stress)) next = writeStress(next, trackId, marks);
  for (const [slot, injury] of Object.entries({ ...delta.consequences, ...delta.conditions })) next = writeInjury(next, slot, injury);
  if (delta.extreme && delta.aspectReplacement) {
    const { aspectId, text } = delta.aspectReplacement;
    next = updateFateAspects(next, rows => rows.map(row => row.id === aspectId ? { ...row, text, freeInvokes: 0 } : row));
    next = updateHarm(next, harm => ({ ...harm, extreme: delta.extreme }));
  }
  return next;
}

const slotInjury = (state: Sheet, slot: string): FateInjury | undefined => {
  if (slot === "mild" || slot === "moderate" || slot === "severe") return state.injuries.consequences[slot];
  if (slot === "extraMild-physical") return state.injuries.extraMild.physical;
  if (slot === "extraMild-mental") return state.injuries.extraMild.mental;
};

/** Inactive wounds remain treatable and clearable using the fixture's original severity. */
export function fateSheetInjuries(state: Sheet, catalog: FatePresetCatalog): FateInjuryRef[] {
  const consequences = new Map(catalog.injuryModels.flatMap(model => model.kind === "consequences"
    ? [...model.slots, ...model.extraSlots].map(slot => [slot.id, slot] as const) : []));
  const conditions = new Map(catalog.injuryModels.flatMap(model => model.kind === "conditions"
    ? model.conditions.map(condition => [condition.id, condition] as const) : []));
  return [...state.harm.active, ...state.harm.inactive].flatMap((item): FateInjuryRef[] => {
    if (item.kind === "stress") return [];
    const key = item.kind === "condition" ? fateConditionBoxKey(item.conditionId, item.index) : item.slotId;
    const injury = item.kind === "condition" ? state.injuries.conditions[key] : slotInjury(state, key);
    const severity = (item.kind === "condition" ? conditions.get(item.conditionId) : consequences.get(key))?.severity;
    if (!severity) return [];
    return [{ key, severity, text: injury?.text || key, metadata: injury?.metadata, renamable: item.kind === "consequence" }];
  });
}

export function recoverFateSheetInjury(data: FateCharacterData, catalog: FatePresetCatalog, snapshot: FateInjuryRef, action: { kind: "clear" } | { kind: "treat"; succeeded: boolean; name: string; id: string }, editable: boolean) {
  if (!editable) return data;
  const state = projectFateSheet(data, catalog);
  const fresh = fateSheetInjuries(state, catalog).find(injury => injury.key === snapshot.key);
  if (!fresh || fresh.text !== snapshot.text || fresh.metadata?.injuryId !== snapshot.metadata?.injuryId) return data;
  if (action.kind === "clear") return fateRecoveryStatus(fresh, state.boundaries) === "clearable" ? writeInjury(data, fresh.key, null) : data;
  const verdict = treatFateInjury(fresh, { succeeded: action.succeeded, renamedText: action.name, boundaries: state.boundaries, injuryId: action.id, readOnly: false }, state.rules.recovery);
  return verdict.ok ? writeInjury(data, fresh.key, { text: verdict.text, metadata: verdict.metadata }) : data;
}

export function assignLegacyFateInjury(data: FateCharacterData, catalog: FatePresetCatalog, key: string, expectedText: string, editable: boolean) {
  const state = projectFateSheet(data, catalog);
  const verdict = assignFateLegacyExtraMild(state.harm, key, !editable);
  return verdict.ok && verdict.consequence.text === expectedText
    ? writeInjury({ ...data, extraMildConsequence: "" }, key, { text: verdict.consequence.text }) : data;
}
