import { describe, expect, it } from "vitest";
import weapons from "@skald/system-dnd5e/data/dnd5e-2024/game/weapons.json";
import spells from "@skald/system-dnd5e/data/dnd5e-2024/game/spells.json";
import {
  alwaysPreparedCount,
  ARCHERY_BONUS,
  canCastRitual,
  castOptions,
  castPatch,
  deathSave,
  exhaustionLevel,
  exhaustionPatch,
  exhaustionRollData,
  featSheetPatch,
  featureDice,
  longRestPatch,
  speedOf,
  upcastDice,
  healWithSpellMod,
  weaponAttack,
  weaponAttackRow,
  weaponsByRef,
} from "../play-model";
import { spellFactsOf } from "../row-text";

const byRef = weaponsByRef(weapons);

describe("Archery fighting style (A1-01, T4F-R-F003)", () => {
  // The sheet formula `weapons[].attack` adds `rangedAttackBonus` to a row marked `ranged`; the
  // play view reads the same two fields, so edit mode, print and the bot give the same to-hit.
  const fighter = { dexMod: 2, strMod: 1, profBonus: 2, rangedAttackBonus: 2, feats: [{ id: "feat:archery", ref: "feat:archery" }] };
  const shortbow = { ability: "dex", proficient: true, magic: 0, ref: "baseItem:shortbow", ranged: true };
  const dagger = { ability: "dex", proficient: true, magic: 0, ref: "baseItem:dagger", ranged: false };

  it("adds the ranged attack bonus to a Ranged weapon's attack roll, not to its damage", () => {
    expect(weaponAttack(fighter, shortbow)).toEqual({ attack: 6, damageMod: 2 });
  });

  it("leaves a Melee weapon (a thrown dagger too) and a character without the bonus alone", () => {
    expect(weaponAttack(fighter, dagger)).toEqual({ attack: 4, damageMod: 2 });
    expect(weaponAttack({ ...fighter, rangedAttackBonus: 0 }, shortbow)).toEqual({ attack: 4, damageMod: 2 });
  });

  it("marks a new attack row ranged from its game weapon's type", () => {
    const labels = { name: "x", damageType: (code: string) => code, property: (ref: string) => ref, mastery: (ref: string) => ref };
    expect(weaponAttackRow(fighter, byRef.get("baseItem:shortbow")!, labels, "w1")).toMatchObject({ ranged: true });
    expect(weaponAttackRow(fighter, byRef.get("baseItem:dagger")!, labels, "w2")).toMatchObject({ ranged: false });
  });

  it("gives the Archery feat's sheet bonus when it is added from the compendium", () => {
    expect(featSheetPatch("feat:archery")).toEqual({ rangedAttackBonus: ARCHERY_BONUS });
    expect(ARCHERY_BONUS).toBe(2);
    expect(featSheetPatch("feat:defense")).toBeUndefined();
  });
});

describe("Exhaustion (A2-08)", () => {
  it("reads a level; the bare condition counts as level 1", () => {
    expect(exhaustionLevel({ exhaustion: 3, conditions: ["exhaustion"] })).toBe(3);
    expect(exhaustionLevel({ conditions: ["exhaustion"] })).toBe(1);
    expect(exhaustionLevel({})).toBe(0);
  });

  it("keeps the condition on exactly while the level is above 0", () => {
    expect(exhaustionPatch({ conditions: ["prone"] }, 2)).toEqual({ exhaustion: 2, conditions: ["prone", "exhaustion"] });
    expect(exhaustionPatch({ conditions: ["exhaustion", "prone"] }, 0)).toEqual({ exhaustion: 0, conditions: ["prone"] });
    expect(exhaustionPatch({}, 9).exhaustion).toBe(6);
  });

  it("takes 5 feet of Speed and 2 from a d20 Test per level, not from damage", () => {
    expect(speedOf({ speed: 30, exhaustion: 2 })).toBe(20);
    // Armor's Strength requirement (SRD 5.2.1 p.92, plan-uat2 §3.3): −10 ft below it, as `currentSpeed` does.
    expect(speedOf({ speed: 30, str: 12, armorStrReq: 15 })).toBe(20);
    expect(speedOf({ speed: 30, str: 15, armorStrReq: 15 })).toBe(30);
    expect(speedOf({ speed: 30, str: 12, armorStrReq: 15, exhaustion: 1 })).toBe(15);
    // The sheet's d20 rolls subtract `@d20Penalty` (T4F-R-F007); the play view sets it from the level.
    expect(exhaustionRollData({ initiative: 2 }, 2)).toEqual({ initiative: 2, d20Penalty: 4 });
    expect(exhaustionRollData({ damageMod: 3 }, 0)).toEqual({ damageMod: 3, d20Penalty: 0 });
  });

  it("a long rest removes one level", () => {
    expect(longRestPatch({ exhaustion: 2, conditions: ["exhaustion"], hpMax: 8 })).toMatchObject({ exhaustion: 1, conditions: ["exhaustion"] });
    expect(longRestPatch({ exhaustion: 1, conditions: ["exhaustion"], hpMax: 8 })).toMatchObject({ exhaustion: 0, conditions: [] });
  });
});

