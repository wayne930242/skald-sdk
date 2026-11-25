/**
 * One form per kind the editor writes, with original text, and the built-in refs they name. Shared by
 * the domain tests and the parity test against the pack builder.
 */
import { loadEnglishCorpus } from "../../../reference/load-corpus";
import type { HomebrewForms } from "../../domain/forms";
import { refContext, type HomebrewRefContext, type HomebrewRefInfo } from "../../domain/wizard-items";

interface CorpusEntry {
  ref: string;
  name: string;
  meta: Record<string, unknown>;
}

let builtins: CorpusEntry[] | null = null;

/** Loads built-in feats, items and backgrounds through the corpus loader; call once in `beforeAll`. */
export async function loadBuiltinEntries(): Promise<CorpusEntry[]> {
  if (builtins) return builtins;
  const parts = await Promise.all(["feat", "baseItem", "item", "background"].map((part) => loadEnglishCorpus(part)));
  builtins = parts.flatMap((part) => Object.values((part ?? {}) as unknown as Record<string, CorpusEntry>));
  return builtins;
}

/** Built-in feats, items and backgrounds as the forms' context (every ref built in). */
export function builtinEntries(): CorpusEntry[] {
  if (!builtins) throw new Error("call loadBuiltinEntries() in beforeAll first");
  return builtins;
}

export function builtinContext(extra: HomebrewRefInfo[] = []): HomebrewRefContext {
  return refContext([...builtinEntries().map(({ ref, name, meta }) => ({ ref, name, meta, builtin: true })), ...extra]);
}

export const featFixture = (): HomebrewForms["feat"] => ({
  id: "lamplighter",
  nameEn: "Lamplighter",
  nameZh: "點燈人",
  textEn: "You know the old streets by their lamps.\n\n## Quick Flame\n\nYou can light a lamp within reach as a Bonus Action.\n\n- No tinderbox needed\n- Works in rain",
  textZh: "你靠路燈認得老街。\n\n## 快火\n\n你能以附贈動作點亮觸及範圍內的一盞燈。",
  category: "origin",
  repeatable: false,
});

export const spellFixture = (): HomebrewForms["spell"] => ({
  id: "ember-lance",
  nameEn: "Ember Lance",
  nameZh: "餘燼長槍",
  textEn: "Tap the brass nib against your palm. Aim the red spark with a ranged spell attack; a hit brands the target with a tiny compass rose for {@damage 2d6} Fire damage.",
  textZh: "把黃銅筆尖往掌心一敲，以遠程法術攻擊瞄準紅色火星的落點。命中時火星烙出一朵小小的羅盤玫瑰，造成 {@damage 2d6} 火焰傷害。",
  level: 1,
  school: "V",
  classes: ["sorcerer", "wizard"],
  verbal: true,
  somatic: true,
  material: true,
  materialEn: "a pinch of ash",
  materialZh: "一撮灰燼",
  concentration: false,
  ritual: false,
  castingNumber: 1,
  castingUnit: "action",
  rangeShape: "point",
  rangeUnit: "feet",
  rangeAmount: 90,
  durationType: "instant",
  durationAmount: null,
  durationUnit: "minute",
  higherEn: "## Extra ink\n\nEach slot level above the first adds another point to the compass rose.",
  higherZh: "## 添墨\n\n從二環起，每多一環，羅盤玫瑰就多一個尖角。",
  damageDice: "2d6",
  damageType: "fire",
  damageDiceHigher: "",
  healDice: "",
  healDiceHigher: "",
  healAddsSpellMod: false,
  spellAttack: true,
  saveAbility: "",
});

export const itemFixture = (): HomebrewForms["item"] => ({
  id: "lantern-of-patience",
  nameEn: "Lantern of Patience",
  nameZh: "耐心提燈",
  textEn: "While this lantern burns, a short rest takes only 10 minutes for you.",
  textZh: "這盞提燈燃燒時，你的短休只需十分鐘。",
  category: "Wondrous Item",
  rarity: "uncommon",
  attunement: true,
  attunementBy: "",
  charges: 3,
  weight: 2,
});

export const speciesFixture = (): HomebrewForms["species"] => ({
  id: "mossfolk",
  nameEn: "Mossfolk",
  nameZh: "苔民",
  size: "SM",
  speed: 30,
  darkvision: 60,
  resist: ["poison"],
  skillChoice: { count: 1, from: ["nature", "survival"] },
  hpPerLevel: 0,
  originFeatChoice: false,
  traits: [
    { nameEn: "Soft Step", nameZh: "輕步", textEn: "You leave no tracks on grass or moss.", textZh: "你走過草地或苔蘚不留足跡。" },
    { nameEn: "Rooted", nameZh: "扎根", textEn: "You have Advantage on saving throws against being pushed.", textZh: "" },
  ],
});

export const backgroundFixture = (): HomebrewForms["background"] => ({
  id: "lamp-keeper",
  nameEn: "Lamp Keeper",
  nameZh: "守燈者",
  textEn: "You tended the city's lamps from dusk to dawn.",
  textZh: "你從黃昏到黎明照看城裡的燈。",
  abilityOptions: ["dex", "con", "wis"],
  originFeat: "feat:alert",
  originFeatSpellList: "",
  skills: ["perception", "stealth"],
  toolGrants: ["baseItem:calligraphers-supplies"],
  toolChoice: null,
  equipmentA: {
    gp: 12,
    items: [
      { ref: "baseItem:leather-armor", displayName: "", qty: 1 },
      { ref: "item:torch", displayName: "", qty: 5 },
      { ref: "", displayName: "Lamp Oil", qty: 2 },
    ],
  },
  equipmentBGp: 50,
});
