import { describe, expect, it } from "vitest";
import { FATE_COIN_CAP, fateCoinPhonePx, fateCoinRow, fateCoinTier } from "./coin-model";

describe("fate coin row", () => {
  it("draws refresh capacity: points held are filled, the rest up to refresh hollow", () => {
    expect(fateCoinRow(2, 3)).toEqual({ coins: ["available", "available", "spent"], hidden: 0 });
    expect(fateCoinRow(0, 3)).toEqual({ coins: ["spent", "spent", "spent"], hidden: 0 });
    expect(fateCoinRow(3, 3)).toEqual({ coins: ["available", "available", "available"], hidden: 0 });
  });

  it("marks points above refresh as extra coins", () => {
    expect(fateCoinRow(4, 2)).toEqual({ coins: ["available", "available", "extra", "extra"], hidden: 0 });
  });

  it("caps the row at five coins and counts only the hidden points held", () => {
    expect(FATE_COIN_CAP).toBe(5);
    expect(fateCoinRow(7, 3)).toEqual({ coins: ["available", "available", "available", "extra", "extra"], hidden: 2 });
    // Hidden hollow capacity is not a point held: the refresh label already says how many.
    expect(fateCoinRow(1, 8)).toEqual({ coins: ["available", "spent", "spent", "spent", "spent"], hidden: 0 });
    expect(fateCoinRow(6, 8)).toEqual({ coins: ["available", "available", "available", "available", "available"], hidden: 1 });
  });

  it("treats negative or fractional input as whole non-negative counts", () => {
    expect(fateCoinRow(-1, -2)).toEqual({ coins: [], hidden: 0 });
    expect(fateCoinRow(1.8, 2.2)).toEqual({ coins: ["available", "spent"], hidden: 0 });
  });
});

describe("fate coin size tiers", () => {
  it("draws the full coin (rim, burst, knurl) from 40 px and the simplified one below", () => {
    expect(fateCoinTier(48)).toBe("full");
    expect(fateCoinTier(40)).toBe("full");
    expect(fateCoinTier(32)).toBe("simple");
    expect(fateCoinTier(28)).toBe("simple");
    expect(fateCoinTier(24)).toBe("simple");
  });

  it("shrinks phone coins once the row is full so coins and refresh share a 320 px line", () => {
    expect(fateCoinPhonePx(1)).toBe(28);
    expect(fateCoinPhonePx(4)).toBe(28);
    expect(fateCoinPhonePx(5)).toBe(24);
  });
});
