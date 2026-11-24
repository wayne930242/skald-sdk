/**
 * The words of the D&D print, in the viewer's locale: what each region, table row, prose paragraph
 * and spellbook entry says, built once from the print model, the loaded texts and the labels. The
 * measuring layer and the printed pages render the same content, so what was measured is what
 * prints. Pure (no React).
 */
import { signed } from "../sheet/play/play-model";
import type { PrintLabels } from "./print-labels";
import type { DndPrintModel, PrintSpell, PrintTextRow, Row } from "./print-model";
import type { CantripFacts, PrintText } from "./print-text";
import { sentencePieces, type ProseId, type TextRegionId } from "./paginate";
import { spellStats } from "./spell-stats";

export type SpellLineOf = (row: Row) => { castingTime: string; range: string };

export interface EntryContent {
  id: string;
  name: string;
  /** Level, feat category, lineage, pack or custom. */
  meta: string;
  /** The text's parts: its paragraphs, an over-long one in several (`joined`). */
  paragraphs: string[];
  /** Per part: it goes on from the part before it, in the same paragraph (POR-F006). */
  joined: boolean[];
  /** The opening words of the text, for a summary line. */
  teaser: string;
}

export interface AttackRowContent {
  id: string;
  name: string;
  hit: string;
  damage: string;
  notes: string;
}

export interface SpellRowContent {
  id: string;
  level: string;
  /** ◆ always prepared, ● prepared, ○ not; none for a cantrip. */
  mark: string;
  name: string;
  castingTime: string;
  range: string;
  c: boolean;
  r: boolean;
  m: boolean;
  notes: string;
}

export interface EquipmentRowContent {
  id: string;
  equipped: boolean;
  qty: string;
  name: string;
  weight: string;
}

/** A paragraph of prose cut into pieces (sentences, list items); `label` leads it in bold. */
export interface ProseParagraph {
  label?: string;
  pieces: string[];
}

export interface SpellbookEntry {
  id: string;
  mark: string;
  name: string;
  tags: string[];
  /** The stat line: school, casting time, range, components, duration. */
  stats: Array<{ label: string; value: string }>;
  notes: string;
  /** As an entry's: the parts of the text, and which go on from the part before them. */
  paragraphs: string[];
  joined: boolean[];
}

export const IDENTITY_FIELDS = ["name", "background", "className", "species", "subclass", "player"] as const;
export type IdentityFieldId = (typeof IDENTITY_FIELDS)[number];

/** A line of page 1's identity box: its label and the whole value. */
export interface IdentityField {
  id: IdentityFieldId;
  label: string;
  value: string;
}

export interface PrintContent {
  /** Page 1's identity lines, in `IDENTITY_FIELDS` order; `prose.identity[i]` is line i for 「身分（續）」. */
  identity: IdentityField[];
  text: Record<TextRegionId, EntryContent[]>;
  items: EntryContent[];
  attackTexts: EntryContent[];
  attacks: AttackRowContent[];
  spells: SpellRowContent[];
  equipment: EquipmentRowContent[];
  prose: Record<ProseId | "notes" | "identity", ProseParagraph[]>;
  /** Spellbook levels in order, each spell in the order of `model.spells`. */
  spellbook: Array<{ level: number; title: string; slots: number; spells: SpellbookEntry[] }>;
  index: Array<{ id: string; name: string; level: string; mark: string; crm: string; castingTime: string; range: string }>;
}

export interface ContentInput {
  model: DndPrintModel;
  texts: ReadonlyMap<string, PrintText>;
  cantrips: ReadonlyMap<string, CantripFacts>;
  labels: PrintLabels;
  lineOf: SpellLineOf;
}

const paragraphsOf = (value: string) => value.split("\n").map((line) => line.trim()).filter(Boolean);

function teaserOf(paragraphs: readonly string[]): string {
  return paragraphs.join(" ").slice(0, 160);
}

/**
 * The longest part of an entry's or a spell's text, in characters. The pager places a part whole, so
 * a part must stay under a column (about 1,500 CJK characters where a column is narrowest, page 2's
 * left half); a longer paragraph, such as a homebrew feature pasted as one block, is cut into parts
 * at sentence ends (POR-F006). A part printed after the one before it in the same column goes on in
 * the same paragraph (`EntryParagraphs`).
 */
export const MAX_PART = 1000;

