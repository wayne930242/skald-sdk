import { describe, expect, it } from "vitest";
import catalogJson from "@skald/system-fate/data/fate-condensed/presets/catalog.json";
import en from "@skald/system-fate/data/fate-condensed/presets/labels/en.json";
import zh from "@skald/system-fate/data/fate-condensed/presets/labels/zh-TW.json";
import skillsMaster from "@skald/system-fate/data/fate-condensed/skills-master.json";
import sectionMap from "../scripts/fate-condensed/section-map.json";
import {
  applyFateRecipe,
  checkFateAllocation,
  checkFateColumns,
  fateLinkRatings,
  loadFatePresetCatalog,
  loadFatePresetLabels,
  previewFateSkillListSwitch,
  projectFateSkills,
  resolveFateRules,
  selectFatePresetOption,
  validateFatePresetCatalog,
  type FatePresetCatalog,
  type FateRosterSkill,
} from "./presets";
const catalog = await loadFatePresetCatalog();

const list = (id: string) => {
  const found = catalog.skillLists.find(l => l.id === id);
  if (!found) throw new Error(id);
  return found;
};
const roster = (ratings: Record<string, number | undefined>): FateRosterSkill[] =>
  Object.entries(ratings).map(([id, rating]) => ({ id, rating: rating ?? 0, explicit: rating !== undefined, custom: false }));

describe("Fate preset catalog", () => {
  it("is internally consistent, cites known sections and labels every option in both locales", () => {
    const issues = validateFatePresetCatalog(catalog, {
      ruleIds: new Set(Object.keys(sectionMap)),
      labels: [en, zh],
      builtinSkillIds: new Set(skillsMaster.skills.map(s => s.id)),
    });
    expect(issues).toEqual([]);
  });

  it("reports broken references in a tampered fixture", () => {
    const tampered = structuredClone(catalogJson) as unknown as FatePresetCatalog;
    tampered.presets[0].axes.stress = "triple";
    tampered.recipes.push({ id: "broken", set: { scale: "missing" }, cite: { rule: "nowhere", srd: "x" } });
    tampered.skillLists[0].skills.push("athletics");
    const issues = validateFatePresetCatalog(tampered, { ruleIds: new Set(Object.keys(sectionMap)), labels: [en] });
    expect(issues).toEqual(expect.arrayContaining([
      "condensed-standard.stress → triple",
      "recipe broken → scale:missing",
      "broken cites unknown rule nowhere",
      "broken has malformed srd range x",
      "duplicate skill in condensed athletics",
      "label recipes.broken missing",
    ]));
  });

  it("ships the Condensed and Core lists and the eight SRD short lists", () => {
    expect(list("condensed").skills).toHaveLength(19);
    expect(list("condensed").skills).toEqual(skillsMaster.skills.map(s => s.id));
    expect(list("core").skills).toEqual(list("condensed").skills.filter(id => id !== "academics"));
    expect(list("core").skills).toContain("drive");
    const shortLists = catalog.skillLists.filter(l => l.group === "short");
    expect(Object.fromEntries(shortLists.map(l => [l.id, l.skills.length]))).toEqual({
      "short-actions": 9, "short-approaches": 6, "short-aptitudes": 5, "short-attributes": 5,
      "short-relationships": 4, "short-roles": 7, "short-themes": 9, "short-values": 8,
    });
    expect(shortLists.every(l => Object.keys(l.trackLinks).length === 0)).toBe(true);
  });

  it("offers all seven approved recipes and the four starting shapes", () => {
    expect(catalog.recipes.map(r => r.id)).toEqual(["skills", "shape", "approaches", "unified", "conditions", "extreme", "gear"]);
    expect(catalog.allocations.map(a => a.id)).toEqual(["pyramid", "diamond", "fae", "point-buy"]);
    expect(catalog.presets.map(p => p.id)).toEqual(["condensed-standard"]);
  });

  it("loads one locale's labels on demand", async () => {
    expect(await loadFatePresetLabels("zh-TW")).toEqual(zh);
    expect(await loadFatePresetLabels("en")).toEqual(en);
  });

  it("uses the decided zh-TW approach names", () => {
    expect(list("short-approaches").skills.map(id => zh.skills[id as keyof typeof zh.skills])).toEqual(["謹慎", "機智", "華麗", "猛力", "迅捷", "詭祕"]);
    expect(list("short-approaches").skills.map(id => en.skills[id as keyof typeof en.skills])).toEqual(["Careful", "Clever", "Flashy", "Forceful", "Quick", "Sneaky"]);
  });
});

