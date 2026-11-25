/**
 * The wizard items a homebrew entry owns, the same items the pack builder writes for a pack entry
 * (`scripts/dnd5e-2024/lib/game.ts` `buildGame(…, "pack", builtin)` with `wizard-fields.ts`; the
 * scripts are not importable from plugin code, so this is a port of the pack branch for the kinds
 * the editor writes, pinned by `tests/unit/systems/dnd5e-2024/homebrew-parity.test.ts`).
 *
 * Labels: the item's own label is `{ en, "zh-TW" }`; a row inside `w` that names a built-in ref uses
 * the built-in token `{{i18n:ref.<kind>.<id>}}` with `origin: "srd"`, a row naming a homebrew ref its
 * English name with `origin: "pack"`. One deliberate difference: a species trait whose name has no
 * ASCII letters or digits (a name written only in Chinese) gets the id fragment `t<N>`, so two
 * such traits do not share a row id.
 */
import type { OpenPackEntry } from "../../content-pack/open/format";
import type { PackWizardItem, PackZhEntry } from "../../content-pack/domain/types";
import type { WizardList } from "./types";

type Raw = Record<string, unknown>;
type Row = Record<string, string | number | boolean>;

const object = (value: unknown): Raw => (value && typeof value === "object" && !Array.isArray(value) ? (value as Raw) : {});
const array = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const objects = (value: unknown): Raw[] => array(value).map(object);
const string = (value: unknown): string => (typeof value === "string" ? value : "");
const strings = (value: unknown): string[] => array(value).filter((child): child is string => typeof child === "string");
const number = (value: unknown): number | undefined => (typeof value === "number" ? value : undefined);

/** What a homebrew entry may name besides itself: built-in entries and the user's other homebrew. */
export interface HomebrewRefInfo {
  ref: string;
  /** English name. */
  name: string;
  meta: Record<string, unknown>;
  /** A built-in (SRD) entry: rows naming it carry its message token and `origin: "srd"`. */
  builtin: boolean;
}

export interface HomebrewRefContext {
  lookup(ref: string): HomebrewRefInfo | undefined;
}

/** A context that knows no ref: rows name refs by token, with `origin: "pack"`. */
export const NO_REFS: HomebrewRefContext = { lookup: () => undefined };

export function refContext(entries: Iterable<HomebrewRefInfo>): HomebrewRefContext {
  const byRef = new Map<string, HomebrewRefInfo>();
  for (const entry of entries) byRef.set(entry.ref, entry);
  return { lookup: (ref) => byRef.get(ref) };
}

/** Sheet skill field ids, keyed by the game data skill id (`wizard-fields.ts`). */
export const SKILL_FIELDS: Readonly<Record<string, string>> = {
  acrobatics: "acrobatics", "animal-handling": "animalHandling", arcana: "arcana", athletics: "athletics",
  deception: "deception", history: "history", insight: "insight", intimidation: "intimidation",
  investigation: "investigation", medicine: "medicine", nature: "nature", perception: "perception",
  performance: "performance", persuasion: "persuasion", religion: "religion", "sleight-of-hand": "sleightOfHand",
  stealth: "stealth", survival: "survival",
};
const ARMOR_TYPES = ["light", "medium", "heavy"];
const ABILITY_IDS = ["str", "dex", "con", "int", "wis", "cha"];

