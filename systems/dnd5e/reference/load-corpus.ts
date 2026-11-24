import type { DndKind } from "./tags";

/**
 * Tier C (design §2): the reference corpus, loaded only when a reference view or the compendium
 * opens. One literal `import()` per file, so the bundler emits one lazy chunk per file and no
 * context module over the directory. Nothing else in the app may import `corpus/`.
 *
 * Also here, for the same reason: the part manifest (`corpus/parts.json`, plan T2b §2.3), the lazy
 * creature and magic item indexes, and the lazy reference catalog (`messages/reference/*.json`:
 * table and chapter names), which together name every built-in entry tier A does not.
 */

/** A corpus entry as T2 writes it (`corpus/en/<part>.json`, keyed by ref). */
export interface CorpusEntry {
  kind: DndKind;
  id: string;
  ref: string;
  name: string;
  entries: unknown[];
  meta?: Record<string, unknown>;
  page?: number;
  /** The book (`XPHB`, `XMM`, `XDMG`). */
  source?: string;
  /** Background blocks (pack entries, pack v2). */
  lore?: unknown[];
}

/** The zh-TW layer T3 writes per ref: sparse arrays, `null` where a top-level block is untranslated. */
export interface CorpusOverlay {
  name?: string;
  entries?: Array<unknown | null>;
  entriesHigherLevel?: Array<unknown | null>;
  /** A spell's material component text (`meta.components.mText`) */
  material?: string;
  /** Translated text fields of `meta` (creatures: `hp.special`, `gear`, `languages`), same shape. */
  meta?: Record<string, unknown>;
  /** Sparse background blocks (pack entries). */
  lore?: Array<unknown | null>;
}

export type CorpusPart = Record<string, CorpusEntry>;

const pick = (module: { default: unknown }) => module.default as CorpusPart;

/**
 * `corpus/parts.json`, written by the pipeline: the part of a creature or magic item by the first
 * character of its id, and the part of each chapter id.
 */
export interface CorpusParts {
  creature: Record<string, string>;
  itemMagic: Record<string, string>;
  chapter: Record<string, string>;
}

let partsPromise: Promise<CorpusParts> | null = null;

/** The part manifest, loaded once (a lazy chunk of its own, like the corpus files). */
export function loadCorpusParts(): Promise<CorpusParts> {
  partsPromise ??= import("@skald/system-dnd5e/data/dnd5e-2024/corpus/parts.json").then((module) => (module.default ?? module) as CorpusParts);
  return partsPromise;
}

/**
 * The corpus file (`<kind>` or `<kind>-<part>`) that holds a ref, given what the id says. Creatures
 * and chapters need the part manifest; without it they have no part.
 */
export function corpusPartOf(kind: DndKind, id: string, spellLevel?: number, parts?: CorpusParts): string | null {
  switch (kind) {
    case "spell":
      return spellLevel === undefined ? null : `spell-${spellLevel}`;
    case "classFeature":
    case "subclassFeature": {
      const classId = id.split("/")[0];
      return classId ? `${kind}-${classId}` : null;
    }
    case "creature":
      return parts?.creature[id.charAt(0)] ?? null;
    case "chapter":
      return parts && Object.hasOwn(parts.chapter, id) ? parts.chapter[id] : null;
    default:
      return kind;
  }
}

/**
 * Every corpus file that may hold a ref, in lookup order: one file for most kinds; for `item`, the
 * mundane items, then the magic item part of the id (magic items share the kind, plan T2b §2.8).
 */
export function corpusPartCandidates(kind: DndKind, id: string, parts: CorpusParts, spellLevel?: number): string[] {
  const part = corpusPartOf(kind, id, spellLevel, parts);
  if (kind !== "item") return part ? [part] : [];
  const magic = parts.itemMagic[id.charAt(0)];
  return magic ? ["item", magic] : ["item"];
}