/** The paragraphs as parts of at most MAX_PART characters, and which part goes on from the one before. */
function partsOf(paragraphs: readonly string[]): { paragraphs: string[]; joined: boolean[] } {
  const parts: string[] = [];
  const joined: boolean[] = [];
  for (const paragraph of paragraphs) {
    let part = "";
    let first = true;
    const close = () => {
      parts.push(part);
      joined.push(!first);
      first = false;
      part = "";
    };
    for (const piece of paragraph.length > MAX_PART ? sentencePieces(paragraph) : [paragraph]) {
      if (part && part.length + piece.length > MAX_PART) close();
      part += piece;
    }
    if (part) close();
  }
  return { paragraphs: parts, joined };
}

function bodyOf(found: PrintText | undefined, labels: PrintLabels): string[] {
  if (!found) return [];
  if (found.status === "packMissing") return [labels.print("texts.packMissing")];
  if (found.status !== "ok") return [];
  return [...paragraphsOf(found.body), ...paragraphsOf(found.higher)];
}

function entryMeta(entry: PrintTextRow, found: PrintText | undefined, model: DndPrintModel, labels: PrintLabels): string {
  const { line } = entry;
  const lineage = found?.lineage ? model.lists.speciesTraits.find((trait) => trait.line.key === found.lineage)?.line.name : "";
  return [
    line.level !== undefined ? labels.print("level", { level: line.level }) : "",
    line.category ? labels.sheet(`option.featCategory.${line.category}`) : "",
    lineage ?? "",
    line.origin === "pack" || line.origin === "custom" ? labels.print(`origin.${line.origin}`) : "",
  ].filter(Boolean).join(" · ");
}

function entries(rows: readonly PrintTextRow[], input: ContentInput, keep: (found: PrintText | undefined) => boolean = () => true): EntryContent[] {
  return rows.flatMap((entry) => {
    const found = input.texts.get(entry.line.key);
    if (found?.status === "merged" || !keep(found)) return [];
    const paragraphs = bodyOf(found, input.labels);
    return [{ id: entry.line.key, name: entry.line.name, meta: entryMeta(entry, found, input.model, input.labels), ...partsOf(paragraphs), teaser: teaserOf(paragraphs) }];
  });
}

const spellMark = (spell: PrintSpell) => (spell.level === 0 ? "" : spell.always ? "◆" : spell.prepared ? "●" : "○");

function round(value: number): string {
  return String(Math.round(value * 10) / 10);
}

/** The species and its lineage in one value: 龍裔（黃銅）. */
export function speciesValue(model: DndPrintModel, labels: PrintLabels): string {
  const { species, lineage } = model.identity;
  if (species && lineage) return labels.print("identity.speciesLineage", { species, lineage });
  return species || lineage;
}

