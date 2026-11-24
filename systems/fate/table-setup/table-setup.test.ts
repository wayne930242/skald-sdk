import { beforeAll, describe, expect, it } from "vitest";
import { loadFatePresetCatalog, type FatePresetCatalog } from "../domain/presets";
import { projectFateSheet } from "../sheet/presets/sheet-state";
import defaultData from "@skald/system-fate/data/fate-condensed/default-data.json";
import { importFateCharacterRecipe } from "./character-recipe";
import { fateTableSetupRules } from "./character-rules";
import {
  fateTableSetupLocks,
  parseFateTableSetup,
  summarizeFateTableSetup,
  type FateTableSetupConfig,
} from "./config";
import { fateTableSetupProvider } from "./manifest";

let catalog: FatePresetCatalog;
beforeAll(async () => { catalog = await loadFatePresetCatalog(); });

const unifiedLocked: FateTableSetupConfig = {
  presetId: "condensed-standard",
  selection: { stress: { value: "unified", policy: "locked" }, injuries: { value: "conditions", policy: "default" } },
  overrides: {},
};

describe("Fate table setup config (ADR 0016 S2)", () => {
  it("parses a stored recipe and keeps each item's policy", () => {
    const { config, issues } = parseFateTableSetup({
      presetId: "condensed-standard",
      selection: { stress: { value: "unified", policy: "locked" }, allocation: { value: "point-buy", policy: "default" } },
      overrides: { pointBudget: { value: 25, policy: "locked" } },
    });
    expect(issues).toEqual([]);
    expect(config.selection.stress).toEqual({ value: "unified", policy: "locked" });
    expect(config.selection.allocation).toEqual({ value: "point-buy", policy: "default" });
    expect(config.overrides.pointBudget).toEqual({ value: 25, policy: "locked" });
  });

  it("reports unknown items and malformed values as issues and leaves them out, rewriting nothing", () => {
    const raw = {
      selection: { stress: { value: "unified", policy: "sometimes" }, weather: { value: "rain", policy: "locked" }, skills: { value: 3, policy: "locked" } },
      overrides: { pointCap: { value: -1, policy: "locked" } },
    };
    const before = JSON.stringify(raw);
    const { config, issues } = parseFateTableSetup(raw);
    expect(config.selection).toEqual({});
    expect(config.overrides).toEqual({});
    expect(issues.map((issue) => issue.path).sort()).toEqual(["overrides.pointCap", "selection.skills", "selection.stress", "selection.weather"]);
    expect(JSON.stringify(raw)).toBe(before);
  });

  it("reads nothing stored as an empty recipe without issues", () => {
    expect(parseFateTableSetup(undefined)).toEqual({ config: { selection: {}, overrides: {} }, issues: [] });
    expect(parseFateTableSetup("x").issues).toHaveLength(1);
  });

  it("summarizes items in axis order with scopes: the starting shape and its points only seed, the rest is ongoing", () => {
    const items = summarizeFateTableSetup({
      ...unifiedLocked,
      selection: { ...unifiedLocked.selection, allocation: { value: "pyramid", policy: "locked" } },
      overrides: { pointBudget: { value: 20, policy: "default" } },
    });
    expect(items.map((item) => [item.id, item.policy, item.scope])).toEqual([
      ["allocation", "locked", "creation"],
      ["stress", "locked", "ongoing"],
      ["injuries", "default", "ongoing"],
      ["pointBudget", "default", "creation"],
    ]);
    expect(items[1]).toMatchObject({ labelKey: "fateTableSetup.items.stress", valueLabelKey: "fateTableSetup.options.stress.unified" });
    expect(items[3]).toMatchObject({ valueLabelKey: "fateTableSetup.points", values: { value: 20 } });
  });

  it("lists only locked items as locks", () => {
    expect(fateTableSetupLocks(unifiedLocked)).toEqual({ axes: { stress: "unified" }, overrides: {} });
  });

  it("is the provider of fate-condensed with lazy parts", () => {
    expect(fateTableSetupProvider).toMatchObject({ id: "fate-condensed", protocolVersion: 1, systemSlugs: ["fate-condensed"] });
    expect(fateTableSetupProvider.parse(unifiedLocked).config).toEqual(unifiedLocked);
  });
});

describe("importing a Fate character recipe", () => {
  it("sets all seven axes, retaining existing policies and locking new items", () => {
    const recipe = {
      id: "condensed-standard",
      version: 1,
      selection: { skills: "condensed", allocation: "point-buy", stress: "unified", injuries: "conditions", extreme: "off", ratings: "off", scale: "off" },
      overrides: { pointBudget: 31, pointCap: 5, other: 4 },
    };
    expect(importFateCharacterRecipe({ ...unifiedLocked, overrides: { pointCap: { value: 2, policy: "default" } } }, recipe, catalog)).toEqual({
      presetId: "condensed-standard",
      selection: {
        skills: { value: "condensed", policy: "locked" },
        allocation: { value: "point-buy", policy: "locked" },
        stress: { value: "unified", policy: "locked" },
        injuries: { value: "conditions", policy: "default" },
        extreme: { value: "off", policy: "locked" },
        ratings: { value: "off", policy: "locked" },
        scale: { value: "off", policy: "locked" },
      },
      overrides: { pointBudget: { value: 31, policy: "locked" }, pointCap: { value: 5, policy: "default" } },
    });
  });

  it("uses the card's effective defaults and clears stale overrides", () => {
    const before: FateTableSetupConfig = { ...unifiedLocked, overrides: { pointBudget: { value: 31, policy: "locked" } } };
    const shape = importFateCharacterRecipe(before, { overrides: { pointBudget: 25 } }, catalog);
    expect(shape.selection.allocation).toEqual({ value: "pyramid", policy: "locked" });
    expect(shape.selection.stress).toEqual({ value: "split", policy: "locked" });
    expect(shape.overrides).toEqual({});

    const pointBuy = importFateCharacterRecipe(before, { selection: { allocation: "point-buy" }, overrides: { pointCap: -5 } }, catalog);
    expect(pointBuy.overrides).toEqual({});
  });
});

