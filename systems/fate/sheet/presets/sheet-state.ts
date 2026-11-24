import type { FateCharacterData, FatePresetState } from "../../domain/character";
import { readFateConditionMarks, resolveFateHarmModel } from "../../domain/harm";
import { fateBoundaries } from "../../domain/lifecycle";
import { fateRecord, readFateHarm } from "../../domain/normalize";
import { fateLinkRatings, projectFateSkills, resolveFateRules, type FatePresetCatalog } from "../../domain/presets";

const strings = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
const int = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) ? value : undefined;

export function readFateSheetPreset(data: FateCharacterData): Partial<FatePresetState> {
  const stored = fateRecord(fateRecord(data.fateV2).preset);
  return {
    id: typeof stored.id === "string" ? stored.id : undefined,
    version: int(stored.version),
    selection: Object.fromEntries(Object.entries(fateRecord(stored.selection)).filter((entry): entry is [string, string] => typeof entry[1] === "string")),
    overrides: fateRecord(stored.overrides),
  };
}

export function readFateSheetRoster(data: FateCharacterData) {
  const stored = fateRecord(data.skills);
  const rows = new Map<string, { id: string; name?: string; level?: number }>();
  if (Array.isArray(stored.skills)) for (const value of stored.skills) {
    const row = fateRecord(value);
    if (typeof row.id !== "string" || !row.id.trim()) continue;
    const name = typeof row.name === "string" && row.name.trim() ? row.name : undefined;
    rows.set(row.id, { id: row.id, name, level: int(row.level) });
  }
  return { rows: [...rows.values()], order: strings(stored.skillOrder), hidden: strings(stored.hiddenSkillIds) };
}

/** One read model for the roster, stress eligibility and harm commands. Never writes on read. */
export function projectFateSheet(data: FateCharacterData, catalog: FatePresetCatalog, preset = readFateSheetPreset(data)) {
  const { rules, issues } = resolveFateRules(catalog, preset);
  const input = readFateSheetRoster(data);
  const roster = projectFateSkills(input, rules.skills, catalog);
  const activeIds = new Set(roster.active.map(s => s.id));
  // Explicit zeroes and name-only rows also survive switches and are useful in the preview.
  const stock = new Set(catalog.skillLists.flatMap(list => list.skills));
  roster.dormant = input.rows.filter(row => !activeIds.has(row.id) && (row.level !== undefined || row.name !== undefined))
    .map(row => ({ id: row.id, rating: row.level ?? 0, name: row.name, explicit: row.level !== undefined, custom: !stock.has(row.id) }));
  const links = fateLinkRatings(rules.skills, Object.fromEntries(roster.active.map(s => [s.id, s.rating])));
  const injuries = readFateHarm(data);
  const v2 = fateRecord(data.fateV2);
  const harmStore = fateRecord(v2.harm);
  const extreme = fateRecord(harmStore.extreme);
  const extremeSequence = int(extreme.majorMilestoneSequence);
  const boundary = (value: unknown) => {
    const { id, sequence } = fateRecord(value);
    return typeof id === "string" && int(sequence) !== undefined ? { id, sequence: int(sequence) ?? 0 } : undefined;
  };
  const boundaries = fateBoundaries({ scene: boundary(v2.scene), session: boundary(v2.session), majorMilestoneSequence: int(v2.majorMilestoneSequence) });
  const harm = resolveFateHarmModel(rules, links, {
    stress: { physical: injuries.physicalStress, mental: injuries.mentalStress, unified: injuries.unifiedStress },
    consequences: {
      ...Object.fromEntries(Object.entries(injuries.consequences).map(([slot, injury]) => [slot, injury.text])),
      "extraMild-physical": injuries.extraMild.physical.text,
      "extraMild-mental": injuries.extraMild.mental.text,
    },
    legacyExtraMild: injuries.legacyExtraMild,
    conditions: readFateConditionMarks(injuries.conditions),
    extreme: extremeSequence === undefined ? undefined : { majorMilestoneSequence: extremeSequence },
    majorMilestoneSequence: boundaries.majorMilestone,
  });
  const gear = fateRecord(v2.gear);
  return { rules, issues, roster, links, injuries, harm, boundaries, gear, input };
}