export function buildPrintContent(input: ContentInput): PrintContent {
  const { model, labels, cantrips, lineOf } = input;
  const { print, sheet } = labels;
  const identityValues: Record<IdentityFieldId, string> = {
    name: model.name || print("unnamed"),
    background: model.identity.background,
    className: model.identity.className,
    species: speciesValue(model, labels),
    subclass: model.identity.subclass,
    player: model.identity.player,
  };
  const identity = IDENTITY_FIELDS.map((id) => ({ id, label: print(`identity.${id}`), value: identityValues[id] }));
  const spellByKey = new Map(model.spells.map((spell) => [spell.key, spell]));

  const attacks: AttackRowContent[] = model.attacks.map((attack) => {
    if (attack.kind === "weapon") {
      return { id: attack.key, name: attack.name, hit: attack.attack === null ? "" : signed(attack.attack), damage: [attack.dice, attack.damageType].filter(Boolean).join(" "), notes: attack.notes };
    }
    const facts = cantrips.get(attack.ref);
    const spell = attack.spellKey ? spellByKey.get(attack.spellKey) : undefined;
    const hit = attack.attack !== null
      ? signed(attack.attack)
      : print("attacks.dc", { dc: attack.dc ?? 0, ability: facts?.save ? sheet(`ability.${facts.save}`) : "" }).trim();
    const type = facts?.damageType ? print(`damageType.${facts.damageType}`) : "";
    const range = spell ? lineOf(spell.row).range : "";
    return {
      id: attack.key,
      name: attack.name,
      hit,
      damage: [attack.dice, type].filter(Boolean).join(" "),
      notes: [range, attack.notes].filter(Boolean).join(print("noteSeparator")),
    };
  });

  const spells: SpellRowContent[] = model.spells.map((spell) => {
    const line = lineOf(spell.row);
    return {
      id: spell.key,
      level: spell.level === 0 ? print("spells.cantrip") : String(spell.level),
      mark: spellMark(spell),
      name: spell.name,
      castingTime: line.castingTime,
      range: line.range,
      c: spell.concentration,
      r: spell.ritual,
      m: spell.material,
      notes: spell.notes,
    };
  });

  const equipment: EquipmentRowContent[] = model.equipment.map((item) => ({
    id: item.line.key,
    equipped: item.equipped,
    qty: String(item.qty),
    name: item.line.name,
    weight: item.weight === null ? "" : print("equipment.lb", { value: round(item.weight) }),
  }));

  // 狀態與加值 in the compact print: what is in effect, one line each
  const conditionNames = model.conditions.filter((condition) => condition.active).map((condition) => sheet(`ref.condition.${condition.id}`) || condition.id);
  const status: ProseParagraph[] = model.blanks ? [] : [
    ...(conditionNames.length > 0 ? [{ pieces: conditionNames.map((name, index) => (index < conditionNames.length - 1 ? `${name}${print("separator")}` : name)) }] : []),
    ...(model.exhaustion > 0 ? [{ pieces: [print("status.exhaustion", { level: model.exhaustion, d20: 2 * model.exhaustion, feet: 5 * model.exhaustion })] }] : []),
    ...(model.concentration ? [{ pieces: [print("status.concentration", { name: model.concentration })] }] : []),
    ...model.modifiers.map((modifier) => ({ pieces: [modifierText(modifier.id, modifier.value, labels)] })),
  ];

  const listed = (items: readonly string[]) => items.map((item, index) => (index < items.length - 1 ? `${item}${print("separator")}` : item));
  const training: ProseParagraph[] = [
    { label: print("training.weapons"), pieces: model.training.weapons ? [model.training.weapons] : [] },
    { label: print("training.tools"), pieces: listed(model.training.tools) },
    ...(model.blanks || model.training.masteries.length > 0 ? [{ label: print("training.masteries"), pieces: listed(model.training.masteries) }] : []),
  ];

  const proseOf = (value: string): ProseParagraph[] => paragraphsOf(value).map((paragraph) => ({ pieces: sentencePieces(paragraph) }));

  const levels = [...new Set(model.spells.map((spell) => spell.level))];
  const spellbook = levels.map((level) => ({
    level,
    title: level === 0 ? print("spellbook.cantrips") : print("spellbook.levelTitle", { level }),
    slots: level === 0 ? 0 : model.slots[level - 1]?.total ?? 0,
    spells: model.spells.filter((spell) => spell.level === level).map((spell): SpellbookEntry => {
      const found = input.texts.get(spell.key);
      const stats = spellStats(found?.meta ?? null, spell.row, lineOf(spell.row), labels.stats);
      return {
        id: spell.key,
        mark: spellMark(spell),
        name: spell.name,
        tags: [
          spell.concentration ? print("spellbook.concentrationBadge") : "",
          spell.ritual ? print("spellbook.ritualBadge") : "",
          spell.material ? print("spellbook.materialBadge") : "",
        ].filter(Boolean),
        stats: (["school", "castingTime", "range", "components", "duration"] as const)
          .filter((id) => stats[id])
          .map((id) => ({ label: print(`spellbook.stats.${id}`), value: stats[id] })),
        notes: spell.notes,
        ...partsOf(bodyOf(found, labels)),
      };
    }),
  }));

  return {
    identity,
    text: {
      features: entries(model.lists.features, input),
      speciesTraits: entries(model.lists.speciesTraits, input),
      feats: entries(model.lists.feats, input),
    },
    // an item with nothing to print (a custom item without text) stays in the equipment table only
    items: entries(model.itemRows, input, (found) => found?.status === "ok" || found?.status === "packMissing"),
    attackTexts: entries(model.attackTexts, input),
    attacks,
    spells,
    equipment,
    prose: {
      status,
      training,
      appearance: proseOf(model.appearance),
      backstory: proseOf(model.backstory),
      languages: model.languages.length > 0 ? [{ pieces: listed(model.languages) }] : [],
      notes: proseOf(model.notes),
      identity: identity.map((field) => ({ label: field.label, pieces: field.value ? sentencePieces(field.value) : [] })),
    },
    spellbook,
    index: model.spells.map((spell) => {
      const line = lineOf(spell.row);
      return {
        id: spell.key,
        name: spell.name,
        level: spell.level === 0 ? print("spells.cantrip") : String(spell.level),
        mark: spellMark(spell),
        crm: [spell.concentration ? print("spells.c") : "", spell.ritual ? print("spells.r") : "", spell.material ? print("spells.m") : ""].filter(Boolean).join(print("separator")),
        castingTime: line.castingTime,
        range: line.range,
      };
    }),
  };
}

export function modifierText(id: string, value: number | string | true, labels: PrintLabels): string {
  const label = labels.sheet(`field.${id}`);
  if (value === true) return label;
  if (id === "orderLoreBonus") return labels.sheet(`option.orderLore.${value}`) || String(value);
  return `${label} ${signed(Number(value))}`;
}