/** The wizard's id slug (`wizard-fields.ts` `slug`): lowercase, `'` dropped, other non-alphanumerics → `-`. */
export const wizardSlug = (text: string): string =>
  text.toLowerCase().replace(/'/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const token = (path: string) => `{{i18n:${path}}}`;
const idOf = (ref: string) => ref.slice(ref.indexOf(":") + 1);
const singularDistanceUnit = (unit: string) => (unit === "feet" ? "foot" : unit === "miles" ? "mile" : unit);

type Entry = OpenPackEntry & { ref: string; meta: Record<string, unknown> };

class Fields {
  constructor(
    private readonly entry: Entry,
    private readonly context: HomebrewRefContext,
  ) {}

  private find(ref: string): HomebrewRefInfo | undefined {
    if (ref === this.entry.ref) return { ref, name: this.entry.name, meta: this.entry.meta, builtin: false };
    return this.context.lookup(ref);
  }

  private own(ref: string): HomebrewRefInfo | undefined {
    const found = this.find(ref);
    return found && !found.builtin ? found : undefined;
  }

  label(ref: string): string {
    const own = this.own(ref);
    if (own) return own.name;
    return token(`ref.${ref.slice(0, ref.indexOf(":"))}.${idOf(ref)}`);
  }

  row(ref: string, extra: Row = {}): Row {
    return { id: ref, ref, label: this.label(ref), origin: this.own(ref) || !this.find(ref) ? "pack" : "srd", ...extra };
  }

  private skills(from: unknown): Record<string, boolean> {
    const all = from === "any";
    const list = strings(from);
    return Object.fromEntries(Object.entries(SKILL_FIELDS).map(([id, field]) => [field, all || list.includes(id)]));
  }

  private grants(featRef: string) {
    const grants = object(object(this.find(featRef)?.meta).grants);
    const spells = object(grants.spellChoice);
    return {
      skillCount: number(grants.skillChoiceCount) ?? 0,
      cantrips: number(spells.cantrips) ?? 0,
      spells: number(spells.level1) ?? 0,
      spellList: string(spells.list),
      hp: number(grants.hpPerLevel) ?? (featRef === "feat:tough" ? 2 : 0),
      init: grants.initiativeProf === true || featRef === "feat:alert",
    };
  }

  private toolCategory(choice: Raw): string {
    const categories = choice.categories ? strings(choice.categories) : [string(choice.category)];
    return categories.filter(Boolean).join("-");
  }

  feat() {
    const g = this.grants(this.entry.ref);
    return {
      label: this.label(this.entry.ref), skillCount: g.skillCount, cantrips: g.cantrips, spells: g.spells, spellList: g.spellList,
      hp: g.hp, init: g.init, idB: `b:${this.entry.ref}`,
    };
  }

  spell() {
    const meta = this.entry.meta;
    const time = object(array(meta.time)[0]);
    const range = object(meta.range);
    const distance = object(range.distance);
    const unit = string(distance.type) || string(range.type);
    return {
      label: this.label(this.entry.ref),
      castingTime: [time.number, time.unit].filter(Boolean).join(" "),
      range: [distance.amount, Number(distance.amount) === 1 ? singularDistanceUnit(unit) : unit].filter(Boolean).join(" "),
      concentration: meta.concentration === true,
      ritual: meta.ritual === true,
      material: Boolean(object(meta.components).m),
      self: [{ id: this.entry.ref }],
    };
  }

  species() {
    const meta = this.entry.meta;
    const sizes = strings(meta.size);
    const skill = object(meta.skillChoice);
    const traits = objects(meta.traits).map((trait, index) => {
      const name = string(trait.name);
      return { id: `${this.entry.ref}#${wizardSlug(name) || `t${index + 1}`}`, ref: this.entry.ref, label: name, origin: "pack" };
    });
    return {
      label: this.label(this.entry.ref),
      speed: number(meta.speed) ?? number(object(meta.speed).walk) ?? 30,
      darkvision: number(meta.darkvision) ?? 0,
      size: sizes.includes("M") || sizes.length === 0 ? "medium" : "small",
      sizeChoice: sizes.length > 1,
      hpPerLevel: number(meta.hpPerLevel) ?? 0,
      skillCount: number(skill.count) ?? 0,
      can: this.skills(skill.from),
      featChoice: meta.originFeatChoice === true,
      hasLineage: array(meta.lineages).length > 0,
      traits,
    };
  }

  /** `wizard-fields.ts` `class()` for a pack entry, plus `spellList` when the class borrows a list. */
  class() {
    const m = this.entry.meta;
    const casting = object(m.spellcasting);
    const pact = object(casting.pact);
    const prepared = number(casting.preparedL1) ?? 0;
    const choice = object(m.toolChoice);
    const armor = strings(m.armor);
    const skill = object(m.skillChoice);
    const english = (value: string) => value.replace(/\{@\w+ ([^|}]+)[^}]*\}/g, "$1");
    return {
      label: this.label(this.entry.ref),
      hitDie: number(m.hitDie) ?? 8,
      save: Object.fromEntries(ABILITY_IDS.map((ab) => [ab, strings(m.saves).includes(ab)])),
      armor: { light: armor.includes("light"), medium: armor.includes("medium"), heavy: armor.includes("heavy"), shields: armor.includes("shield") },
      weapons: strings(m.weapons).map(english).join("; "),
      spellAbility: string(casting.ability) || "none",
      unarmoredDefense: string(m.unarmoredDefense) || "none",
      slot1: number(array(casting.slotsL1)[0]) ?? 0,
      pactSlots: number(pact.slots) ?? 0,
      pactLevel: number(pact.level) ?? 0,
      can: this.skills(skill.from),
      skillCount: number(skill.count) ?? 0,
      cantrips: number(casting.cantripsL1) ?? 0,
      prepared,
      spellbookExtra: Math.max(0, (number(casting.spellbookL1) ?? 0) - prepared),
      mastery: number(m.masteryCountL1) ?? 0,
      invocations: number(m.invocationsL1) ?? 0,
      expertise: number(m.expertiseL1) ?? 0,
      fightingStyle: m.fightingStyleL1 === true,
      toolCount: number(choice.count) ?? 0,
      toolCategory: this.toolCategory(choice),
      hasOrder: array(m.level1Choices).length > 0,
      features: strings(m.level1Features).map((ref) => this.row(ref)),
      tools: strings(m.toolGrants).map((ref) => this.row(ref)),
      ...(string(casting.list) ? { spellList: string(casting.list) } : {}),
    };
  }

  background() {
    const meta = this.entry.meta;
    const [ab1 = "", ab2 = "", ab3 = ""] = strings(meta.abilityOptions);
    const feat = object(meta.originFeat);
    const featRef = string(feat.ref);
    const grants = this.grants(featRef);
    const choice = object(meta.toolChoice);
    const category = string(object(this.find(featRef)?.meta).category) || "origin";
    return {
      label: this.label(this.entry.ref), ab1, ab2, ab3,
      skill: this.skills(meta.skills),
      feat: idOf(featRef), featList: string(feat.spellList) || grants.spellList,
      featSkillCount: grants.skillCount, featCantrips: grants.cantrips, featSpells: grants.spells, featHp: grants.hp, featInit: grants.init,
      toolCount: number(choice.count) ?? 0, toolCategory: this.toolCategory(choice),
      tools: strings(meta.toolGrants).map((ref) => this.row(ref)),
      feats: featRef ? [this.row(featRef, { category })] : [],
    };
  }

  equipment(id: string, pkg: Raw, packLabel: string) {
    const items = objects(pkg.items).map((item, index): Row => {
      const ref = string(item.ref);
      const display = string(item.displayName);
      const categories = strings(item.categories);
      const label = display ? display
        : ref ? this.label(ref)
          // A choice of item: a built-in message in every origin, so the row reads in the user's locale.
          : token(`wizard.equipment.any-${categories.join("-")}`);
      const category = string(object(this.find(ref)?.meta).category);
      return {
        id: `${id}:${index}`, ref, label, qty: number(item.qty) ?? 1,
        origin: ref && !this.own(ref) && this.find(ref) ? "srd" : "pack",
        equipped: ARMOR_TYPES.includes(category) || category === "shield",
      };
    });
    const armor = objects(pkg.items).map((item) => this.find(string(item.ref))?.meta).find((meta) => ARMOR_TYPES.includes(string(meta?.category)));
    return {
      label: packLabel, gp: number(pkg.gp) ?? 0, items,
      armorType: armor ? string(armor.category) : "none", armorBase: armor ? number(armor.ac) ?? 0 : 0,
      armorStrReq: armor ? number(armor.strength) ?? 0 : 0, armorStealth: armor?.stealthDisadvantage === true,
      shield: objects(pkg.items).some((item) => string(object(this.find(string(item.ref))?.meta).category) === "shield"),
    };
  }
}