describe("death saving throws (A1-04)", () => {
  it("10 or higher succeeds; three successes make the character Stable and reset the tallies", () => {
    expect(deathSave({ deathSuccesses: 0 }, 12, 12)).toEqual({ outcome: "success", patch: { deathSuccesses: 1 } });
    expect(deathSave({ deathSuccesses: 2, deathFailures: 1 }, 15, 15)).toEqual({ outcome: "stable", patch: { deathSuccesses: 0, deathFailures: 0 } });
  });

  it("a natural 1 counts as two failures; a natural 20 regains 1 Hit Point", () => {
    expect(deathSave({ deathFailures: 0 }, 1, 1)).toEqual({ outcome: "twoFailures", patch: { deathFailures: 2 } });
    expect(deathSave({ deathFailures: 2 }, 1, 1).outcome).toBe("dead");
    expect(deathSave({ hp: { current: 0 }, deathFailures: 2 }, 20, 20)).toEqual({
      outcome: "revived", patch: { hp: { current: 1 }, deathSuccesses: 0, deathFailures: 0 },
    });
  });

  it("an Exhaustion penalty can turn a 10 into a failure (the total decides)", () => {
    expect(deathSave({}, 10, 8)).toEqual({ outcome: "failure", patch: { deathFailures: 1 } });
  });
});

describe("casting (A2-09, A2-11, A2-12)", () => {
  const cleric = { slot1Total: 2, slot1Used: 0, slot2Total: 1, slot2Used: 0 };
  const bless = { name: "Bless", ref: "spell:bless", level: 1, concentration: true, prepared: true };

  it("offers every open slot of the spell's level or higher", () => {
    expect(castOptions(cleric, 1).map((option) => option.level)).toEqual([1, 2]);
    expect(castOptions({ ...cleric, slot1Used: 2 }, 1).map((option) => option.level)).toEqual([2]);
    expect(castOptions({ pactSlots: 1, pactSlotLevel: 1, pactUsed: 0 }, 1)).toEqual([{ field: "pactUsed", level: 1, left: 1, pact: true }]);
  });

  it("an upcast spends the chosen slot; a ritual spends none", () => {
    expect(castPatch(cleric, { level: 1, name: "Cure Wounds" }, castOptions(cleric, 1)[1]).patch).toEqual({ slot2Used: 1 });
    expect(castPatch(cleric, { level: 1, ritual: true }, "ritual").patch).toEqual({});
  });

  it("a ritual needs the Ritual tag and a prepared spell, or a Wizard's spellbook", () => {
    const detect = { level: 1, ritual: true, prepared: true };
    expect(canCastRitual({}, detect)).toBe(true);
    expect(canCastRitual({}, { ...detect, prepared: false })).toBe(false);
    expect(canCastRitual({ features: [{ ref: "classFeature:wizard/ritual-adept-l1" }] }, { ...detect, prepared: false })).toBe(true);
    expect(canCastRitual({}, { level: 1, ritual: false, prepared: true })).toBe(false);
  });

  it("a Concentration spell replaces the one held before", () => {
    expect(castPatch(cleric, bless, castOptions(cleric, 1)[0])).toEqual({ patch: { slot1Used: 1, concentration: "spell:bless" }, replaced: null });
    const held = { ...cleric, concentration: "spell:bless" };
    expect(castPatch(held, { ...bless, ref: "spell:bane" }, castOptions(held, 1)[0])).toEqual({
      patch: { slot1Used: 1, concentration: "spell:bane" }, replaced: "spell:bless",
    });
  });
});

