import { describe, expect, it } from "vitest";
import { FATE_ASPECT_FORMAT } from "../../domain/character";
import { loadFatePresetCatalog } from "../../domain/presets";
import { buildFatePrintModel } from "../print-model";
import { loadFatePrintMessages } from "../print-messages";

const catalog = await loadFatePresetCatalog();
const preset = (selection: Record<string, string>) => ({ id: "condensed-standard", version: 1, selection });

describe("Fate print projection", () => {
  it("keeps fixed pencil slots on filled sheets", () => {
    const model = buildFatePrintModel({ highConcept: "Captain" }, undefined, catalog, false);
    expect(model.aspects.map(({ kind }) => kind)).toEqual(["highConcept", "trouble", "relationship", "free", "free", "situation"]);
    expect(model.rungs.find(row => row.rating === 1)?.blanks).toBe(4);
  });

  it.each([true, false])("leaves the blank meter empty and prints optional harm capacity (blanks=%s)", blanks => {
    const model = buildFatePrintModel({}, undefined, catalog, blanks);
    expect(model.printRefresh).toBeNull();
    expect(model.stress).toEqual([
      { id: "physical", marks: [false, false, false], optionalBoxes: 3 },
      { id: "mental", marks: [false, false, false], optionalBoxes: 3 },
    ]);
    expect(model.consequences.filter(slot => slot.optional).map(slot => slot.id)).toEqual(["extraMild-physical", "extraMild-mental"]);
    expect(model.aspects.at(-1)).toMatchObject({ kind: "situation", invokeBoxes: 3 });
  });

  it.each(["zh-TW", "en"])("omits page numbers and counts from print directions (%s)", async locale => {
    const { tailContinued, continued, overflow } = (await loadFatePrintMessages(locale)).fatePrint;
    expect(`${tailContinued} ${continued} ${overflow}`).not.toMatch(/第\s*\d+\s*頁|page\s*\d|兩頁|two\s+pages/i);
    expect(tailContinued).toMatch(/^→ .+/);
  });

  it("prints the standard pyramid, split stress, and both +5 mild slots", () => {
    const model = buildFatePrintModel({
      player: "Morgan", description: "Sky captain", portrait: "/rose.webp",
      skills: { skills: [{ id: "shoot", level: 4 }, { id: "physique", level: 5 }, { id: "will", level: 5 }, { id: "lore", level: 2 }], hiddenSkillIds: ["lore"] },
      physicalStress: { stress1: true }, mentalStress: [2], mildConsequence: "Bruised",
      fateV2: { harm: { extraMild: { physical: { text: "Split lip" }, mental: { text: "Upset" } } } },
    }, undefined, catalog, true);
    expect(model.identity).toMatchObject({ player: "Morgan", description: "Sky captain", portrait: "/rose.webp" });
    expect(model.allocation).toBe("pyramid");
    expect(model.rungs.map(row => row.rating)).toEqual([5, 4, 3, 2, 1, 0]);
    expect(model.rungs.find(row => row.rating === 4)).toMatchObject({ skills: [{ id: "shoot" }], blanks: 0 });
    expect(model.rungs.find(row => row.rating === 2)).toMatchObject({ skills: [], blanks: 3 });
    expect(model.stress).toEqual([
      { id: "physical", marks: [true, false, false, false, false, false], optionalBoxes: 0 },
      { id: "mental", marks: [false, true, false, false, false, false], optionalBoxes: 0 },
    ]);
    expect(model.consequences).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "mild", text: "Bruised" }),
      expect.objectContaining({ id: "extraMild-physical", text: "Split lip" }),
      expect.objectContaining({ id: "extraMild-mental", text: "Upset" }),
    ]));
  });

  it("prints FAE approaches, unified stress and marked condition text without dormant fields", () => {
    const model = buildFatePrintModel({
      skills: { skills: [{ id: "approach-quick", level: 3 }, { id: "shoot", level: 4 }] },
      physicalStress: [1], mildConsequence: "Inactive consequence",
      fateV2: { preset: preset({ skills: "short-approaches", allocation: "fae", stress: "unified", injuries: "conditions" }), harm: {
        unifiedStress: [2], conditions: { "hurt:1": { text: "Twisted ankle" }, "scared:1": { text: "scared:1" } },
      } },
    }, undefined, catalog, true);
    expect(model.allocation).toBe("fae");
    expect(model.rungs.map(row => row.rating)).toEqual([3, 2, 1, 0]);
    const skills = model.rungs.flatMap(row => row.skills.map(skill => skill.id));
    expect(skills).toHaveLength(6);
    expect(skills[0]).toBe("approach-quick");
    expect(skills.every(id => id.startsWith("approach-"))).toBe(true);
    expect(model.stress).toEqual([{ id: "unified", marks: [false, true, false, false, false, false], optionalBoxes: 3 }]);
    expect(model.consequences).toEqual([]);
    expect(model.conditions).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "hurt", boxes: [{ index: 1, marked: true, text: "Twisted ankle" }] }),
      expect.objectContaining({ id: "scared", boxes: [{ index: 1, marked: true, text: "" }] }),
    ]));
  });

  it("keeps a short list's active skills and custom names without adding dormant skills", () => {
    const model = buildFatePrintModel({
      skills: { skills: [{ id: "actions-fight", level: 2 }, { id: "shoot", level: 4 }, { id: "pilot", name: "Pilot a skyship", level: -1 }] },
      fateV2: { preset: preset({ skills: "short-actions", allocation: "point-buy" }) },
    }, undefined, catalog, false);
    expect(model.rungs.map(row => row.rating)).toEqual([2, 0, -1]);
    const skills = model.rungs.flatMap(row => row.skills);
    expect(skills).toHaveLength(10);
    expect(skills.some(skill => skill.id === "shoot")).toBe(false);
    expect(skills.at(-1)).toMatchObject({ id: "pilot", customName: "Pilot a skyship" });
  });

  it("drops secret text, custom labels and flat conflicts, even when keeping blanks", () => {
    const data = {
      highConcept: "Secret legacy conflict",
      aspects: { format: FATE_ASPECT_FORMAT, aspects: [
        { id: "highConcept", kind: "highConcept", secret: true, text: "Secret prose", labelOverride: "Secret label", freeInvokes: 3 },
        { id: "known", kind: "situation", text: "On deck", freeInvokes: 2 },
      ] },
    };
    for (const blanks of [false, true]) {
      const model = buildFatePrintModel(data, undefined, catalog, blanks);
      expect(model.aspects).toMatchObject([
        { kind: "highConcept", hidden: true, text: "" },
        { kind: "trouble", hidden: false, text: "" },
        { kind: "relationship", hidden: false, text: "" },
        { kind: "free", hidden: false, text: "" },
        { kind: "free", hidden: false, text: "" },
        { kind: "situation", text: "On deck", freeInvokes: 2 },
      ]);
      expect(JSON.stringify(model)).not.toMatch(/Secret (legacy conflict|prose|label)/);
    }
  });

  it("uses F1 stunt costs and effective refresh, and keeps both player notes and extras", () => {
    const model = buildFatePrintModel({
      fatePoints: 0, refresh: 99, extras: "A ship", notes: "Pay the crew",
      fateV2: { refresh: { base: 3, earned: 2, override: 2 } },
      stunts: { stunts: Array.from({ length: 4 }, (_, i) => ({ id: `${i}`, type: "custom", customText: `Stunt ${i}` })) },
    }, undefined, catalog, false);
    expect(model.resources).toMatchObject({ fatePoints: 0, baseRefresh: 3, earnedRefresh: 2, effectiveRefresh: 2, refreshOverride: 2, stuntCount: 4, stuntCost: 1 });
    expect(model.stunts).toHaveLength(4);
    expect(model).toMatchObject({ extras: "A ship", notes: "Pay the crew" });
  });
});
