import type { FateCharacterData } from "../../domain/character";
import { checkFateHarmSwitch } from "../../domain/harm";
import { fateRecord } from "../../domain/normalize";
import { diffFatePresetSelection, type FatePresetCatalog, type FatePresetSelection } from "../../domain/presets";
import { projectFateSheet, readFateSheetPreset } from "./sheet-state";

export interface FatePresetDraft {
  selection: FatePresetSelection;
  overrides: Record<string, unknown>;
}

export function previewFatePresetDraft(data: FateCharacterData, catalog: FatePresetCatalog, draft: FatePresetDraft) {
  const current = projectFateSheet(data, catalog);
  const next = projectFateSheet(data, catalog, { ...readFateSheetPreset(data), ...draft });
  const changes = diffFatePresetSelection(current.rules.selection, next.rules.selection);
  const guard = checkFateHarmSwitch(current.harm, next.harm);
  const harm = [...current.harm.active, ...current.harm.inactive];
  const occupiedStress = current.rules.stress.id !== next.rules.stress.id && harm.some(item => item.kind === "stress");
  const occupiedInjuries = current.rules.injuries.id !== next.rules.injuries.id &&
    (harm.some(item => item.kind !== "stress") || current.harm.legacyExtraMild !== undefined);
  const currentIds = new Set(current.roster.active.map(s => s.id));
  const nextIds = new Set(next.roster.active.map(s => s.id));
  const goingDormant = next.roster.dormant.filter(s => currentIds.has(s.id));
  const restored = current.roster.dormant.filter(s => nextIds.has(s.id));
  return {
    allowed: guard.ok && !occupiedStress && !occupiedInjuries && next.issues.length === 0,
    guard, occupiedStress, occupiedInjuries, changes, goingDormant, restored, current, next,
  };
}

export function applyFatePresetDraft(
  data: FateCharacterData, catalog: FatePresetCatalog, expectedSelection: FatePresetSelection, draft: FatePresetDraft,
  structural: boolean, expectedPreset?: string,
): FateCharacterData {
  if (!structural) return data;
  const v2 = fateRecord(data.fateV2);
  if (expectedPreset !== undefined && JSON.stringify(v2.preset ?? null) !== expectedPreset) return data;
  const preview = previewFatePresetDraft(data, catalog, draft);
  if (!preview.allowed || diffFatePresetSelection(expectedSelection, preview.current.rules.selection).length) return data;
  const previous = fateRecord(v2.preset);
  const { rules } = preview.next;
  return { ...data, fateV2: { ...v2, preset: {
    ...previous, id: rules.presetId, version: rules.presetVersion,
    selection: { ...fateRecord(previous.selection), ...rules.selection }, overrides: { ...fateRecord(previous.overrides), ...draft.overrides },
  } } };
}

export type FateRosterEdit =
  | { kind: "add"; id: string; name: string }
  | { kind: "rename"; id: string; name: string; defaultName?: string }
  | { kind: "rank"; id: string; rank: number | null }
  | { kind: "hide"; id: string; hidden: boolean };

export function editFateRoster(data: FateCharacterData, catalog: FatePresetCatalog, edit: FateRosterEdit, structural: boolean): FateCharacterData {
  if (!structural || !edit.id) return data;
  const current = projectFateSheet(data, catalog);
  const active = current.roster.active.some(s => s.id === edit.id);
  const hidden = current.input.hidden.includes(edit.id);
  const stored = fateRecord(data.skills);
  const rows: unknown[] = Array.isArray(stored.skills) ? stored.skills : [];
  const index = rows.findLastIndex(value => fateRecord(value).id === edit.id);
  let skills: Record<string, unknown>;
  if (edit.kind === "hide") {
    if (edit.hidden ? !active : !hidden) return data;
    const ids: unknown[] = Array.isArray(stored.hiddenSkillIds) ? stored.hiddenSkillIds : [];
    skills = { ...stored, hiddenSkillIds: edit.hidden ? [...ids, edit.id] : ids.filter(id => id !== edit.id) };
  } else if (edit.kind === "add") {
    if (!edit.name.trim() || hidden || index >= 0 || catalog.skillLists.some(list => list.skills.includes(edit.id))) return data;
    const order: unknown[] = Array.isArray(stored.skillOrder) ? stored.skillOrder : [];
    skills = { ...stored, skills: [...rows, { id: edit.id, name: edit.name.trim(), isCustomName: true }], skillOrder: [...order, edit.id] };
  } else {
    if (!active) return data;
    const row: Record<string, unknown> = { ...fateRecord(rows[index]), id: edit.id };
    if (edit.kind === "rename") {
      const name = edit.name.trim();
      if (!name) return data;
      if (!edit.id.startsWith("custom-") && name === edit.defaultName) {
        delete row.name;
        delete row.isCustomName;
      } else {
        Object.assign(row, { name, isCustomName: true });
      }
    } else if (edit.kind === "rank") {
      if (edit.rank === null) {
        if (!Object.hasOwn(row, "level")) return data;
        const copy: Record<string, unknown> = row;
        delete copy.level;
      } else {
        if (!Number.isSafeInteger(edit.rank) || edit.rank < 0) return data;
        Object.assign(row, { level: edit.rank });
      }
    }
    skills = { ...stored, skills: index < 0 ? [...rows, row] : rows.map((value, i) => i === index ? row : value) };
  }
  const next = { ...data, skills };
  return checkFateHarmSwitch(current.harm, projectFateSheet(next, catalog).harm).ok ? next : data;
}

export function editFateGear(data: FateCharacterData, catalog: FatePresetCatalog, field: "weapon" | "armor" | "scaleTierId", value: unknown, editable: boolean) {
  if (!editable) return data;
  const { rules, gear } = projectFateSheet(data, catalog);
  const valid = field === "scaleTierId" ? rules.scale.enabled && (value === "" || typeof value === "string" && rules.scale.tiers.includes(value))
    : rules.ratings.enabled && typeof value === "number" && Number.isSafeInteger(value) && value >= rules.ratings.min && value <= rules.ratings.max;
  if (!valid || gear[field] === value) return data;
  const next = { ...gear, [field]: value };
  if (field === "scaleTierId" && value === "") delete next.scaleTierId;
  return { ...data, fateV2: { ...fateRecord(data.fateV2), gear: next } };
}
