/** The class builder's context from the corpus (built-in chassis of the 12 classes) and sample labels. */
import { loadEnglishCorpus, type CorpusEntry } from "../../../reference/load-corpus";
import { builtinChassis, type BuiltinClassChassis, type ClassContext, type ClassLabels } from "../../domain/class";
import { NO_REFS, type HomebrewRefContext } from "../../domain/wizard-items";
import type { HomebrewItemInput } from "../../domain/types";

export const CLASS_IDS = ["barbarian", "bard", "cleric", "druid", "fighter", "monk", "paladin", "ranger", "rogue", "sorcerer", "warlock", "wizard"];

const en: ClassLabels = {
  caption: "{class} Features", level: "Level", proficiency: "Proficiency Bonus", features: "Class Features", separator: ", ",
  cantrips: "Cantrips", prepared: "Prepared Spells", slotGroup: "Spell Slots per Spell Level", slots: "Spell Slots", slotLevel: "Slot Level",
  weaponMastery: "Weapon Mastery", spellcastingName: "Spellcasting", spellcastingText: "You cast spells with {ability} from the {list} spell list.",
  pactMagicName: "Pact Magic", pactMagicText: "You cast spells with {ability} through pact magic.",
  masteryText: "You gain mastery of the number of weapons in the Weapon Mastery column.", masteryTwoText: "You gain mastery of two kinds of weapons.",
  subclassName: "{class} Subclass", subclassText: "You gain a {class} subclass of your choice.",
  subclassFeatureName: "Subclass Feature", subclassFeatureText: "You gain a feature from your {class} subclass.",
  asiName: "Ability Score Improvement", asiText: "Fixture: pick an ability increase.",
  extraAttackName: "Extra Attack", extraAttackText: "You can attack twice when you take the Attack action.",
  epicBoonName: "Epic Boon", epicBoonText: "Fixture: pick a level 19 boon.",
};

const zh: ClassLabels = {
  caption: "{class}特性", level: "等級", proficiency: "熟練加值", features: "職業特性", separator: "、",
  cantrips: "戲法", prepared: "已準備法術", slotGroup: "各環階法術位", slots: "法術位", slotLevel: "法術位環階",
  weaponMastery: "武器精通", spellcastingName: "施法", spellcastingText: "你以{ability}施展{list}法術列表的法術。",
  pactMagicName: "契約魔法", pactMagicText: "你以{ability}透過契約魔法施法。",
  masteryText: "你精通武器精通欄所列數量的武器。", masteryTwoText: "你精通兩種武器。",
  subclassName: "{class}子職", subclassText: "你選擇一個{class}子職。",
  subclassFeatureName: "子職特性", subclassFeatureText: "你獲得{class}子職的一項特性。",
  asiName: "屬性值提升", asiText: "測試用：選一項屬性提升。",
  extraAttackName: "額外攻擊", extraAttackText: "你執行攻擊動作時可以攻擊兩次。",
  epicBoonName: "史詩恩賜", epicBoonText: "測試用：選一項十九級恩賜。",
};

let loaded: { classes: Record<string, CorpusEntry>; builtin: Record<string, BuiltinClassChassis>; featureIds: Record<string, string[]> } | null = null;

/** Loads the class corpus and each class's classFeature ids; call in `beforeAll`. */
export async function loadClassCorpus() {
  if (loaded) return loaded;
  const classes = (await loadEnglishCorpus("class"))!;
  const featureIds: Record<string, string[]> = {};
  const builtin: Record<string, BuiltinClassChassis> = {};
  for (const id of CLASS_IDS) {
    featureIds[id] = Object.keys((await loadEnglishCorpus(`classFeature-${id}`))!);
    builtin[id] = builtinChassis(classes[`class:${id}`], featureIds[id]);
  }
  loaded = { classes, builtin, featureIds };
  return loaded;
}

export function classContext(refs: HomebrewRefContext = NO_REFS): ClassContext {
  if (!loaded) throw new Error("call loadClassCorpus() in beforeAll first");
  const names = Object.fromEntries(CLASS_IDS.map((id) => [id, { en: id[0].toUpperCase() + id.slice(1), zh: id }]));
  return {
    labels: { en, zh },
    builtin: loaded.builtin,
    refs,
    abilityNames: { int: { en: "Intelligence", zh: "智力" }, wis: { en: "Wisdom", zh: "感知" }, cha: { en: "Charisma", zh: "魅力" } },
    classNames: names,
  };
}

export const classRecords = (rows: HomebrewItemInput[]) =>
  rows.map((r, i) => ({ ...r, id: `row-${i}`, packUuid: "test", revision: 1, bytes: JSON.stringify(r.payload).length, updatedAt: "" }));
