import { describe, expect, it } from "vitest";
import weapons from "@skald/system-dnd5e/data/dnd5e-2024/game/weapons.json";
import defaultData from "@skald/system-dnd5e/data/dnd5e-2024/default-data.json";
import macros from "@skald/system-dnd5e/data/dnd5e-2024/roll-macros.json";
import { executeExpressionWithMacros, type RollMacroRegistry } from "@skald/dice";
import {
  adjustHitPoints,
  hitDice,
  cantripDice,
  hitPoints,
  keptD20,
  longRestPatch,
  slotForSpell,
  spellGroups,
  spellSlots,
  spendHitDie,
  tapSlotPip,
  weaponAttackRow,
  weaponsByRef,
  type AttackLabels,
} from "../play-model";

const labels = (name: string): AttackLabels => ({
  name,
  damageType: (code) => ({ P: "Piercing", B: "Bludgeoning", S: "Slashing" })[code] ?? code,
  mastery: (ref) => ref.split(":")[1] ?? ref,
  property: (ref) => ref.split(":")[1] ?? ref,
});
const byRef = weaponsByRef(weapons);

describe("spell slot pips", () => {
  const wizard = { slot1Total: 2, slot1Used: 0, slot2Total: 0 };

  it("lists only levels that have slots", () => {
    expect(spellSlots(wizard)).toEqual([{ level: 1, total: 2, used: 0 }]);
  });

  it("an open pip spends a slot, a spent pip gives one back", () => {
    const [level1] = spellSlots(wizard);
    expect(tapSlotPip(level1, 0)).toBe(1);
    const afterOne = { ...level1, used: 1 };
    expect(tapSlotPip(afterOne, 0)).toBe(2);
    expect(tapSlotPip(afterOne, 1)).toBe(0);
  });

  it("casting picks the lowest open slot at or above the spell's level", () => {
    expect(slotForSpell({ slot1Total: 2, slot1Used: 2, slot2Total: 1, slot2Used: 0 }, 1)).toEqual({ field: "slot2Used", used: 1 });
    expect(slotForSpell({ slot1Total: 2, slot1Used: 2 }, 1)).toBeNull();
    expect(slotForSpell({ pactSlots: 1, pactSlotLevel: 1, pactUsed: 0 }, 1)).toEqual({ field: "pactUsed", used: 1 });
  });

  it("a long rest restores every slot, HP, Hit Point Dice and clears death saves", () => {
    const patch = longRestPatch({
      hpMax: 8, hp: { current: 2 }, hpTemp: 3, hitDiceSpent: 1, slot1Used: 2, slot3Used: 1, pactUsed: 1,
      deathSuccesses: 1, deathFailures: 2,
    });
    expect(patch).toMatchObject({
      hp: { current: 8 }, hpTemp: 0, hitDiceSpent: 0, slot1Used: 0, slot3Used: 0, pactUsed: 0, deathSuccesses: 0, deathFailures: 0,
    });
  });
});

describe("hit points", () => {
  it("a new character without stored HP is at its maximum", () => {
    expect(hitPoints({ hpMax: 13 })).toEqual({ current: 13, max: 13, temp: 0 });
  });

  it("damage takes temporary HP first, healing stops at the maximum", () => {
    const values = { hpMax: 8, hp: { current: 6 }, hpTemp: 2 };
    expect(adjustHitPoints(values, -3)).toEqual({ hpTemp: 0, hp: { current: 5 } });
    expect(adjustHitPoints(values, -1)).toEqual({ hpTemp: 1 });
    expect(adjustHitPoints(values, 5)).toEqual({ hp: { current: 8 } });
  });

  it("a Hit Point Die heals at least 1 and counts as spent", () => {
    const values = { hpMax: 8, hp: { current: 3 }, hitDiceMax: 1, hitDiceSpent: 0 };
    expect(spendHitDie(values, -1)).toEqual({ hitDiceSpent: 1, hp: { current: 4 } });
    expect(spendHitDie({ ...values, hitDiceSpent: 1 }, 5)).toBeNull();
  });
});

