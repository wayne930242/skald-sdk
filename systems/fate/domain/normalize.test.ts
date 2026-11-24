import { describe, expect, it } from "vitest";
import {
  readFateAspects,
  readFateResources,
  readFateStress,
  readFateHarm,
  readFateStunts,
  replaceFateConsequence,
  updateFateAspects,
  updateFateSplitStress,
  updateFateStunts,
} from "./normalize";

const legacy = {
  highConcept: "Courier to the dead",
  trouble: "The dead write back",
  relationship: "My sister keeps the keys",
  aspects: {
    source: "import",
    aspects: [
      { id: "trouble", label: "麻煩", value: "" },
      { id: "highConcept", label: "High Concept", value: "Ghost postmaster", note: "from session one" },
      { id: "witches", label: "Debts", value: "Three covens", custom: true },
    ],
  },
  fatePoints: 0,
  refresh: 5,
  physicalStress: [6, 1, 1, 0, -2, 1.5, "3"],
  mentalStress: { stress2: true, stress6: true, stress3: false, notstress4: true, note: "kept" },
  extraMildConsequence: "Burnt fingers",
  mildConsequence: "Broken nose",
  stunts: { stunts: [{ id: "old", type: "rule-change", feat: "Ask a ghost", custom: true }] },
  futureRoot: { keep: true },
};

