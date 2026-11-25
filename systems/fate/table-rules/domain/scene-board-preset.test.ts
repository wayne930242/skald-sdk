import { describe, expect, it } from "vitest";
import { exportFateSceneBoard, fateSceneBoardOverflow, parseFateSceneBoard } from "./scene-board-preset";

// Synthetic fixtures only: this file is part of the SDK export.
const board = {
  zones: [{ name: "Warehouse" }, { name: "Roof" }],
  aspects: [{ text: "Dark", secret: false, zone: null }, { text: "Hidden sniper", secret: true, zone: 1 }],
};

describe("Fate scene board provider", () => {
  it.each([
    ["valid", board, true],
    ["trims", { zones: [{ name: "  a " }], aspects: [] }, true],
    ["empty", { zones: [], aspects: [] }, false],
    ["unknown key", { ...board, extra: 1 }, false],
    ["zone ref out of range", { zones: [], aspects: [{ text: "a", secret: false, zone: 0 }] }, false],
    ["long name", { zones: [{ name: "x".repeat(81) }], aspects: [] }, false],
    ["blank text", { zones: [], aspects: [{ text: "  ", secret: false, zone: null }] }, false],
    ["secret not boolean", { zones: [], aspects: [{ text: "a", secret: "yes", zone: null }] }, false],
    ["too many zones", { zones: Array.from({ length: 21 }, () => ({ name: "z" })), aspects: [] }, false],
  ])("%s", (_, raw, ok) => {
    expect(parseFateSceneBoard(raw).board !== null).toBe(ok);
  });
  it("exports an open scene, dropping boosts and character aspects", () => {
    expect(exportFateSceneBoard({
      zones: [{ id: "z1", name: "Warehouse" }, { id: "z2", name: "Roof" }],
      aspects: [
        { kind: "situation", scope: "scene", zoneId: null, text: "Dark", secret: false },
        { kind: "situation", scope: "zone", zoneId: "z2", text: "Hidden sniper", secret: true },
        { kind: "boost", scope: "scene", zoneId: null, text: "Boost", secret: false },
        { kind: "situation", scope: "character", zoneId: null, text: "On PC", secret: false },
      ],
    })).toEqual(board);
  });

  it("refuses, rather than cuts, a scene over the preset limits", () => {
    const zones = Array.from({ length: 21 }, (_, index) => ({ id: `z${index}`, name: `Z${index}` }));
    const aspect = { kind: "situation", scope: "scene", zoneId: null, text: "a", secret: false };
    expect(fateSceneBoardOverflow({ zones, aspects: [] })).toBe("zones");
    expect(fateSceneBoardOverflow({ zones: [], aspects: Array.from({ length: 51 }, () => aspect) })).toBe("aspects");
    expect(fateSceneBoardOverflow({ zones: zones.slice(0, 20), aspects: Array.from({ length: 50 }, () => aspect) })).toBeNull();
    expect(exportFateSceneBoard({ zones, aspects: [] }).zones).toHaveLength(21);
  });
});