describe("Fate table setup character rules", () => {
  it("seeds a blank card's recipe with every axis, the table's values over the preset's", () => {
    const seeded = fateTableSetupRules(catalog).seedBlank!(unifiedLocked, defaultData as Record<string, unknown>);
    const v2 = seeded.fateV2 as Record<string, unknown>;
    expect(v2.refresh).toEqual({ base: 3, earned: 0 });
    expect(v2.preset).toEqual({
      id: "condensed-standard",
      version: 1,
      selection: { skills: "condensed", allocation: "pyramid", stress: "unified", injuries: "conditions", extreme: "off", ratings: "off", scale: "off" },
      overrides: {},
    });
    const sheet = projectFateSheet(seeded, catalog);
    expect(sheet.harm.stress.map((track) => [track.id, track.capacity])).toEqual([["unified", 6]]);
  });

  it("seeds point overrides and skips an option the catalog no longer has", () => {
    const seeded = fateTableSetupRules(catalog).seedBlank!({
      selection: { allocation: { value: "point-buy", policy: "locked" }, stress: { value: "retired", policy: "locked" } },
      overrides: { pointBudget: { value: 25, policy: "locked" } },
    }, {});
    expect((seeded.fateV2 as { preset: unknown }).preset).toMatchObject({
      selection: { allocation: "point-buy", stress: "split" },
      overrides: { pointBudget: 25 },
    });
  });

  it("without a setup leaves Condensed's default: split physical and mental, three boxes each", () => {
    const seeded = fateTableSetupRules(catalog).seedBlank!({ selection: {}, overrides: {} }, {});
    const sheet = projectFateSheet(seeded, catalog);
    expect(sheet.harm.stress.map((track) => [track.id, track.capacity])).toEqual([["physical", 3], ["mental", 3]]);
  });

  it("applies differing ongoing items, reports them, and ignores creation-only ones", () => {
    const card = { fateV2: { preset: { id: "condensed-standard", version: 1, selection: { stress: "split", allocation: "diamond" }, overrides: {} }, keep: 1 } };
    const result = fateTableSetupRules(catalog).apply!({
      ...unifiedLocked,
      selection: { ...unifiedLocked.selection, allocation: { value: "pyramid", policy: "locked" } },
    }, card);
    expect(result.changes.map((change) => [change.itemId, change.fromLabelKey, change.toLabelKey, change.policy])).toEqual([
      ["stress", "fateTableSetup.options.stress.split", "fateTableSetup.options.stress.unified", "locked"],
      ["injuries", "fateTableSetup.options.injuries.consequences", "fateTableSetup.options.injuries.conditions", "default"],
    ]);
    expect(result.blocked).toEqual([]);
    const v2 = result.data.fateV2 as { preset: { selection: Record<string, string> }; keep: number };
    expect(v2.keep).toBe(1);
    expect(v2.preset.selection).toMatchObject({ stress: "unified", injuries: "conditions", allocation: "diamond" });
  });

  it("applies only the asked items", () => {
    const result = fateTableSetupRules(catalog).apply!(unifiedLocked, {}, ["stress"]);
    expect(result.changes.map((change) => change.itemId)).toEqual(["stress"]);
    expect(projectFateSheet(result.data, catalog).rules.selection).toMatchObject({ stress: "unified", injuries: "consequences" });
  });

  it("reports nothing on a card that already follows the setup", () => {
    const seeded = fateTableSetupRules(catalog).seedBlank!(unifiedLocked, {});
    const result = fateTableSetupRules(catalog).apply!(unifiedLocked, seeded);
    expect(result).toEqual({ data: seeded, changes: [], blocked: [] });
  });

  it("blocks a stress switch while stress boxes are marked (the harm-occupancy guard), applying the rest", () => {
    const card = { physicalStress: [1] };
    const result = fateTableSetupRules(catalog).apply!(unifiedLocked, card);
    expect(result.blocked).toEqual([{ itemId: "stress", labelKey: "fateTableSetup.items.stress", reasonKey: "fateTableSetup.blocked.stress" }]);
    expect(result.changes.map((change) => change.itemId)).toEqual(["injuries"]);
    expect(projectFateSheet(result.data, catalog).rules.selection).toMatchObject({ stress: "split", injuries: "conditions" });
  });
});
