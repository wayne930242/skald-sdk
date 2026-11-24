import { describe, expect, it } from "vitest";
import { addCoins, coinWeight, convert, gpValue, priceCoin, purseOf, spend, totalCp, type Purse } from "../coins";

const purse = (coins: Partial<Purse>): Purse => ({ cp: 0, sp: 0, ep: 0, gp: 0, pp: 0, ...coins });

describe("coin purse (SRD 5.2.1 p.89)", () => {
  it("reads the sheet's coins, totals them in copper and weighs 50 coins to the pound", () => {
    const own = purseOf({ cp: 5, sp: "3", ep: 1, gp: 12, pp: 2, junk: 1 });
    expect(own).toEqual({ cp: 5, sp: 3, ep: 1, gp: 12, pp: 2 });
    expect(totalCp(own)).toBe(5 + 30 + 50 + 1200 + 2000);
    expect(gpValue(totalCp(own))).toBe(32.85);
    expect(coinWeight(purse({ gp: 50 }))).toBe(1);
    expect(purseOf({ gp: -3, sp: "x" })).toEqual(purse({}));
  });

  it("adds income coin by coin", () => {
    expect(addCoins(purse({ gp: 2 }), { gp: 3, sp: 4 })).toEqual(purse({ gp: 5, sp: 4 }));
  });

  it("spends lower coins first and gives change in GP/SP/CP when a larger coin is broken", () => {
    expect(spend(purse({ cp: 20, gp: 3 }), 120)).toEqual(purse({ cp: 0, gp: 2 }));
    // 75 GP from 10 PP: seven PP, then one PP broken for 5 GP change.
    expect(spend(purse({ pp: 10 }), 7500)).toEqual(purse({ pp: 2, gp: 5 }));
    // 5 CP from 1 GP: 95 CP change as 9 SP and 5 CP.
    expect(spend(purse({ gp: 1 }), 5)).toEqual(purse({ sp: 9, cp: 5 }));
    const paid = spend(purse({ cp: 9, sp: 1, ep: 1, gp: 4 }), 466)!;
    expect(totalCp(paid)).toBe(9 + 10 + 50 + 400 - 466);
    expect(Object.values(paid).every((count) => count >= 0)).toBe(true);
  });

  it("refuses to spend more than the purse holds", () => {
    expect(spend(purse({ gp: 1, sp: 9 }), 200)).toBeNull();
    expect(spend(purse({}), 0)).toEqual(purse({}));
  });

  it("converts at SRD rates, up only in exact multiples", () => {
    expect(convert(purse({ gp: 2 }), "gp", "sp", 1)).toEqual(purse({ gp: 1, sp: 10 }));
    expect(convert(purse({ sp: 25 }), "sp", "gp", 20)).toEqual(purse({ sp: 5, gp: 2 }));
    expect(convert(purse({ sp: 25 }), "sp", "gp", 12)).toBeNull();
    expect(convert(purse({ ep: 2 }), "ep", "gp", 2)).toEqual(purse({ gp: 1 }));
    expect(convert(purse({ gp: 1 }), "gp", "sp", 2)).toBeNull();
    expect(convert(purse({ pp: 1 }), "pp", "ep", 1)).toEqual(purse({ ep: 20 }));
  });

  it("prints a price in its largest whole coin", () => {
    expect(priceCoin(7500)).toEqual({ amount: 75, coin: "gp" });
    expect(priceCoin(50)).toEqual({ amount: 5, coin: "sp" });
    expect(priceCoin(5)).toEqual({ amount: 5, coin: "cp" });
    expect(priceCoin(0)).toEqual({ amount: 0, coin: "gp" });
  });
});
