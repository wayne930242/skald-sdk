import { beforeAll, describe, expect, it } from "vitest";
import { loadFatePresetCatalog, type FatePresetCatalog } from "../../domain/presets";
import { projectFateSheet } from "../presets/sheet-state";
import { readFateAspects, readFateHarm } from "../../domain/normalize";
import { applyIncomingHarm, fateSheetInjuries, planIncomingHarm, recoverFateSheetInjury, setStressMark } from "./harm-actions";

let catalog: FatePresetCatalog;
beforeAll(async () => { catalog = await loadFatePresetCatalog(); });
const operation = { operationId: "hit-1", timestamp: "2026-11-22T00:00:00Z" };
const hit = { kind: "physical" as const, shifts: 5, armor: 1, useArmor: true };
const frame = {
  physicalStress: [1], mildConsequence: "Cut shoulder",
  skills: { skills: [{ id: "physique", level: 1 }, { id: "will", level: 2 }] },
  fateV2: { preset: { selection: { ratings: "srd" } }, unknown: true },
};

function moderatePlan() {
  const options = planIncomingHarm(projectFateSheet(frame, catalog), hit);
  if (options.kind !== "plans") throw new Error("Expected a legal plan");
  const plan = options.plans.find(p => p.key === "slot:moderate");
  if (!plan) throw new Error("Expected a moderate-only plan");
  return plan;
}

describe("Fate vitals", () => {
  it("projects two distinct +5 extra mild slots with their respective hit kinds", () => {
    const data = { skills: { skills: [{ id: "physique", level: 5 }, { id: "will", level: 5 }] } };
    const { harm } = projectFateSheet(data, catalog);
    expect(harm.slots.filter(s => s.extra).map(s => [s.id, s.hitKinds])).toEqual([
      ["extraMild-physical", ["physical"]], ["extraMild-mental", ["mental"]],
    ]);
  });

  it("honors frame 10's occupied mild and three free cells; armor is opt-in", () => {
    const state = projectFateSheet(frame, catalog);
    expect(state.harm.stress[0].free).toEqual([2, 3, 4]);
    const options = planIncomingHarm(state, hit);
    expect(options.kind).toBe("plans");
    if (options.kind !== "plans") return;
    expect(options.plans.every(p => !p.slots.includes("mild") && p.stress?.boxes.length !== 4)).toBe(true);
    expect(moderatePlan().shifts).toBe(4);
    const unarmored = planIncomingHarm(state, { ...hit, useArmor: false });
    expect(unarmored.kind === "plans" && unarmored.plans.every(p => p.shifts === 5)).toBe(true);
    expect(planIncomingHarm(state, { ...hit, shifts: 16 })).toMatchObject({ kind: "takenOut", maxAbsorb: 13, shortfall: 2 });
  });

  it("writes only the selected injury, with an external claim, and refuses a stale or readonly plan", () => {
    const plan = moderatePlan();
    const apply = (data: typeof frame, editable = true) => applyIncomingHarm(data, catalog, { hit, plan, texts: { moderate: "Broken ribs" } }, operation, editable, "unknown");
    const result = apply(frame);
    expect(result).toMatchObject({ mildConsequence: "Cut shoulder", moderateConsequence: "Broken ribs", fateV2: { unknown: true, harm: { consequences: { moderate: { externalClaim: true } } } } });
    const occupied = { ...frame, moderateConsequence: "Remote injury" };
    expect(apply(occupied)).toBe(occupied);
    expect(apply(frame, false)).toBe(frame);
    const armorDisabled = { ...frame, fateV2: { ...frame.fateV2, preset: { selection: { ratings: "off" } } } };
    expect(apply(armorDisabled)).toBe(armorDisabled);
  });

  it("replaces only a visible permanent aspect, refusing stale text, secrets and high concepts", () => {
    const data = { highConcept: "Main", trouble: "Old trouble", aspects: { aspects: [{ id: "freeAspect1", value: "Secret", secret: true }] }, fateV2: { preset: { selection: { extreme: "srd" } } } };
    const hit = { kind: "physical" as const, shifts: 8, armor: 0, useArmor: false };
    const options = planIncomingHarm(projectFateSheet(data, catalog), hit);
    if (options.kind !== "plans") throw new Error("Expected extreme to be available");
    const plan = options.plans.find(p => p.key === "slot:extreme");
    if (!plan) throw new Error("Expected an extreme-only plan");
    const apply = (aspectId: string, previousText: string) => applyIncomingHarm(data, catalog, { hit, plan, texts: {}, extreme: { aspectId, previousText, text: "Limping swordsman" } }, operation, true, "unknown");
    expect(apply("trouble", "Stale trouble")).toBe(data);
    expect(apply("freeAspect1", "Secret")).toBe(data);
    expect(apply("highConcept", "Main")).toBe(data);
    const replaced = apply("trouble", "Old trouble");
    expect(readFateAspects(replaced).rows.find(aspect => aspect.id === "trouble")?.text).toBe("Limping swordsman");
    expect(projectFateSheet(replaced, catalog).harm.extreme.available).toBe(false);
  });

  it("records treatment without clearing until a full recovery interval has elapsed", () => {
    const state = projectFateSheet(frame, catalog);
    const mild = fateSheetInjuries(state, catalog)[0];
    const treated = recoverFateSheetInjury(frame, catalog, mild, { kind: "treat", succeeded: true, name: "Stitched shoulder", id: "i-1" }, true);
    expect(readFateHarm(treated).consequences.mild).toMatchObject({ text: "Stitched shoulder", metadata: { recovery: { boundary: "scene", treatedAtSequence: 0 } } });
    const recovering = fateSheetInjuries(projectFateSheet(treated, catalog), catalog)[0];
    const partial = { ...treated, fateV2: { ...frame.fateV2, ...(treated.fateV2 as object), scene: { id: "s-1", sequence: 1 } } };
    expect(recoverFateSheetInjury(partial, catalog, recovering, { kind: "clear" }, true)).toBe(partial);
    const elapsed = { ...partial, fateV2: { ...partial.fateV2, scene: { id: "s-2", sequence: 2 } } };
    expect(recoverFateSheetInjury(elapsed, catalog, recovering, { kind: "clear" }, true).mildConsequence).toBe("");
  });

  it("does not re-mark a cell when an explicit mark is replayed and keeps out-of-cap cells", () => {
    const data = { physicalStress: { stress1: true, stress9: true, unknown: "preserved" } };
    const result = setStressMark(data, catalog, "physical", 2, true, true);
    expect(result).toMatchObject({ physicalStress: [1, 2, 9], fateV2: { legacyStress: { physicalStress: { unknown: "preserved" } } } });
    expect(setStressMark(result, catalog, "physical", 2, true, true)).toBe(result);
    expect(setStressMark(result, catalog, "physical", 3, true, false)).toBe(result);
  });
});
