import { describe, expect, it } from "vitest";
import items from "@skald/system-dnd5e/data/dnd5e-2024/economy/items.json";
import type { Catalog } from "../catalog";
import { affordable, cartCost, purchase, shopItems } from "../shop";

const catalog = items as unknown as Catalog;

let next = 0;
const build = {
  row: (ref: string, qty: number) => ({ id: `new${next++}`, ref, qty, name: ref, origin: "srd", equipped: false }),
  attack: (row: Record<string, unknown>) => (row.ref === "baseItem:dagger" ? { id: `w${next++}`, name: row.name, itemId: row.id } : null),
};

describe("shop purchase (plan-uat2 §3.5)", () => {
  it("spends the cart's total and merges into an unequipped row of the same ref", () => {
    const data = { gp: 20, equipment: [{ id: "t", ref: "item:torch", qty: 2, equipped: false }, { id: "d", ref: "baseItem:dagger", qty: 1, equipped: true }] };
    expect(cartCost({ "item:torch": 3, "baseItem:dagger": 1 }, catalog)).toBe(203);
    const result = purchase(data, { "item:torch": 3, "baseItem:dagger": 1 }, catalog, build)!;
    expect(result.spentCp).toBe(203);
    expect(result.before).toMatchObject({ gp: 20 });
    expect(result.data).toMatchObject({ gp: 17, sp: 9, cp: 7 });
    const equipment = result.data.equipment as Array<Record<string, unknown>>;
    expect(equipment[0]).toMatchObject({ id: "t", qty: 5 });
    // The worn dagger is not merged into: a new row, with its linked attack.
    expect(equipment[2]).toMatchObject({ ref: "baseItem:dagger", qty: 1, equipped: false });
    expect(result.data.weapons).toEqual([{ id: expect.any(String), name: "baseItem:dagger", itemId: equipment[2].id }]);
  });

  it("refuses a purchase the purse cannot pay, an empty cart and an unpriced item", () => {
    const data = { gp: 1, equipment: [] };
    expect(affordable(data, { "baseItem:chain-mail": 1 }, catalog)).toBe(false);
    expect(purchase(data, { "baseItem:chain-mail": 1 }, catalog, build)).toBeNull();
    expect(purchase(data, {}, catalog, build)).toBeNull();
    expect(purchase({ gp: 100 }, { "item:trinket": 1 }, catalog, build)).toBeNull();
  });

  it("adds no second attack for a weapon row that already has one", () => {
    const data = { gp: 10, equipment: [{ id: "d", ref: "baseItem:dagger", qty: 1, equipped: false }], weapons: [{ id: "w", itemId: "d" }] };
    const result = purchase(data, { "baseItem:dagger": 1 }, catalog, build)!;
    expect(result.data.weapons).toEqual([{ id: "w", itemId: "d" }]);
  });

  it("sells the priced items, not the single units a bundle prices", () => {
    const refs = shopItems(catalog).map((item) => item.ref);
    expect(refs).toEqual(expect.arrayContaining(["baseItem:arrows-20", "item:iron-spikes", "baseItem:chain-mail", "item:potion-of-healing"]));
    expect(refs).not.toContain("baseItem:arrow");
    expect(refs).not.toContain("item:iron-spike");
    expect(refs).not.toContain("item:trinket");
  });
});
