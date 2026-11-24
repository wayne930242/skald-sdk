import { describe, expect, it } from "vitest";
import items from "@skald/system-dnd5e/data/dnd5e-2024/economy/items.json";
import type { Catalog } from "../catalog";
import { attune, isAttuned, linkAttack, patchItem, toggleEquipped, unattune } from "../equip";

const catalog = items as unknown as Catalog;

const row = (id: string, ref: string, extra: Record<string, unknown> = {}) => ({ id, name: id, qty: 1, ref, origin: "srd", equipped: false, ...extra });

describe("equip slots and AC inputs (plan-uat2 §3.3, SRD 5.2.1 p.92)", () => {
  it("equipping chain mail takes off the other body armor and writes heavy / 16 + bonus / Str 13 / Stealth", () => {
    const data = {
      armorType: "medium", armorBase: 13, shield: false,
      equipment: [row("shirt", "baseItem:chain-shirt", { equipped: true }), row("mail", "baseItem:chain-mail", { bonus: 1 }), row("rope", "item:rope", { equipped: true })],
    };
    const result = toggleEquipped(data, 1, catalog);
    expect(result.swapped).toEqual([0]);
    expect(result.acUpdated).toBe(true);
    expect((result.data.equipment as Array<{ equipped: boolean }>).map((item) => item.equipped)).toEqual([false, true, true]);
    expect(result.data).toMatchObject({ armorType: "heavy", armorBase: 17, armorStrReq: 13, armorStealth: true, shield: false });
    expect(result.data).not.toHaveProperty("shieldBonus");
  });

  it("a shield writes shield and shieldBonus, and leaves the body armor fields alone", () => {
    const data = { armorType: "heavy", armorBase: 16, equipment: [row("shield", "baseItem:shield", { bonus: 2 })] };
    const result = toggleEquipped(data, 0, catalog);
    expect(result.data).toMatchObject({ shield: true, shieldBonus: 2, armorType: "heavy", armorBase: 16 });
    expect(toggleEquipped(result.data, 0, catalog).data).toMatchObject({ shield: false, shieldBonus: 0 });
  });

  it("unequipping the last armor leaves none", () => {
    const data = { armorType: "light", armorBase: 11, equipment: [row("leather", "baseItem:leather-armor", { equipped: true })] };
    expect(toggleEquipped(data, 0, catalog).data).toMatchObject({ armorType: "none", armorBase: 0, armorStrReq: 0, armorStealth: false });
  });

  it("other gear toggles freely and writes no AC input; untouched data stays as stored", () => {
    const data = { armorType: "medium", armorBase: 14, shield: true, equipment: [row("a", "item:rope"), row("b", "item:torch", { equipped: true })] };
    const result = toggleEquipped(data, 0, catalog);
    expect(result).toMatchObject({ swapped: [], acUpdated: false });
    expect(result.data).toEqual({ ...data, equipment: [{ ...data.equipment[0], equipped: true }, data.equipment[1]] });
    // A custom item without a catalog base, too.
    expect(toggleEquipped({ equipment: [{ id: "x", name: "Ring" }] }, 0, catalog).data).toEqual({ equipment: [{ id: "x", name: "Ring", equipped: true }] });
  });

  it("a magic armor row keeps its base ref: slot, AC and Strength come from the base", () => {
    const data = { equipment: [row("plate", "baseItem:plate-armor", { origin: "custom", name: "Dwarven Plate", bonus: 2 })] };
    expect(toggleEquipped(data, 0, catalog).data).toMatchObject({ armorType: "heavy", armorBase: 20, armorStrReq: 15 });
  });
});

describe("item settings reach linked attacks and worn armor (plan-uat2 §3.3)", () => {
  const sword = row("sword", "baseItem:longsword");
  const data = {
    equipment: [sword, row("mail", "baseItem:chain-mail", { equipped: true })],
    armorType: "heavy", armorBase: 16,
    weapons: [linkAttack({ id: "w1", name: "sword", magic: 0 }, sword), { id: "w2", name: "Longsword", magic: 0 }],
  };

  it("a new name or +N updates the attacks made from the item, not an unlinked attack", () => {
    const result = patchItem(data, 0, { name: "Dawn", bonus: 1 }, catalog);
    expect(result.data.weapons).toEqual([
      { id: "w1", name: "Dawn", magic: 1, itemId: "sword" },
      { id: "w2", name: "Longsword", magic: 0 },
    ]);
    expect(result.acUpdated).toBe(false);
  });

  it("a +N on worn armor rewrites its AC base", () => {
    const result = patchItem(data, 1, { bonus: 1 }, catalog);
    expect(result).toMatchObject({ acUpdated: true, data: { armorBase: 17 } });
    expect(patchItem(data, 1, { notes: "dented" }, catalog).data.armorBase).toBe(16);
  });

  it("「加為攻擊」 links the attack and carries the +N", () => {
    expect(linkAttack({ id: "w3", name: "x", magic: 0 }, { id: "bow", bonus: 2 })).toEqual({ id: "w3", name: "x", magic: 2, itemId: "bow" });
  });
});

describe("attunement (three slots)", () => {
  it("takes the first free slot and refuses a fourth item", () => {
    expect(attune({ attunement1: "Ring" }, "Cloak")).toEqual({ attunement2: "Cloak" });
    expect(attune({ attunement1: "Cloak" }, "Cloak")).toEqual({});
    expect(attune({ attunement1: "A", attunement2: "B", attunement3: "C" }, "D")).toBeNull();
    expect(isAttuned({ attunement3: "Cloak " }, "Cloak")).toBe(true);
    expect(unattune({ attunement1: "A", attunement2: "Cloak" }, "Cloak")).toEqual({ attunement2: "" });
  });
});
