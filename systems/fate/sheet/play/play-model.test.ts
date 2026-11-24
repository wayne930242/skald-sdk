import { describe, expect, it } from "vitest";
import type { FateSkillPyramidField } from "@skald/types/schema";
import schemaJson from "@skald/system-fate/data/fate-condensed/schema.json";
import catalogJson from "@skald/system-fate/data/fate-condensed/presets/catalog.json";
import type { FateCharacterData } from "../../domain/character";
import type { FatePresetCatalog } from "../../domain/presets";
import { projectFateSheet } from "../presets/sheet-state";
import {
  fateLadderRows,
  fateSpreadHint,
  projectFatePlayAspects,
  projectFatePlaySkills,
  readFatePlaySkills,
  readFateVitalsSummary,
  visibleHighConcept,
} from "./play-model";

const fields = schemaJson.fields as Record<string, unknown>;
const skillsField = fields.skills as FateSkillPyramidField;
const catalog = catalogJson as unknown as FatePresetCatalog;
const project = (data: FateCharacterData) => projectFateSheet(data, catalog);
const preset = (selection: Record<string, string>) => ({ preset: { id: "condensed-standard", version: 1, selection } });

describe("Fate play model", () => {
  it("lists every Condensed skill, rated rows first by their rung and the rest at +0", () => {
    const skills = readFatePlaySkills({ skills: { skills: [{ id: "fight", name: "戰鬥", level: 4 }, { id: "custom-1", name: "輕功", level: 2 }] } }, skillsField);
    expect(skills).toHaveLength(20);
    expect(skills.find((skill) => skill.id === "fight")).toMatchObject({ rating: 4 });
    expect(skills.find((skill) => skill.id === "custom-1")).toMatchObject({ rating: 2, customName: "輕功" });
    expect(skills.filter((skill) => skill.rating === 0)).toHaveLength(18);
  });

  it("keeps +4..+1 rungs, folds empty outer rungs and lists +0 compactly", () => {
    const rows = fateLadderRows(readFatePlaySkills({ skills: { skills: [{ id: "fight", level: 4 }] } }, skillsField));
    expect(rows.map((row) => (row.kind === "collapsed" ? `${row.from}~${row.to}` : `${row.rating}:${row.skills.length}`))).toEqual([
      "8~5", "4:1", "3:0", "2:0", "1:0", "0:18",
    ]);
    const high = fateLadderRows(readFatePlaySkills({ skills: { skills: [{ id: "fight", level: 6 }, { id: "lore", level: -1 }] } }, skillsField));
    expect(high.map((row) => (row.kind === "collapsed" ? `${row.from}~${row.to}` : `${row.rating}:${row.skills.length}`))).toEqual([
      "8~7", "6:1", "5:0", "4:0", "3:0", "2:0", "1:0", "0:17", "-1:1",
    ]);
  });

  it("reports the active spread per column and allows blanks", () => {
    const empty = fateSpreadHint(project({}).roster.active, project({}).rules.allocation);
    expect(empty).toEqual({ kind: "shape", complete: false, columns: [{ rating: 4, filled: 0, required: 1 }, { rating: 3, filled: 0, required: 2 }, { rating: 2, filled: 0, required: 3 }, { rating: 1, filled: 0, required: 4 }] });
    const full = project({ skills: { skills: [
      { id: "fight", level: 4 }, { id: "stealth", level: 3 }, { id: "athletics", level: 3 },
      { id: "notice", level: 2 }, { id: "will", level: 2 }, { id: "deceive", level: 2 },
      { id: "physique", level: 1 }, { id: "empathy", level: 1 }, { id: "contacts", level: 1 }, { id: "investigate", level: 1 },
    ] } });
    expect(fateSpreadHint(full.roster.active, full.rules.allocation).complete).toBe(true);
    const fae = project({ fateV2: preset({ skills: "short-approaches", allocation: "fae" }), skills: { skills: [{ id: "approach-quick", level: 3 }, { id: "approach-careful", level: 0 }] } });
    expect(fateSpreadHint(fae.roster.active, fae.rules.allocation)).toMatchObject({ kind: "shape", columns: [
      { rating: 3, filled: 1, required: 1 }, { rating: 2, filled: 0, required: 2 }, { rating: 1, filled: 0, required: 2 }, { rating: 0, filled: 1, required: 1 },
    ] });
    const points = project({ fateV2: preset({ allocation: "point-buy" }), skills: { skills: [{ id: "fight", level: 4 }, { id: "lore", level: 2 }] } });
    expect(fateSpreadHint(points.roster.active, points.rules.allocation)).toEqual({ kind: "pointBuy", complete: false, spent: 6, budget: 20 });
  });

  it("projects the active list's roster, keeping the player's names and dropping other lists", () => {
    const data = { fateV2: preset({ skills: "short-approaches" }), skills: { skills: [{ id: "fight", name: "戰鬥", level: 4 }, { id: "approach-quick", level: 3 }, { id: "custom-1", name: "輕功", level: 2 }] } };
    const skills = projectFatePlaySkills(data, skillsField, project(data).roster.active);
    expect(skills.map((skill) => skill.id)).toEqual(["approach-careful", "approach-clever", "approach-flashy", "approach-forceful", "approach-quick", "approach-sneaky", "custom-1"]);
    expect(skills.find((skill) => skill.id === "approach-quick")).toEqual({ id: "approach-quick", rating: 3 });
    expect(skills.find((skill) => skill.id === "custom-1")).toEqual({ id: "custom-1", rating: 2, customName: "輕功" });
  });

  it("summarizes stress and injuries for the active preset (split 3/4/6, unified, conditions)", () => {
    const boxes = (level: number) => readFateVitalsSummary({}, project({ skills: { skills: [{ id: "physique", level }] } }).harm).tracks[0].boxes;
    expect([boxes(0), boxes(1), boxes(2), boxes(3), boxes(5)]).toEqual([3, 4, 4, 6, 6]);
    const split = { physicalStress: [1, 5], mildConsequence: "肩頭的刀傷" };
    expect(readFateVitalsSummary(split, project(split).harm)).toMatchObject({
      tracks: [{ id: "physical", marked: 1, boxes: 3 }, { id: "mental", marked: 0, boxes: 3 }],
      injuryKind: "consequences",
      injuries: [{ id: "mild", severity: "mild", text: "肩頭的刀傷" }],
    });
    const variant = { fateV2: { ...preset({ stress: "unified", injuries: "conditions" }), harm: { unifiedStress: [2], conditions: { "hurt:1": { text: "" } } } } };
    expect(readFateVitalsSummary(variant, project(variant).harm)).toMatchObject({
      tracks: [{ id: "unified", marked: 1, boxes: 6 }],
      injuryKind: "conditions",
      injuries: [{ id: "hurt", severity: "mild" }],
    });
  });

  it("hides a secret aspect's text, label and old flat value from an unknown viewer", () => {
    const data = {
      highConcept: "舊的高概念",
      aspects: [{ id: "highConcept", label: "我的身分", value: "東廠臥底", secret: true }, { id: "trouble", value: "一句不平便拔劍" }],
    };
    const hidden = projectFatePlayAspects(data, "unknown");
    expect(JSON.stringify(hidden)).not.toMatch(/東廠臥底|舊的高概念|我的身分/);
    expect(hidden.permanent[0]).toMatchObject({ id: "highConcept", hidden: true, text: "" });
    expect(visibleHighConcept(hidden.permanent)).toBe("");
    const shown = projectFatePlayAspects(data, "authorized");
    expect(shown.permanent[0]).toMatchObject({ hidden: false, text: "東廠臥底" });
  });

  it("splits held situation aspects and boosts from the character's own", () => {
    const { permanent, held } = projectFatePlayAspects({ aspects: { format: 2, aspects: [
      { id: "a", kind: "highConcept", text: "x" }, { id: "b", kind: "boost", text: "破綻" }, { id: "c", kind: "situation", text: "賓客", freeInvokes: 1 },
    ] } }, "unknown");
    expect(permanent.map((row) => row.id)).toEqual(["a"]);
    expect(held.map((row) => [row.id, row.freeInvokes])).toEqual([["b", 1], ["c", 1]]);
  });
});