export function loadEnglishCorpus(part: string): Promise<CorpusPart | null> {
  switch (part) {
    case "action":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/en/action.json").then(pick);
    case "background":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/en/background.json").then(pick);
    case "baseItem":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/en/baseItem.json").then(pick);
    case "chapter-character-creation":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/en/chapter-character-creation.json").then(pick);
    case "chapter-character-origins":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/en/chapter-character-origins.json").then(pick);
    case "chapter-classes":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/en/chapter-classes.json").then(pick);
    case "chapter-equipment":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/en/chapter-equipment.json").then(pick);
    case "chapter-feats":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/en/chapter-feats.json").then(pick);
    case "chapter-gameplay-toolbox":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/en/chapter-gameplay-toolbox.json").then(pick);
    case "chapter-magic-items":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/en/chapter-magic-items.json").then(pick);
    case "chapter-monsters":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/en/chapter-monsters.json").then(pick);
    case "chapter-playing-the-game":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/en/chapter-playing-the-game.json").then(pick);
    case "chapter-rules-glossary":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/en/chapter-rules-glossary.json").then(pick);
    case "chapter-spells":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/en/chapter-spells.json").then(pick);
    case "class":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/en/class.json").then(pick);
    case "classFeature-barbarian":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/en/classFeature-barbarian.json").then(pick);
    case "classFeature-bard":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/en/classFeature-bard.json").then(pick);
    case "classFeature-cleric":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/en/classFeature-cleric.json").then(pick);
    case "classFeature-druid":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/en/classFeature-druid.json").then(pick);
    case "classFeature-fighter":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/en/classFeature-fighter.json").then(pick);
    case "classFeature-monk":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/en/classFeature-monk.json").then(pick);
    case "classFeature-paladin":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/en/classFeature-paladin.json").then(pick);
    case "classFeature-ranger":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/en/classFeature-ranger.json").then(pick);
    case "classFeature-rogue":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/en/classFeature-rogue.json").then(pick);
    case "classFeature-sorcerer":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/en/classFeature-sorcerer.json").then(pick);
    case "classFeature-warlock":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/en/classFeature-warlock.json").then(pick);
    case "classFeature-wizard":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/en/classFeature-wizard.json").then(pick);
    case "condition":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/en/condition.json").then(pick);
    case "creature-1":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/en/creature-1.json").then(pick);
    case "creature-2":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/en/creature-2.json").then(pick);
    case "creature-3":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/en/creature-3.json").then(pick);
    case "creature-4":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/en/creature-4.json").then(pick);
    case "creature-5":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/en/creature-5.json").then(pick);
    case "creature-6":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/en/creature-6.json").then(pick);
    case "feat":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/en/feat.json").then(pick);
    case "item":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/en/item.json").then(pick);
    case "item-magic-1":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/en/item-magic-1.json").then(pick);
    case "item-magic-2":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/en/item-magic-2.json").then(pick);
    case "item-magic-3":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/en/item-magic-3.json").then(pick);
    case "itemGroup":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/en/itemGroup.json").then(pick);
    case "itemMastery":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/en/itemMastery.json").then(pick);
    case "itemProperty":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/en/itemProperty.json").then(pick);
    case "language":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/en/language.json").then(pick);
    case "lineage":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/en/lineage.json").then(pick);
    case "optionalFeature":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/en/optionalFeature.json").then(pick);
    case "rule":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/en/rule.json").then(pick);
    case "skill":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/en/skill.json").then(pick);
    case "species":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/en/species.json").then(pick);
    case "spell-0":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/en/spell-0.json").then(pick);
    case "spell-1":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/en/spell-1.json").then(pick);
    case "spell-2":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/en/spell-2.json").then(pick);
    case "spell-3":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/en/spell-3.json").then(pick);
    case "spell-4":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/en/spell-4.json").then(pick);
    case "spell-5":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/en/spell-5.json").then(pick);
    case "spell-6":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/en/spell-6.json").then(pick);
    case "spell-7":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/en/spell-7.json").then(pick);
    case "spell-8":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/en/spell-8.json").then(pick);
    case "spell-9":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/en/spell-9.json").then(pick);
    case "status":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/en/status.json").then(pick);
    case "subclass":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/en/subclass.json").then(pick);
    case "table":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/en/table.json").then(pick);
    case "subclassFeature-barbarian":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/en/subclassFeature-barbarian.json").then(pick);
    case "subclassFeature-bard":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/en/subclassFeature-bard.json").then(pick);
    case "subclassFeature-cleric":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/en/subclassFeature-cleric.json").then(pick);
    case "subclassFeature-druid":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/en/subclassFeature-druid.json").then(pick);
    case "subclassFeature-fighter":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/en/subclassFeature-fighter.json").then(pick);
    case "subclassFeature-monk":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/en/subclassFeature-monk.json").then(pick);
    case "subclassFeature-paladin":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/en/subclassFeature-paladin.json").then(pick);
    case "subclassFeature-ranger":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/en/subclassFeature-ranger.json").then(pick);
    case "subclassFeature-rogue":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/en/subclassFeature-rogue.json").then(pick);
    case "subclassFeature-sorcerer":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/en/subclassFeature-sorcerer.json").then(pick);
    case "subclassFeature-warlock":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/en/subclassFeature-warlock.json").then(pick);
    case "subclassFeature-wizard":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/en/subclassFeature-wizard.json").then(pick);
    default:
      return Promise.resolve(null);
  }
}

