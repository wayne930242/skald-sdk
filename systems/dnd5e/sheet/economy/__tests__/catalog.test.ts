import { describe, expect, it } from "vitest";
import items from "@skald/system-dnd5e/data/dnd5e-2024/economy/items.json";
import { catalogItem, shopCategory, slotOf, takesBonus, type Catalog } from "../catalog";

const catalog = items as unknown as Catalog;

describe("economy catalog (plan-uat2 §3.5, SRD 5.2.1 p.91–97)", () => {
  it("prices and weighs the SRD tables' items", () => {
    expect(catalogItem(catalog, "baseItem:club")).toEqual({ ref: "baseItem:club", costCp: 10, weight: 2, type: "M" });
    expect(catalogItem(catalog, "item:explorers-pack")).toMatchObject({ costCp: 1000, weight: 55 });
    expect(catalogItem(catalog, "item:potion-of-healing")).toMatchObject({ costCp: 5000, weight: 0.5 });
    expect(catalogItem(catalog, "item:spell-scroll-level-1")).toMatchObject({ costCp: 5000 });
  });

  it("carries armor's AC, Dexterity cap, Strength requirement and Stealth disadvantage (p.92)", () => {
    expect(catalogItem(catalog, "baseItem:chain-mail")).toEqual({
      ref: "baseItem:chain-mail", costCp: 7500, weight: 55, type: "HA", armor: { ac: 16, dexCap: 0, strReq: 13, stealth: true },
    });
    expect(catalogItem(catalog, "baseItem:plate-armor")?.armor).toEqual({ ac: 18, dexCap: 0, strReq: 15, stealth: true });
    expect(catalogItem(catalog, "baseItem:splint-armor")?.armor?.strReq).toBe(15);
    expect(catalogItem(catalog, "baseItem:leather-armor")?.armor).toEqual({ ac: 11, dexCap: null, strReq: 0, stealth: false });
    expect(catalogItem(catalog, "baseItem:half-plate-armor")?.armor).toEqual({ ac: 15, dexCap: 2, strReq: 0, stealth: true });
    expect(catalogItem(catalog, "baseItem:shield")?.armor?.ac).toBe(2);
  });

  it("leaves out mounts, vehicles, ships, item groups and unpriced magic items", () => {
    const types = new Set(Object.values(catalog).map((row) => row[2]));
    for (const type of ["MNT", "VEH", "SHP", "AIR"]) expect(types.has(type), type).toBe(false);
    expect(Object.keys(catalog).filter((ref) => ref.startsWith("itemGroup:"))).toEqual([]);
    expect(catalogItem(catalog, "item:riding-horse")).toBeUndefined();
    expect(catalogItem(catalog, "item:assassins-blood")).toBeUndefined();
    expect(catalogItem(catalog, "item:spell-scroll-level-2")).toBeUndefined();
  });

  it("names slots, shop chips and the items that take a +N", () => {
    expect(slotOf(catalogItem(catalog, "baseItem:chain-shirt"))).toBe("body");
    expect(slotOf(catalogItem(catalog, "baseItem:shield"))).toBe("shield");
    expect(slotOf(catalogItem(catalog, "baseItem:longsword"))).toBeNull();
    expect(shopCategory(catalogItem(catalog, "item:explorers-pack")!)).toBe("pack");
    expect(shopCategory(catalogItem(catalog, "item:backpack")!)).toBe("gear");
    expect(shopCategory(catalogItem(catalog, "baseItem:arrows-20")!)).toBe("ammo");
    expect(shopCategory(catalogItem(catalog, "baseItem:crystal")!)).toBe("focus");
    expect(shopCategory(catalogItem(catalog, "item:thieves-tools")!)).toBe("tools");
    expect(takesBonus(catalogItem(catalog, "baseItem:longsword"))).toBe(true);
    expect(takesBonus(catalogItem(catalog, "baseItem:shield"))).toBe(true);
    expect(takesBonus(catalogItem(catalog, "item:rope"))).toBe(false);
  });
});