describe("prepared count (A1-08)", () => {
  it("counts spells prepared from a feat, a species or Druidic apart from the class's", () => {
    expect(alwaysPreparedCount([
      { level: 1, prepared: true, source: "class" },
      { level: 1, prepared: true, source: "magic-initiate" },
      { level: 1, prepared: true, source: "other" },
      { level: 0, prepared: true, source: "magic-initiate" },
    ])).toBe(2);
  });
});

describe("dice in a feature's text (A3-05)", () => {
  it("rolls as many d4 as the Proficiency Bonus when the text says so, in either locale", () => {
    expect(featureDice("When the lantern flares, roll the number of d4s equal to your Proficiency Bonus.", 2)).toEqual(["2d4"]);
    expect(featureDice("燈籠閃爍時，擲出等同你的熟練加值顆d4。", 3)).toEqual(["3d4"]);
  });

  it("lists written dice once, and nothing for a text without dice", () => {
    expect(featureDice("You regain Hit Points equal to 1d10 plus your Fighter level. 1d10 again.", 2)).toEqual(["1d10"]);
    expect(featureDice("You can see in dim light within 60 feet.", 2)).toEqual([]);
  });
});

describe("upcasting (T4F-R-F004)", () => {
  it("adds the higher-level dice once per slot level above the spell's", () => {
    expect(upcastDice("3d6", "1d6", 1, 1)).toBe("3d6");
    expect(upcastDice("3d6", "1d6", 1, 2)).toBe("4d6");
    expect(upcastDice("2d8", "2d8", 1, 3)).toBe("6d8");
    expect(upcastDice("8d6", "1d6", 3, 5)).toBe("10d6");
    expect(upcastDice("1d6", "1d8", 1, 3)).toBe("1d6+2d8");
    expect(upcastDice("3d6", null, 1, 4)).toBe("3d6");
  });

  it("reads the damage and healing dice per slot level from game/spells.json", () => {
    const facts = (ref: string) => spellFactsOf({ spells }, ref);
    expect(facts("spell:burning-hands")).toMatchObject({ dice: "3d6", diceHigher: "1d6", heal: null });
    expect(facts("spell:cure-wounds")).toMatchObject({ dice: null, heal: "2d8", healHigher: "2d8" });
    expect(facts("spell:healing-word")).toMatchObject({ heal: "2d4", healHigher: "2d4" });
    expect(facts("spell:mass-cure-wounds")).toMatchObject({ heal: "5d8", healHigher: "1d8" });
    expect(facts("spell:guiding-bolt")).toMatchObject({ dice: "4d6", diceHigher: "1d6", attack: true });
    // No dice per level: Magic Missile adds darts, Scorching Ray rays.
    expect(facts("spell:magic-missile")?.diceHigher ?? null).toBeNull();
    expect(facts("spell:scorching-ray")?.diceHigher ?? null).toBeNull();
  });

  it("reads the step of a `{@scaledamage 4d4;2d4|…}` spell, whose first base is the roll (T4G-R-F003)", () => {
    const facts = (ref: string) => spellFactsOf({ spells }, ref);
    // SRD 5.2.1 Acid Arrow: both damages increase by 1d4 per slot level above 2.
    expect(facts("spell:acid-arrow")).toMatchObject({ dice: "4d4", diceHigher: "1d4" });
    expect(upcastDice("4d4", facts("spell:acid-arrow")?.diceHigher ?? null, 2, 3)).toBe("5d4");
    expect(facts("spell:conjure-elemental")).toMatchObject({ dice: "8d8", diceHigher: "1d8" });
  });

  it("marks the healing spells that add the spellcasting ability modifier (T4G-R-F002)", () => {
    const facts = (ref: string) => spellFactsOf({ spells }, ref);
    // SRD 5.2.1: Cure Wounds, Healing Word and their Mass versions heal dice plus the modifier;
    // Prayer of Healing heals 2d8 without it.
    for (const ref of ["spell:cure-wounds", "spell:healing-word", "spell:mass-cure-wounds", "spell:mass-healing-word"]) {
      expect(facts(ref)?.healMod, ref).toBe(true);
    }
    expect(facts("spell:prayer-of-healing")).toMatchObject({ heal: "2d8", healHigher: "1d8", healMod: false });
    expect(healWithSpellMod("4d8", true, 3)).toBe("4d8+3");
    expect(healWithSpellMod("2d4", true, -1)).toBe("2d4-1");
    expect(healWithSpellMod("2d8", true, 0)).toBe("2d8");
    expect(healWithSpellMod("2d8", false, 3)).toBe("2d8");
  });
});