/** `<number>-<unit>` and `<type>-<amount>-<unit>`, the codes the sheet keys casting time and range by. */
export function spellCodes(meta: Record<string, unknown>): { time: string; range: string } {
  const time = object(array(meta.time)[0]);
  const range = object(meta.range);
  const distance = object(range.distance);
  return {
    time: [time.number, time.unit].filter(Boolean).join("-"),
    range: [range.type, distance.amount, distance.type].filter(Boolean).join("-"),
  };
}

/** The roll facts of a spell's game data item, read from the entry's `meta` (the form writes them there). */
function spellRollFacts(meta: Record<string, unknown>): Raw {
  const dice = (key: string) => (typeof meta[key] === "string" && /^\d+d\d+$/.test(meta[key] as string) ? { [key]: meta[key] } : {});
  return {
    ...dice("damageDice"),
    ...dice("healDice"),
    ...(meta.healAddsSpellMod === true && typeof meta.healDice === "string" ? { healAddsSpellMod: true } : {}),
    ...dice("damageDiceHigher"),
    ...dice("healDiceHigher"),
    ...(meta.spellAttack === true ? { spellAttack: true } : {}),
  };
}

/** The equipment packages an entry owns (`buildGame`'s `class/<id>/a`, `background/<id>/a`, …). */
function packagesOf(full: Entry, zhTW: PackZhEntry | undefined, fields: Fields): PackWizardItem[] {
  return objects(full.meta.startingEquipment).map((pkg): PackWizardItem => {
    const option = string(pkg.option);
    const id = `${full.kind}/${full.id}/${option.toLowerCase()}`;
    const label = `${full.name} (${option})`;
    return {
      id, origin: "pack", label: { en: label, "zh-TW": zhTW ? `${zhTW.name}（${option}）` : label },
      owner: full.id, ownerKind: full.kind, ...pkg, w: fields.equipment(id, pkg, label),
    };
  });
}