/** A lazy name index row (design T2b §2.6: the monster browser lists and filters these before a part loads). */
export type CorpusIndex = Record<string, Record<string, unknown>>;

/** The English lazy index of a kind (`corpus/index/en/<kind>.json`). */
export function loadEnglishIndex(kind: string): Promise<CorpusIndex | null> {
  switch (kind) {
    case "creature":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/index/en/creature.json").then((module) => module.default as CorpusIndex);
    case "item-magic":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/index/en/item-magic.json").then((module) => module.default as CorpusIndex);
    default:
      return Promise.resolve(null);
  }
}

/** The ref kind of the entries a lazy index lists. */
const indexKinds: Record<string, DndKind> = { creature: "creature", "item-magic": "item" };

/** Names by kind and id, the shape of the `ref` section of a names catalog. */
export type RefNames = Partial<Record<DndKind, Record<string, string>>>;

/** The lazy reference catalog: `ref` (table and chapter names) and `referenceUi` (the reference views' labels). */
export interface ReferenceCatalog {
  ref?: RefNames;
  referenceUi?: Record<string, unknown>;
  referenceSearch?: Record<string, unknown>;
}

const catalogs = new Map<string, Promise<ReferenceCatalog>>();

/**
 * The lazy reference catalog (`messages/reference/<locale>.json`), one load per locale. A rejected
 * load is dropped, so a transient chunk failure is retried on the next open.
 */
export function loadReferenceMessages(locale: string): Promise<ReferenceCatalog> {
  const key = locale === "zh-TW" ? "zh-TW" : "en";
  let found = catalogs.get(key);
  if (!found) {
    const pending = (key === "zh-TW"
      ? import("@skald/system-dnd5e/data/dnd5e-2024/messages/reference/zh-TW.json")
      : import("@skald/system-dnd5e/data/dnd5e-2024/messages/reference/en.json")
    ).then((module) => (module.default ?? module) as ReferenceCatalog);
    found = pending;
    catalogs.set(key, pending);
    pending.catch(() => {
      if (catalogs.get(key) === pending) catalogs.delete(key);
    });
  }
  return found;
}

function loadReferenceCatalog(locale: string): Promise<RefNames> {
  return loadReferenceMessages(locale).then((catalog) => catalog.ref ?? {});
}

/**
 * The names of every built-in entry outside tier A, in `locale` (English where it has none): the
 * reference catalog plus the creature and magic item indexes. Loaded when a reference view, the
 * compendium or the reader opens, and by the pack validator.
 */
export async function loadReferenceNames(locale: string): Promise<RefNames> {
  const indexes = Object.keys(indexKinds);
  const [catalog, english, localized] = await Promise.all([
    loadReferenceCatalog(locale),
    Promise.all(indexes.map((index) => loadEnglishIndex(index))),
    Promise.all(indexes.map((index) => loadLocalizedIndex(locale, index))),
  ]);
  const out: RefNames = { ...catalog };
  indexes.forEach((index, position) => {
    const kind = indexKinds[index];
    const names: Record<string, string> = { ...out[kind] };
    for (const [id, row] of Object.entries(english[position] ?? {})) {
      const local = localized[position]?.[id]?.name;
      const name = typeof local === "string" && local ? local : row.name;
      if (typeof name === "string") names[id] = name;
    }
    out[kind] = names;
  });
  return out;
}

