import { beforeAll, describe, expect, it } from "vitest";
import { loadFatePresetCatalog, type FatePresetCatalog } from "../../domain/presets";
import { projectFateSheet } from "./sheet-state";
import { applyFatePresetDraft, editFateGear, editFateRoster, previewFatePresetDraft } from "./preset-actions";

let catalog: FatePresetCatalog;
beforeAll(async () => { catalog = await loadFatePresetCatalog(); });
const data = { skills: { skills: [{ id: "fight", level: 4 }, { id: "approach-careful", level: 2 }], skillOrder: ["approach-careful", "fight"] }, fateV2: { gear: { armor: 1 }, keep: 123 } };
const combined = { skills: "short-approaches", stress: "unified", injuries: "conditions", ratings: "srd" };

function draft(source: typeof data | Record<string, unknown>, changes: typeof combined | Partial<typeof combined>) {
  return { selection: { ...projectFateSheet(source, catalog).rules.selection, ...changes }, overrides: {} };
}

describe("Fate recipe changes", () => {
  it("previews and applies the frame 14 axes together without changing shape or dormant data", () => {
    const base = projectFateSheet(data, catalog);
    const next = draft(data, combined);
    const preview = previewFatePresetDraft(data, catalog, next);
    expect(preview.goingDormant.map(s => s.id)).toContain("fight");
    expect(preview.restored.map(s => s.id)).toContain("approach-careful");
    const edited = applyFatePresetDraft(data, catalog, base.rules.selection, next, true);
    const state = projectFateSheet(edited, catalog);
    expect(state.rules.selection).toMatchObject({ ...combined, allocation: "pyramid" });
    expect(state.harm.stress.map(t => [t.id, t.capacity])).toEqual([["unified", 6]]);
    expect(state.harm.conditions.map(c => c.value)).toEqual([1, 1, 2, 2, 3, 3]);
    expect(edited.skills).toBe(data.skills);
    expect(state.gear.armor).toBe(1);
    const restored = applyFatePresetDraft(edited, catalog, state.rules.selection, { selection: base.rules.selection, overrides: {} }, true);
    expect(projectFateSheet(restored, catalog).roster.active.find(s => s.id === "fight")?.rating).toBe(4);
    expect(restored.skills).toBe(data.skills);
  });

  it("blocks switches that would buy empty capacity in an occupied mode, including legacy and overlapping condition IDs", () => {
    const variants = [
      [{ physicalStress: [1] }, { stress: "unified" }],
      [{ extraMildConsequence: "Old injury" }, { injuries: "conditions" }],
      [{ fateV2: { preset: { selection: { injuries: "conditions" } }, harm: { conditions: { "hurt:1": { text: "hurt:1" } } } } }, { injuries: "conditions-separate" }],
    ] as const;
    for (const [source, changes] of variants) {
      const base = projectFateSheet(source, catalog);
      const next = draft(source, changes);
      expect(previewFatePresetDraft(source, catalog, next).allowed).toBe(false);
      expect(applyFatePresetDraft(source, catalog, base.rules.selection, next, true)).toBe(source);
    }
  });

  it("previews point overrides and keeps validated gear edits local to the card", () => {
    const base = projectFateSheet(data, catalog);
    const draft = { selection: { ...base.rules.selection, allocation: "point-buy", ratings: "srd", scale: "srd" }, overrides: { pointBudget: 18, pointCap: 5 } };
    const edited = applyFatePresetDraft(data, catalog, base.rules.selection, draft, true);
    expect(projectFateSheet(edited, catalog).rules.allocation).toMatchObject({ kind: "pointBuy", budget: 18, cap: 5 });
    expect(applyFatePresetDraft(data, catalog, base.rules.selection, { ...draft, overrides: { pointCap: 0 } }, true)).toBe(data);
    expect(editFateGear(edited, catalog, "armor", 2, false)).toBe(edited);
    expect(editFateGear(edited, catalog, "weapon", 5, true)).toBe(edited);
    const equipped = editFateGear(editFateGear(edited, catalog, "weapon", 2, true), catalog, "scaleTierId", "mundane", true);
    expect(projectFateSheet(equipped, catalog).gear).toEqual({ armor: 1, weapon: 2, scaleTierId: "mundane" });
    expect(equipped.skills).toBe(data.skills);
    expect(data.fateV2.gear).toEqual({ armor: 1 });
  });

  it("requires structural mode and preserves identity, ranks, and unknown fields when hiding or renaming", () => {
    const base = projectFateSheet(data, catalog);
    expect(applyFatePresetDraft(data, catalog, base.rules.selection, draft(data, combined), false)).toBe(data);
    const add = { kind: "add" as const, id: "custom-1", name: "Wit" };
    expect(editFateRoster(data, catalog, add, false)).toBe(data);
    const added = editFateRoster(data, catalog, add, true);
    const ranked = editFateRoster(added, catalog, { kind: "rank", id: add.id, rank: 1 }, true);
    const renamed = editFateRoster(ranked, catalog, { kind: "rename", id: add.id, name: "Quick Wit" }, true);
    const hidden = editFateRoster(renamed, catalog, { kind: "hide", id: add.id, hidden: true }, true);
    expect(projectFateSheet(hidden, catalog).roster.active.some(s => s.id === add.id)).toBe(false);
    expect(projectFateSheet(hidden, catalog).roster.dormant).toContainEqual({ id: add.id, name: "Quick Wit", rating: 1, explicit: true, custom: true });
    expect(hidden.fateV2).toBe(data.fateV2);
  });
});
