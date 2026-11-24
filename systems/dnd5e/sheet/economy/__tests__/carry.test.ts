import { describe, expect, it } from "vitest";
import items from "@skald/system-dnd5e/data/dnd5e-2024/economy/items.json";
import type { Catalog } from "../catalog";
import { carryingCapacity, inventorySummary, unitWeight } from "../carry";

const catalog = items as unknown as Catalog;

describe("carrying capacity (SRD 5.2.1 p.178)", () => {
  it("multiplies Strength by the size factor", () => {
    expect(carryingCapacity({ str: 10, size: "tiny" })).toBe(75);
    expect(carryingCapacity({ str: 10, size: "small" })).toBe(150);
    expect(carryingCapacity({ str: 10, size: "medium" })).toBe(150);
    expect(carryingCapacity({ str: 10, size: "large" })).toBe(300);
    expect(carryingCapacity({ str: 10, size: "huge" })).toBe(600);
    expect(carryingCapacity({ str: 10, size: "gargantuan" })).toBe(1200);
    expect(carryingCapacity({ str: 15 })).toBe(225);
  });

  it("counts Powerful Build one size larger (p.86)", () => {
    const traits = [{ id: "species:goliath#powerful-build", name: "Powerful Build", ref: "species:goliath" }];
    expect(carryingCapacity({ str: 16, size: "medium", speciesTraits: traits })).toBe(480);
    expect(carryingCapacity({ str: 16, size: "medium", speciesTraits: [{ name: "強壯體格" }] })).toBe(480);
  });

  it("weighs a row by its own weight, then the catalog, then 0", () => {
    expect(unitWeight({ ref: "baseItem:chain-mail", weight: 40 }, catalog)).toBe(40);
    expect(unitWeight({ ref: "baseItem:chain-mail" }, catalog)).toBe(55);
    expect(unitWeight({ ref: "item:unknown" }, catalog)).toBe(0);
    expect(unitWeight({ name: "custom" }, null)).toBe(0);
  });

  it("adds the coins (50 per lb) and flags capacity and the drag limit", () => {
    const base = { str: 10, size: "medium", gp: 50, sp: 50 };
    const light = inventorySummary({ ...base, equipment: [{ ref: "baseItem:chain-mail", qty: 1 }, { ref: "item:torch", qty: 10 }] }, catalog);
    expect(light).toMatchObject({ coins: 2, carried: 67, capacity: 150, dragLimit: 300, status: "ok" });
    expect(light.rows[1]).toMatchObject({ index: 1, qty: 10, unitWeight: 1, weight: 10 });
    const over = inventorySummary({ ...base, equipment: [{ ref: "baseItem:plate-armor", qty: 2 }, { ref: "item:explorers-pack" }] }, catalog);
    expect(over).toMatchObject({ carried: 187, status: "over" });
    const drag = inventorySummary({ ...base, equipment: [{ ref: "baseItem:plate-armor", qty: 5 }] }, catalog);
    expect(drag.status).toBe("overDrag");
    expect(inventorySummary({ str: 10, equipment: [{ ref: "item:torch", qty: 150 }] }, catalog).status).toBe("ok");
    expect(inventorySummary({ str: 10, equipment: [{ ref: "item:torch", qty: 151 }] }, catalog).status).toBe("over");
  });
});