describe("add as attack", () => {
  it("a finesse dagger uses DEX for a DEX character, with its dice, type and mastery", () => {
    const dexCharacter = { strMod: -1, dexMod: 2, profBonus: 2, weaponProficiencies: "Simple weapons", features: [{ ref: "classFeature:rogue/weapon-mastery-l1" }] };
    const row = weaponAttackRow(dexCharacter, byRef.get("baseItem:dagger")!, labels("Dagger"), "w1");
    expect(row).toMatchObject({
      id: "w1",
      name: "Dagger",
      ability: "dex",
      proficient: true,
      damageDice: "1d4",
      damageType: "Piercing",
      mastery: "nick",
      ref: "baseItem:dagger",
      origin: "srd",
    });
  });

  it("a STR character keeps STR on a finesse weapon; no mastery without Weapon Mastery", () => {
    const row = weaponAttackRow({ str: 16, dex: 10, level: 1 }, byRef.get("baseItem:dagger")!, labels("Dagger"), "w2");
    expect(row.ability).toBe("str");
    expect(row.mastery).toBe("");
  });

  it("a martial weapon without martial training is not proficient; a ranged weapon uses DEX", () => {
    const wizard = { strMod: 0, dexMod: 1, weaponProficiencies: "簡易武器" };
    expect(weaponAttackRow(wizard, byRef.get("baseItem:longsword")!, labels("Longsword"), "w3").proficient).toBe(false);
    expect(weaponAttackRow(wizard, byRef.get("baseItem:light-crossbow")!, labels("Light Crossbow"), "w4").ability).toBe("dex");
  });
});

describe("spells", () => {
  it("groups spells by level, cantrips first", () => {
    const groups = spellGroups([{ name: "Shield", level: 1 }, { name: "Fire Bolt", level: 0 }, { name: "Sleep", level: 1 }]);
    expect(groups.map((group) => [group.level, group.spells.map((spell) => spell.name)])).toEqual([
      [0, ["Fire Bolt"]],
      [1, ["Shield", "Sleep"]],
    ]);
  });

  it("scales cantrip dice at levels 5, 11 and 17", () => {
    expect(cantripDice("1d10", 1)).toBe("1d10");
    expect(cantripDice("1d10", 5)).toBe("2d10");
    expect(cantripDice("1d10", 17)).toBe("4d10");
  });
});

describe("hit dice of a new character", () => {
  it("a fresh level-1 character has its one die left (default data, computed max = level)", () => {
    expect(hitDice({ ...defaultData, level: 1, hitDiceMax: 1 })).toMatchObject({ max: 1, left: 1 });
    // Before the formula runtime fills hitDiceMax, the level stands in.
    expect(hitDice({ ...defaultData, level: 1 })).toMatchObject({ max: 1, left: 1 });
  });
});

// B-022 (D4): a death save's 1 or 20 is read from the die the d20 macro keeps.
describe("keptD20", () => {
  const roll = (adv: number, sequence: number[]) => {
    let index = 0;
    return executeExpressionWithMacros("{{#d20[@mod]}}", macros as unknown as RollMacroRegistry, { mod: 0 }, { random: () => sequence[index++ % sequence.length] }, { adv, xn: 1, xd: 4 })!.result!;
  };

  it("is the higher d20 with advantage and the lower with disadvantage, before any extra dice", () => {
    const advantage = roll(1, [0.1, 0.99, 0.5]);
    expect(advantage.rolls).toHaveLength(3);
    expect(keptD20(advantage.rolls, 1)).toBe(20);
    expect(keptD20(roll(-1, [0.1, 0.99, 0.5]).rolls, -1)).toBe(3);
  });

  it("is the only d20 of a normal roll, with Bless's d4 after it", () => {
    const normal = roll(0, [0.99, 0.1]);
    expect(normal.rolls).toHaveLength(2);
    expect(keptD20(normal.rolls, 0)).toBe(20);
  });
});
