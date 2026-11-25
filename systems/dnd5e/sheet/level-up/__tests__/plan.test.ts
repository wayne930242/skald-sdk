import { describe, expect, it } from "vitest";
import { classInfoOf, levelUpPlan, offeredFeatures } from "../plan";
import { builtinClassInfo, sheet } from "./class-info";

const refs = (features: ReadonlyArray<{ ref: string }>) => features.map((feature) => feature.ref).sort();

describe("levelUpPlan (phase 2b §4.1)", () => {
  it("counts only the class's own spells: a background or species spell is not a Ranger spell (UAT m14)", async () => {
    const ranger = await builtinClassInfo("ranger");
    const spells = [
      { id: "s1", name: "Cure Wounds", level: 1, prepared: true, source: "class" },
      { id: "s2", name: "Bless", level: 1, prepared: true, source: "magic-initiate" },
      { id: "s3", name: "Guidance", level: 0, source: "magic-initiate" },
      { id: "s4", name: "Hunter's Mark", level: 1, prepared: true, source: "other" },
    ];
    const plan = levelUpPlan({ data: sheet("ranger", 1, { hitDieFaces: 10, spells }), classInfo: ranger })!;
    expect(plan.spells).toMatchObject({ prepared: { before: 2, after: 3 }, sheet: { cantrips: 0, prepared: 2 } });
  });

  it("Paladin 2→3: class features, the subclass picker, Oath of Devotion's level 3 features, slots and prepared", async () => {
    const info = await builtinClassInfo("paladin");
    const plan = levelUpPlan({ data: sheet("paladin", 2, { hitDieFaces: 10, slot1Total: 2 }), classInfo: info })!;
    expect(plan).toMatchObject({ fromLevel: 2, toLevel: 3, classFound: true, hp: { faces: 10, average: 6 } });
    expect(refs(plan.features)).toEqual([
      "classFeature:paladin/channel-divinity-l3",
      "classFeature:paladin/divine-sense-l3",
      "classFeature:paladin/paladin-subclass-l3",
    ]);
    expect(plan.subclass).toMatchObject({ known: null, choose: true, firstLevel: 3 });
    expect(plan.subclass.options.map((option) => option.ref)).toEqual(["subclass:paladin/oath-of-devotion"]);
    const devotion = "subclass:paladin/oath-of-devotion";
    expect(refs(plan.subclass.offers[devotion])).toEqual([
      "subclassFeature:paladin/oath-of-devotion/oath-of-devotion-l3",
      "subclassFeature:paladin/oath-of-devotion/oath-of-devotion-spells-l3",
      "subclassFeature:paladin/oath-of-devotion/sacred-weapon-l3",
    ]);
    // Picking the oath hides the placeholder; 「稍後再選」 keeps it.
    expect(refs(offeredFeatures(plan, devotion))).toEqual([
      "classFeature:paladin/channel-divinity-l3",
      "classFeature:paladin/divine-sense-l3",
      ...refs(plan.subclass.offers[devotion]),
    ].sort());
    expect(refs(offeredFeatures(plan, null))).toEqual(refs(plan.features));
    expect(plan.slots).toMatchObject({ before: [2, 0, 0, 0, 0, 0, 0, 0, 0], after: [3, 0, 0, 0, 0, 0, 0, 0, 0], matches: true, changed: true });
    expect(plan.slots?.pact).toBeUndefined();
    expect(plan.spells).toMatchObject({ prepared: { before: 3, after: 4 }, list: "paladin" });
    expect(plan.spells?.cantrips).toBeUndefined();
    expect(plan.columns).toEqual([{ index: 3, label: "Channel Divinity", before: 0, after: 2 }]);
    expect(plan.asi).toBeNull();
  });

  it("Wizard 3→4: an ability score improvement and cantrips 3→4", async () => {
    const plan = levelUpPlan({ data: sheet("wizard", 3, { int: 17, slot1Total: 4, slot2Total: 2 }), classInfo: await builtinClassInfo("wizard") })!;
    expect(plan.asi).toMatchObject({ feature: "classFeature:wizard/ability-score-improvement-l4", cap: 20, points: 2, featRef: "feat:ability-score-improvement" });
    expect(plan.asi?.abilities.int).toBe(17);
    expect(refs(plan.features)).toContain("classFeature:wizard/ability-score-improvement-l4");
    expect(plan.spells).toMatchObject({ cantrips: { before: 3, after: 4 }, prepared: { before: 6, after: 7 } });
    expect(plan.slots).toMatchObject({ before: [4, 2, 0, 0, 0, 0, 0, 0, 0], after: [4, 3, 0, 0, 0, 0, 0, 0, 0], matches: true });
    expect(plan.subclass.choose).toBe(true);
  });

  it("Fighter 5→6: an ability score improvement, no slots", async () => {
    const plan = levelUpPlan({ data: sheet("fighter", 5, { subclass: "Champion" }), classInfo: await builtinClassInfo("fighter") })!;
    expect(plan.asi?.feature).toBe("classFeature:fighter/ability-score-improvement-l6");
    expect(plan.slots).toBeNull();
    expect(plan.spells).toBeNull();
    expect(plan.subclass.known?.ref).toBe("subclass:fighter/champion");
    expect(plan.subclass.choose).toBe(false);
  });

  it("Barbarian 5→6 with Path of the Berserker known: hides subclass-feature-l6 and offers the path's level 6 feature", async () => {
    const info = await builtinClassInfo("barbarian");
    const fromRow = sheet("barbarian", 5, {
      features: [{ id: "feature_1", level: 3, name: "Frenzy", ref: "subclassFeature:barbarian/path-of-the-berserker/frenzy-l3", origin: "srd", text: "" }],
    });
    const fromText = sheet("barbarian", 5, { subclass: " path of the berserker " });
    for (const data of [fromRow, fromText]) {
      const plan = levelUpPlan({ data, classInfo: info })!;
      expect(plan.subclass.known?.ref).toBe("subclass:barbarian/path-of-the-berserker");
      expect(plan.subclass.choose).toBe(false);
      expect(refs(plan.features)).toContain("classFeature:barbarian/subclass-feature-l6");
      expect(refs(offeredFeatures(plan))).toEqual(["subclassFeature:barbarian/path-of-the-berserker/mindless-rage-l6"]);
    }
  });

  it("Warlock 1→2: pact slots 1→2, Eldritch Invocations 1→3 as info", async () => {
    const plan = levelUpPlan({ data: sheet("warlock", 1, { pactSlots: 1, pactSlotLevel: 1 }), classInfo: await builtinClassInfo("warlock") })!;
    expect(plan.slots).toMatchObject({
      pact: { before: { slots: 1, level: 1 }, after: { slots: 2, level: 1 } },
      matches: true,
      changed: true,
    });
    expect(plan.columns).toEqual([{ index: 3, label: "Eldritch Invocations", before: 1, after: 3 }]);
    expect(plan.spells).toMatchObject({ cantrips: { before: 2, after: 2 }, prepared: { before: 2, after: 3 } });
    expect(plan.subclass.choose).toBe(false);
  });

  it("starts the slots checkbox off when the sheet's totals differ from the table", async () => {
    const info = await builtinClassInfo("wizard");
    expect(levelUpPlan({ data: sheet("wizard", 3, { slot1Total: 3, slot2Total: 2 }), classInfo: info })!.slots?.matches).toBe(false);
    const warlock = await builtinClassInfo("warlock");
    expect(levelUpPlan({ data: sheet("warlock", 1, { pactSlots: 1, pactSlotLevel: 2 }), classInfo: warlock })!.slots?.matches).toBe(false);
  });

  it("an unknown class gets level and hit points only", () => {
    const plan = levelUpPlan({ data: sheet("", 4, { className: "Witch Hunter", hitDieFaces: 10 }), classInfo: null })!;
    expect(plan).toEqual({
      fromLevel: 4,
      toLevel: 5,
      classFound: false,
      classId: null,
      hp: { faces: 10, average: 6 },
      features: [],
      subclass: { known: null, text: "", firstLevel: null, choose: false, options: [], offers: {} },
      asi: null,
      epicBoon: false,
      slots: null,
      spells: null,
      columns: [],
    });
  });

  it("offers a hand-written pack class's level 2 feature", () => {
    const table = {
      type: "table",
      colLabels: ["Level", "Proficiency Bonus", "Class Features", "Embers"],
      rows: [
        [1, "+2", "{@classFeature Ember Sight|Ash Warden||1}", 1],
        [2, "+2", "{@classFeature Ash Mark|Ash Warden||2}", 2],
      ],
    };
    const info = classInfoOf({
      id: "ash-warden",
      blocks: { entries: [table] },
      entries: [
        { ref: "classFeature:ash-warden/ember-sight-l1", name: "Ember Sight", meta: { level: 1 } },
        { ref: "classFeature:ash-warden/ash-mark-l2", name: "Ash Mark", meta: { level: 2 } },
        { ref: "classFeature:wizard/scholar-l2", name: "Scholar", meta: { level: 2 } },
      ],
      localize: (ref, english) => (ref.endsWith("ash-mark-l2") ? "Ash Mark (local)" : english),
    });
    const plan = levelUpPlan({ data: sheet("ash-warden", 1), classInfo: info })!;
    expect(plan.features).toEqual([{ ref: "classFeature:ash-warden/ash-mark-l2", name: "Ash Mark (local)", level: 2, placeholder: false }]);
    expect(plan.columns).toEqual([{ index: 3, label: "Embers", before: 1, after: 2 }]);
    expect(plan.slots).toBeNull();
  });

  it("skips features already on the sheet, stops at 20 and goes one level at a time", async () => {
    const info = await builtinClassInfo("paladin");
    const data = sheet("paladin", 2, { features: [{ id: "f", ref: "classFeature:paladin/divine-sense-l3", name: "Divine Sense", level: 3 }] });
    expect(refs(levelUpPlan({ data, classInfo: info })!.features)).not.toContain("classFeature:paladin/divine-sense-l3");
    expect(levelUpPlan({ data: sheet("paladin", 20), classInfo: info })).toBeNull();
    expect(() => levelUpPlan({ data: sheet("paladin", 2), classInfo: info, toLevel: 4 })).toThrow(RangeError);
    expect(levelUpPlan({ data: sheet("paladin", 18), classInfo: info })!.epicBoon).toBe(true);
  });

  it("offers a late subclass pick every subclass feature up to the new level", async () => {
    const plan = levelUpPlan({ data: sheet("paladin", 6), classInfo: await builtinClassInfo("paladin") })!;
    expect(plan.subclass.choose).toBe(true);
    expect(refs(plan.subclass.offers["subclass:paladin/oath-of-devotion"])).toEqual([
      "subclassFeature:paladin/oath-of-devotion/aura-of-devotion-l7",
      "subclassFeature:paladin/oath-of-devotion/oath-of-devotion-l3",
      "subclassFeature:paladin/oath-of-devotion/oath-of-devotion-spells-l3",
      "subclassFeature:paladin/oath-of-devotion/sacred-weapon-l3",
    ]);
  });
});
