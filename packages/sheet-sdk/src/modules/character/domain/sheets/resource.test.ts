import { describe, expect, it } from "vitest";
import {
  clampResource,
  resolveResourceSource,
  resourceBand,
  resourceCurrentPath,
  resourceRatio,
  stepResource,
} from "./resource";

describe("resource 純運算", () => {
  it("resolveResourceSource：固定數字、衍生值、取不到", () => {
    const read = (id: string) => ({ hp_max: 11, bad: "x" })[id as "hp_max"];
    expect(resolveResourceSource(7, read)).toBe(7);
    expect(resolveResourceSource({ from: "hp_max" }, read)).toBe(11);
    expect(resolveResourceSource({ from: "bad" }, read)).toBeUndefined();
    expect(resolveResourceSource({ from: "missing" }, read)).toBeUndefined();
    expect(resolveResourceSource(undefined, read)).toBeUndefined();
  });

  it("resourceCurrentPath 預設 <id>.current", () => {
    expect(resourceCurrentPath({ id: "hp" })).toBe("hp.current");
    expect(resourceCurrentPath({ id: "hp", current: "stats.hp" })).toBe(
      "stats.hp",
    );
  });

  it("clampResource：下限 0，有上限時不超過上限", () => {
    expect(clampResource(-3)).toBe(0);
    expect(clampResource(40)).toBe(40);
    expect(clampResource(12, 11)).toBe(11);
  });

  it("stepResource：依步進與方向移動並限制範圍", () => {
    expect(stepResource(9, 1, 1, 11)).toBe(10);
    expect(stepResource(11, 1, 1, 11)).toBe(11);
    expect(stepResource(0, -1, 1, 11)).toBe(0);
    expect(stepResource(50, -1, 5, 99)).toBe(45);
    expect(stepResource(2, 1, 1)).toBe(3);
    expect(stepResource(2, 1, 0)).toBe(3);
  });

  it("resourceRatio 與 resourceBand", () => {
    expect(resourceRatio(9, 11)).toBeCloseTo(9 / 11);
    expect(resourceRatio(20, 11)).toBe(1);
    expect(resourceRatio(-1, 11)).toBe(0);
    expect(resourceRatio(3, undefined)).toBeUndefined();
    expect(resourceRatio(3, 0)).toBeUndefined();
    expect(resourceBand(undefined)).toBeUndefined();
    expect(resourceBand(0.8)).toBe("ok");
    expect(resourceBand(0.5)).toBe("low");
    expect(resourceBand(0.25)).toBe("crit");
    expect(resourceBand(0)).toBe("crit");
  });
});