describe("resolveFateRules", () => {
  it("defaults to condensed-standard with nothing optional switched on", () => {
    const { rules, issues } = resolveFateRules(catalog);
    expect(issues).toEqual([]);
    expect(rules.presetId).toBe("condensed-standard");
    expect(rules.selection).toEqual({ skills: "condensed", allocation: "pyramid", stress: "split", injuries: "consequences", extreme: "off", ratings: "off", scale: "off" });
    expect(rules.economy).toMatchObject({ baseRefresh: 3, freeStunts: 3, minRefresh: 1 });
  });

  it("composes independent axes, frame 14 style (approaches + unified + conditions + ratings)", () => {
    const { rules, issues } = resolveFateRules(catalog, {
      id: "condensed-standard", version: 1,
      selection: { skills: "short-approaches", allocation: "fae", stress: "unified", injuries: "conditions", ratings: "srd" },
      overrides: {},
    });
    expect(issues).toEqual([]);
    expect(rules.skills.kind).toBe("approaches");
    expect(rules.allocation).toMatchObject({ kind: "shape", cap: 3 });
    expect(rules.stress.tracks.map(t => t.id)).toEqual(["unified"]);
    expect(rules.injuries.kind).toBe("conditions");
    expect(rules.ratings.enabled).toBe(true);
    expect(rules.scale.enabled).toBe(false);
  });

  it("reports unknown presets, options, newer versions and bad overrides instead of guessing", () => {
    const { rules, issues } = resolveFateRules(catalog, { id: "core-standard", version: 1, selection: { stress: "rated" }, overrides: {} });
    expect(rules.presetId).toBe("condensed-standard");
    expect(rules.stress.id).toBe("split");
    expect(issues).toEqual([{ reason: "unknownPreset", presetId: "core-standard" }, { reason: "unknownOption", axis: "stress", value: "rated" }]);
    expect(resolveFateRules(catalog, { id: "condensed-standard", version: 9 }).issues).toEqual([{ reason: "unsupportedVersion", presetId: "condensed-standard", version: 9 }]);
    const bad = resolveFateRules(catalog, { selection: { allocation: "point-buy" }, overrides: { pointBudget: -1 } });
    expect(bad.issues).toEqual([{ reason: "invalidOverride", key: "pointBudget" }]);
    expect(bad.rules.allocation).toMatchObject({ budget: 20, cap: 4 });
  });

  it("configures point-buy budget and cap", () => {
    const { rules } = resolveFateRules(catalog, { selection: { allocation: "point-buy" }, overrides: { pointBudget: 15, pointCap: 3 } });
    expect(rules.allocation).toMatchObject({ kind: "pointBuy", budget: 15, cap: 3 });
  });
});

describe("recipes and suggestions", () => {
  const base = resolveFateRules(catalog).rules.selection;

  it("suggests the approach spread without overwriting the chosen shape", () => {
    const step = applyFateRecipe({ ...base, allocation: "point-buy" }, "approaches", catalog);
    expect(step).toEqual({ ok: true, selection: { ...base, allocation: "point-buy", skills: "short-approaches" }, suggestions: { allocation: "fae" } });
    const viaAxis = selectFatePresetOption(base, "skills", "short-approaches", catalog);
    expect(viaAxis.ok && viaAxis.selection.allocation).toBe("pyramid");
    expect(viaAxis.ok && viaAxis.suggestions).toEqual({ allocation: "fae" });
  });

  it("switches both gear axes and refuses choosers without a value", () => {
    const gear = applyFateRecipe(base, "gear", catalog);
    expect(gear.ok && [gear.selection.ratings, gear.selection.scale]).toEqual(["srd", "srd"]);
    expect(applyFateRecipe(base, "shape", catalog)).toEqual({ ok: false, reason: "chooseOption" });
    expect(applyFateRecipe(base, "nope", catalog)).toEqual({ ok: false, reason: "unknownRecipe" });
    expect(selectFatePresetOption(base, "stress", "rated", catalog)).toEqual({ ok: false, reason: "unknownOption" });
  });
});