describe("Fate built-in character projection", () => {
  it("recognizes the historical zh-TW free-slot label", () => {
    const { rows } = readFateAspects({ aspects: { aspects: [{ id: "freeAspect1", label: "其他形象", value: "A ghost" }] } });
    expect(rows[0].labelOverride).toBeUndefined();
  });

  it("mirrors canonical edits for b73c8f93 and reads its wrapper replacement on upgrade", () => {
    const updated = updateFateAspects(legacy, rows => rows.map(row => row.id === "highConcept"
      ? { ...row, text: "Ghost librarian", labelOverride: "Calling" } : row));
    const { aspects } = updated.aspects as { aspects: Record<string, unknown>[] };
    expect(aspects.find(row => row.id === "highConcept")).toMatchObject({ value: "Ghost librarian", label: "Calling" });
  });

  it("reads an explicit blank from b73c8f93 instead of stale canonical or flat text", () => {
    const stored = [{ id: "highConcept", label: "High Concept", value: "Ghost librarian", text: "Ghost librarian", kind: "highConcept" }];
    // b73c8f93 handleValueChange replaces the wrapper and spreads the changed row.
    const oldWrite = { aspects: stored.map(row => row.id === "highConcept" ? { ...row, value: "" } : row) };
    expect(readFateAspects({ highConcept: legacy.highConcept, aspects: oldWrite }).rows[0].text).toBe("");
    expect(readFateAspects({ aspects: { ...oldWrite, format: 2 } }).rows[0].text).toBe("Ghost librarian");
  });

  it("retains opaque rows and unknown keys across replacement and removal", () => {
    const futureAspect = { id: "future", kind: "future-kind", payload: true };
    const futureStunt = { id: "future", type: "future-type", payload: true };
    const aspect = { id: "highConcept", value: "Old", extension: 1 };
    const stunt = { id: "old", type: "custom", extension: 2 };
    const nextAspect = updateFateAspects({ aspects: [null, futureAspect, aspect] }, rows => rows.map(row =>
      row.id === aspect.id ? { id: row.id, kind: row.kind, text: "New", freeInvokes: 0, secret: false } : row));
    expect(nextAspect.aspects).toMatchObject({ aspects: [null, futureAspect, { id: aspect.id, extension: 1, text: "New" }] });
    const nextStunt = updateFateStunts({ stunts: { stunts: [futureStunt, stunt, { id: "remove", type: "custom" }] } }, () =>
      [{ id: stunt.id, type: "custom", customText: "New" }]);
    expect(nextStunt.stunts).toEqual({ stunts: [futureStunt, { ...stunt, customText: "New" }] });
  });
  it("uses list order and values, fills missing flat slots, reports nonempty collisions, and recognizes both legacy locales", () => {
    const { rows, conflicts } = readFateAspects(legacy);
    expect(rows.map(({ id, text, labelOverride }) => [id, text, labelOverride])).toEqual([
      ["trouble", "The dead write back", undefined],
      ["highConcept", "Ghost postmaster", undefined],
      ["witches", "Three covens", "Debts"],
      ["relationship", "My sister keeps the keys", undefined],
    ]);
    expect(conflicts).toEqual([{ id: "highConcept", flatText: "Courier to the dead" }]);
    expect(readFateAspects({ highConcept: legacy.highConcept }).rows[0].text).toBe(legacy.highConcept);
    expect(readFateAspects({ aspects: legacy.aspects.aspects, trouble: legacy.trouble }).rows[0].text).toBe(legacy.trouble);
  });

  it("respects explicit canonical empties, even while flat values survive", () => {
    const canonical = { ...legacy, aspects: { format: 2, aspects: [{ id: "highConcept", kind: "highConcept", text: "", freeInvokes: 0, secret: false }] } };
    expect(readFateAspects(canonical).rows).toMatchObject([{ id: "highConcept", text: "" }]);
    expect(readFateAspects({ ...canonical, aspects: { format: 2, aspects: [] } }).rows).toEqual([]);
  });

  it("performs an explicit round trip without overwriting flat text, unknown keys or other roots", () => {
    const next = updateFateAspects(legacy, rows => rows.map(row => row.id === "highConcept" ? { ...row, text: "" } : row));
    expect(next).toMatchObject({
      highConcept: legacy.highConcept,
      aspects: { format: 2, source: "import", aspects: [
        { id: "trouble", text: legacy.trouble },
        { id: "highConcept", text: "", note: "from session one" },
        { id: "witches", text: "Three covens", custom: true },
        { id: "relationship", text: legacy.relationship },
      ] },
    });
    expect(readFateAspects(next).rows.find(row => row.id === "highConcept")?.text).toBe("");
    expect(next.futureRoot).toBe(legacy.futureRoot);
    expect(next.stunts).toBe(legacy.stunts);
    const removed = updateFateAspects(next, rows => rows.filter(row => row.id !== "highConcept"));
    expect(readFateAspects(removed).rows.map(row => row.id)).not.toContain("highConcept");
    expect(updateFateAspects(next, rows => rows)).toBe(next);
  });

  it("keeps zero and carried points; treats old nondefault refresh as an effective override", () => {
    expect(readFateResources(legacy)).toMatchObject({ fatePoints: 0, baseRefresh: 3, refreshOverride: 5, effectiveRefresh: 5 });
    expect(readFateResources({ fatePoints: 8, refresh: 3 })).toMatchObject({ fatePoints: 8, effectiveRefresh: 3 });
    expect(readFateResources({ refresh: 3 }).refreshOverride).toBeUndefined();
    expect(readFateResources({ refresh: 2, fateV2: { refresh: { base: 3, earned: 1 } } })).toMatchObject({ effectiveRefresh: 4 });
  });

  it("keeps structured and custom stunt values and charges only for nonblank stunts above the free quota", () => {
    const data = { stunts: { stunts: [
      ...legacy.stunts.stunts,
      { id: "custom", type: "custom", customText: "A different trick" },
      { id: "v2", type: "bonus", title: "Ghost courier", because: "the dead trust me", skillId: "contacts" },
      { id: "draft", type: "custom", title: "Incomplete", customText: " " },
    ] } };
    expect(readFateStunts(data)[0]).toMatchObject({ id: "old", feat: "Ask a ghost", custom: true });
    expect(readFateResources(data)).toMatchObject({ stuntCount: 3, effectiveRefresh: 3 });
    data.stunts.stunts.push({ id: "paid", type: "custom", customText: "Another ghost trick" });
    expect(readFateResources(data)).toMatchObject({ stuntCount: 4, effectiveRefresh: 2 });
  });

  it("deduplicates actual marks without applying capacity, and preserves keys while changing a track", () => {
    expect(readFateStress(legacy.physicalStress)).toEqual([1, 6]);
    expect(readFateStress(legacy.mentalStress)).toEqual([2, 6]);
    const next = updateFateSplitStress(legacy, "mentalStress", marks => marks.filter(mark => mark !== 2));
    expect(readFateStress(next.mentalStress)).toEqual([6]);
    expect(next.fateV2).toMatchObject({ legacyStress: { mentalStress: { notstress4: true, note: "kept" } } });
    expect(next.physicalStress).toBe(legacy.physicalStress);
  });

  it("keeps legacy extra mild unassigned and ignores treatment for a manually replaced injury", () => {
    const data = { ...legacy, fateV2: { harm: {
      consequences: { mild: { injuryId: "hit-0", injuryText: "Broken nose", externalClaim: true } },
      otherRule: "keep",
    } } };
    expect(readFateHarm(data)).toMatchObject({ legacyExtraMild: "Burnt fingers", consequences: { mild: { text: "Broken nose", metadata: { injuryId: "hit-0", externalClaim: true } } } });
    expect(readFateHarm({ ...data, mildConsequence: "New wound" }).consequences.mild.metadata).toBeUndefined();
    const replaced = replaceFateConsequence(data, "mild", "New wound");
    expect(replaced.fateV2).toMatchObject({ harm: { consequences: {}, otherRule: "keep" } });
    expect(readFateHarm({ ...replaced, mildConsequence: "Broken nose" }).consequences.mild.metadata).toBeUndefined();
  });
});