/**
 * The wizard items of one entry, by list: the entry's pick item and, for a class or background, its
 * equipment packages. Kinds without wizard items (magic items and the rest) give `{}`. A homebrew
 * class has no level-1 options, so it owns no `class-options`.
 */
export function wizardItemsOf(
  entry: OpenPackEntry,
  zhTW: PackZhEntry | undefined,
  context: HomebrewRefContext = NO_REFS,
): Partial<Record<WizardList, PackWizardItem[]>> {
  const full: Entry = { ...entry, ref: entry.ref ?? `${entry.kind}:${entry.id}`, meta: entry.meta ?? {} };
  const fields = new Fields(full, context);
  const zhName = zhTW?.name ?? full.name;
  const pick = { id: full.id, ref: full.ref, origin: "pack" as const, label: { en: full.name, "zh-TW": zhName } };
  const meta = full.meta;
  switch (full.kind) {
    case "feat":
      return { feats: [{ ...pick, ...meta, w: fields.feat() }] };
    case "spell": {
      const codes = spellCodes(meta);
      return {
        spells: [{
          ...pick, level: meta.level, school: meta.school, classes: meta.classes, concentration: meta.concentration, ritual: meta.ritual,
          material: object(meta.components).m, castingTimeCode: codes.time, rangeCode: codes.range, ...spellRollFacts(meta),
          castingTime: codes.time, range: codes.range, w: fields.spell(),
        }],
      };
    }
    case "species": {
      const { traits, ...flags } = meta;
      return { species: [{ ...pick, ...flags, traits: objects(traits).map((trait) => string(trait.name)), w: fields.species() }] };
    }
    case "class": {
      // The class builder's own meta (`chassis`, `multiclass`, `spellcasting.list`) is not a game item field
      // (`game-items.schema.json` `classes` allows no other keys); the borrowed list reaches the wizard as `w.spellList`.
      const { startingEquipment: _equipment, chassis: _chassis, multiclass: _multiclass, spellcasting, ...flags } = meta;
      const { list: _list, ...casting } = object(spellcasting);
      const packages = packagesOf(full, zhTW, fields);
      return {
        classes: [{ ...pick, ...flags, ...(spellcasting === undefined ? {} : { spellcasting: casting }), w: fields.class() }],
        ...(packages.length ? { "equipment-packages": packages } : {}),
      };
    }
    case "background": {
      const { startingEquipment: _equipment, ...flags } = meta;
      const packages = packagesOf(full, zhTW, fields);
      return {
        backgrounds: [{ ...pick, ...flags, w: fields.background() }],
        ...(packages.length ? { "equipment-packages": packages } : {}),
      };
    }
    default:
      return {};
  }
}