describe("skill roster", () => {
  const rows = [
    { id: "fight", name: "Fight", level: 4 },
    { id: "academics", level: 2 },
    { id: "custom-1", name: "Sailing", level: 1 },
    { id: "approach-quick", level: 3 },
  ];

  it("keeps other catalogs' ratings dormant and restores them on switch-back", () => {
    const toApproaches = previewFateSkillListSwitch({ rows }, list("condensed"), list("short-approaches"), catalog);
    expect(toApproaches.goingDormant.map(s => [s.id, s.rating])).toEqual([["academics", 2], ["fight", 4]]);
    expect(toApproaches.restored.map(s => [s.id, s.rating])).toEqual([["approach-quick", 3]]);
    const back = previewFateSkillListSwitch({ rows }, list("short-approaches"), list("condensed"), catalog);
    expect(back.restored.map(s => s.id)).toEqual(["academics", "fight"]);
    expect(back.goingDormant.map(s => s.id)).toEqual(["approach-quick"]);
  });

  it("never maps ranks by translated names and keeps custom rows active", () => {
    const actions = projectFateSkills({ rows }, list("short-actions"), catalog);
    expect(actions.active.find(s => s.id === "actions-fight")).toMatchObject({ rating: 0, explicit: false });
    expect(actions.active.at(-1)).toMatchObject({ id: "custom-1", rating: 1, custom: true, name: "Sailing" });
    expect(actions.dormant.map(s => s.id)).toEqual(["fight", "academics", "approach-quick"]);
  });

  it("hides by stable ID, keeps the rating dormant and follows stored order", () => {
    const core = projectFateSkills({ rows, hidden: ["fight"], order: ["will", "athletics"] }, list("core"), catalog);
    expect(core.active.slice(0, 2).map(s => s.id)).toEqual(["will", "athletics"]);
    expect(core.active.some(s => s.id === "fight")).toBe(false);
    expect(core.dormant.map(s => s.id)).toEqual(["fight", "academics", "approach-quick"]);
  });

  it("reads link ratings only from linked skills on the active list", () => {
    expect(fateLinkRatings(list("condensed"), { physique: 5, will: 1 })).toEqual({ physical: 5, mental: 1 });
    expect(fateLinkRatings(list("short-approaches"), { physique: 5 })).toEqual({});
  });
});

describe("creation shapes", () => {
  const pyramid = catalog.allocations[0];
  const diamond = catalog.allocations[1];
  const fae = catalog.allocations[2];

  it("allows gaps and warns on overages for the pyramid", () => {
    const partial = checkFateAllocation(roster({ a: 4, b: 3, c: 3, d: 3, e: 1 }), pyramid);
    expect(partial.kind === "shape" && partial.ranks).toEqual([
      { rank: 4, expected: 1, actual: 1, status: "ok" },
      { rank: 3, expected: 2, actual: 3, status: "over" },
      { rank: 2, expected: 3, actual: 0, status: "under" },
      { rank: 1, expected: 4, actual: 1, status: "under" },
    ]);
    const full = checkFateAllocation(roster({ a: 4, b: 3, c: 3, d: 2, e: 2, f: 2, g: 1, h: 1, i: 1, j: 1, k: 0, l: undefined }), pyramid);
    expect(full.complete).toBe(true);
    const over = checkFateAllocation(roster({ a: 5 }), pyramid);
    expect(over.kind === "shape" && over.overCap).toEqual(["a"]);
  });

  it("counts the diamond's +0 slot only for an explicit +0", () => {
    const ranks = { a: 4, b: 3, c: 3, d: 2, e: 2, f: 2, g: 1, h: 1 };
    const unrated = checkFateAllocation(roster({ ...ranks, i: undefined }), diamond);
    expect(unrated.kind === "shape" && unrated.ranks.at(-1)).toEqual({ rank: 0, expected: 1, actual: 0, status: "under" });
    expect(checkFateAllocation(roster({ ...ranks, i: 0 }), diamond).complete).toBe(true);
  });

  it("checks the approach spread +3/+2/+2/+1/+1/+0 with cap +3", () => {
    expect(checkFateAllocation(roster({ a: 3, b: 2, c: 2, d: 1, e: 1, f: 0 }), fae).complete).toBe(true);
    const high = checkFateAllocation(roster({ a: 4, b: 2, c: 2, d: 1, e: 1, f: 0 }), fae);
    expect(high.complete).toBe(false);
    expect(high.kind === "shape" && high.overCap).toEqual(["a"]);
  });

  it("spends point-buy against the configured budget and cap", () => {
    const { rules } = resolveFateRules(catalog, { selection: { allocation: "point-buy" } });
    expect(checkFateAllocation(roster({ a: 4, b: 4, c: 4, d: 4, e: 4 }), rules.allocation))
      .toMatchObject({ kind: "pointBuy", spent: 20, remaining: 0, complete: true });
    expect(checkFateAllocation(roster({ a: 5, b: 4 }), rules.allocation)).toMatchObject({ spent: 9, remaining: 11, overCap: ["a"], complete: false });
  });

  it("checks growth columns separately from the starting shape", () => {
    expect(checkFateColumns([4, 3, 3, 2, 2, 2, 1, 1, 1, 1])).toEqual([]);
    expect(checkFateColumns([4, 3, 3, 2, 2, 2, 2, 1, 1, 1])).toEqual([{ rank: 2, count: 4, below: 3 }]);
    expect(checkFateColumns([4, 3, 3, 2, 2, 2, 1, 1, 0])).toEqual([{ rank: 2, count: 3, below: 2 }]);
  });
});