/** The zh-TW lazy index of a kind (`corpus/index/zh-TW/<kind>.json`: `{id: {name}}`); other locales have none. */
export function loadLocalizedIndex(locale: string, kind: string): Promise<CorpusIndex | null> {
  if (locale !== "zh-TW") return Promise.resolve(null);
  switch (kind) {
    case "creature":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/index/zh-TW/creature.json").then((module) => module.default as CorpusIndex);
    case "item-magic":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/index/zh-TW/item-magic.json").then((module) => module.default as CorpusIndex);
    default:
      return Promise.resolve(null);
  }
}

const pickOverlay = (module: { default: unknown }) => module.default as Record<string, CorpusOverlay>;

/** The zh-TW overlay for a part (`corpus/zh-TW/<part>.json`, same file names as English); other locales have none. */
export function loadOverlay(locale: string, part: string): Promise<Record<string, CorpusOverlay> | null> {
  if (locale !== "zh-TW") return Promise.resolve(null);
  switch (part) {
    case "action":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/zh-TW/action.json").then(pickOverlay);
    case "background":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/zh-TW/background.json").then(pickOverlay);
    case "baseItem":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/zh-TW/baseItem.json").then(pickOverlay);
    case "chapter-character-creation":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/zh-TW/chapter-character-creation.json").then(pickOverlay);
    case "chapter-character-origins":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/zh-TW/chapter-character-origins.json").then(pickOverlay);
    case "chapter-classes":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/zh-TW/chapter-classes.json").then(pickOverlay);
    case "chapter-equipment":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/zh-TW/chapter-equipment.json").then(pickOverlay);
    case "chapter-feats":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/zh-TW/chapter-feats.json").then(pickOverlay);
    case "chapter-gameplay-toolbox":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/zh-TW/chapter-gameplay-toolbox.json").then(pickOverlay);
    case "chapter-magic-items":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/zh-TW/chapter-magic-items.json").then(pickOverlay);
    case "chapter-monsters":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/zh-TW/chapter-monsters.json").then(pickOverlay);
    case "chapter-playing-the-game":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/zh-TW/chapter-playing-the-game.json").then(pickOverlay);
    case "chapter-rules-glossary":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/zh-TW/chapter-rules-glossary.json").then(pickOverlay);
    case "chapter-spells":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/zh-TW/chapter-spells.json").then(pickOverlay);
    case "class":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/zh-TW/class.json").then(pickOverlay);
    case "creature-1":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/zh-TW/creature-1.json").then(pickOverlay);
    case "creature-2":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/zh-TW/creature-2.json").then(pickOverlay);
    case "creature-3":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/zh-TW/creature-3.json").then(pickOverlay);
    case "creature-4":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/zh-TW/creature-4.json").then(pickOverlay);
    case "creature-5":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/zh-TW/creature-5.json").then(pickOverlay);
    case "creature-6":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/zh-TW/creature-6.json").then(pickOverlay);
    case "classFeature-barbarian":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/zh-TW/classFeature-barbarian.json").then(pickOverlay);
    case "classFeature-bard":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/zh-TW/classFeature-bard.json").then(pickOverlay);
    case "classFeature-cleric":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/zh-TW/classFeature-cleric.json").then(pickOverlay);
    case "classFeature-druid":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/zh-TW/classFeature-druid.json").then(pickOverlay);
    case "classFeature-fighter":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/zh-TW/classFeature-fighter.json").then(pickOverlay);
    case "classFeature-monk":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/zh-TW/classFeature-monk.json").then(pickOverlay);
    case "classFeature-paladin":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/zh-TW/classFeature-paladin.json").then(pickOverlay);
    case "classFeature-ranger":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/zh-TW/classFeature-ranger.json").then(pickOverlay);
    case "classFeature-rogue":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/zh-TW/classFeature-rogue.json").then(pickOverlay);
    case "classFeature-sorcerer":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/zh-TW/classFeature-sorcerer.json").then(pickOverlay);
    case "classFeature-warlock":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/zh-TW/classFeature-warlock.json").then(pickOverlay);
    case "classFeature-wizard":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/zh-TW/classFeature-wizard.json").then(pickOverlay);
    case "condition":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/zh-TW/condition.json").then(pickOverlay);
    case "feat":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/zh-TW/feat.json").then(pickOverlay);
    case "item":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/zh-TW/item.json").then(pickOverlay);
    case "item-magic-1":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/zh-TW/item-magic-1.json").then(pickOverlay);
    case "item-magic-2":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/zh-TW/item-magic-2.json").then(pickOverlay);
    case "item-magic-3":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/zh-TW/item-magic-3.json").then(pickOverlay);
    case "itemGroup":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/zh-TW/itemGroup.json").then(pickOverlay);
    case "itemMastery":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/zh-TW/itemMastery.json").then(pickOverlay);
    case "itemProperty":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/zh-TW/itemProperty.json").then(pickOverlay);
    case "language":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/zh-TW/language.json").then(pickOverlay);
    case "lineage":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/zh-TW/lineage.json").then(pickOverlay);
    case "optionalFeature":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/zh-TW/optionalFeature.json").then(pickOverlay);
    case "rule":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/zh-TW/rule.json").then(pickOverlay);
    case "skill":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/zh-TW/skill.json").then(pickOverlay);
    case "species":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/zh-TW/species.json").then(pickOverlay);
    case "spell-0":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/zh-TW/spell-0.json").then(pickOverlay);
    case "spell-1":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/zh-TW/spell-1.json").then(pickOverlay);
    case "spell-2":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/zh-TW/spell-2.json").then(pickOverlay);
    case "spell-3":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/zh-TW/spell-3.json").then(pickOverlay);
    case "spell-4":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/zh-TW/spell-4.json").then(pickOverlay);
    case "spell-5":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/zh-TW/spell-5.json").then(pickOverlay);
    case "spell-6":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/zh-TW/spell-6.json").then(pickOverlay);
    case "spell-7":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/zh-TW/spell-7.json").then(pickOverlay);
    case "spell-8":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/zh-TW/spell-8.json").then(pickOverlay);
    case "spell-9":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/zh-TW/spell-9.json").then(pickOverlay);
    case "status":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/zh-TW/status.json").then(pickOverlay);
    case "subclass":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/zh-TW/subclass.json").then(pickOverlay);
    case "table":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/zh-TW/table.json").then(pickOverlay);
    case "subclassFeature-barbarian":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/zh-TW/subclassFeature-barbarian.json").then(pickOverlay);
    case "subclassFeature-bard":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/zh-TW/subclassFeature-bard.json").then(pickOverlay);
    case "subclassFeature-cleric":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/zh-TW/subclassFeature-cleric.json").then(pickOverlay);
    case "subclassFeature-druid":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/zh-TW/subclassFeature-druid.json").then(pickOverlay);
    case "subclassFeature-fighter":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/zh-TW/subclassFeature-fighter.json").then(pickOverlay);
    case "subclassFeature-monk":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/zh-TW/subclassFeature-monk.json").then(pickOverlay);
    case "subclassFeature-paladin":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/zh-TW/subclassFeature-paladin.json").then(pickOverlay);
    case "subclassFeature-ranger":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/zh-TW/subclassFeature-ranger.json").then(pickOverlay);
    case "subclassFeature-rogue":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/zh-TW/subclassFeature-rogue.json").then(pickOverlay);
    case "subclassFeature-sorcerer":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/zh-TW/subclassFeature-sorcerer.json").then(pickOverlay);
    case "subclassFeature-warlock":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/zh-TW/subclassFeature-warlock.json").then(pickOverlay);
    case "subclassFeature-wizard":
      return import("@skald/system-dnd5e/data/dnd5e-2024/corpus/zh-TW/subclassFeature-wizard.json").then(pickOverlay);
    default:
      return Promise.resolve(null);
  }
}
