import { outOfCapRow, type DerivedSnapshot, type RecalcRow } from "@skald/sheet-sdk/modules/sheet-schema";
import type { FateCharacterData } from "../../domain/character";
import { fateRecord, readFateResources } from "../../domain/normalize";
import type { projectFateSheet } from "../presets/sheet-state";

/**
 * Fate's derived values (B-024) come from its own engine over `fateV2`, not from the template's
 * formulas, so the shared `DerivedValueView` and recalculation notice get them as plain records.
 * Ids: `refresh` (overridable), `stress:<track>` box counts, and each extra consequence slot id
 * (`extraMild-physical`: 1 while the linked skill earns it, else 0), both auto-only.
 */
export const FATE_REFRESH_ID = "refresh";
export const fateStressId = (trackId: string) => `stress:${trackId}`;

type FateSheet = ReturnType<typeof projectFateSheet>;

/** The extra consequence slots the active injury model can grant, with whether each is granted now. */
export function fateExtraSlots(sheet: FateSheet): { id: string; granted: boolean }[] {
  const model = sheet.rules.injuries;
  if (model.kind !== "consequences") return [];
  return model.extraSlots.map((slot) => ({ id: slot.id, granted: sheet.harm.slots.some((state) => state.id === slot.id) }));
}

export function fateDerivedSnapshot(data: FateCharacterData, sheet: FateSheet): DerivedSnapshot {
  const resources = readFateResources(data);
  const values: Record<string, number> = { [FATE_REFRESH_ID]: resources.effectiveRefresh };
  for (const track of sheet.harm.stress) values[fateStressId(track.id)] = track.capacity;
  for (const slot of fateExtraSlots(sheet)) values[slot.id] = slot.granted ? 1 : 0;
  const overridden = resources.refreshOverride !== undefined;
  return {
    values,
    auto: overridden ? { [FATE_REFRESH_ID]: resources.autoRefresh } : {},
    overrides: overridden ? { [FATE_REFRESH_ID]: resources.effectiveRefresh } : {},
  };
}

/**
 * What prompts a recalculation when the player leaves edit mode: the ranks of the skills the
 * stress tracks follow, the preset, the stunts' refresh cost (it moves once the count passes the
 * three free ones) and major milestones.
 */
export function fateRecalcTriggers(data: FateCharacterData, sheet: FateSheet): Record<string, unknown> {
  const fateV2 = fateRecord(data.fateV2);
  const milestones = Array.isArray(fateV2.milestones) ? fateV2.milestones : [];
  return {
    links: sheet.links,
    preset: fateV2.preset ?? null,
    stuntCost: readFateResources(data).stuntCost,
    majorMilestones: milestones.filter((entry) => fateRecord(entry).kind === "major").length,
  };
}

/**
 * Harm kept beyond a capacity reduced during this edit: stress marks, condition boxes,
 * and occupied extra consequence slots. Existing marks are never dropped.
 */
export function fateOutOfCap(before: FateSheet, sheet: FateSheet): RecalcRow[] {
  const rows: (RecalcRow | null)[] = [];
  for (const track of sheet.harm.stress) {
    const highest = track.outOfCap.at(-1);
    const previous = before.harm.stress.find((entry) => entry.id === track.id);
    if (highest !== undefined && previous && previous.capacity > track.capacity) {
      rows.push(outOfCapRow(fateStressId(track.id), highest, track.capacity));
    }
  }
  for (const condition of sheet.harm.conditions) {
    const previous = before.harm.conditions.find((entry) => entry.id === condition.id);
    const highest = condition.outOfCap.at(-1);
    if (highest !== undefined && previous && previous.boxes.length > condition.boxes.length) {
      rows.push(outOfCapRow(`condition:${condition.id}`, highest, condition.boxes.length));
    }
  }
  const previouslyGranted = new Set(before.harm.slots.map((slot) => slot.id));
  for (const slot of fateExtraSlots(sheet)) {
    const kept = !slot.granted && sheet.harm.inactive.some((item) => item.kind === "consequence" && item.slotId === slot.id);
    if (kept && previouslyGranted.has(slot.id)) rows.push(outOfCapRow(slot.id, 1, 0));
  }
  return rows.filter((row): row is RecalcRow => row !== null);
}
