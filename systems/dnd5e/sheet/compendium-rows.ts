import type { LoadedSystem } from "@skald/types/system";
import { asHomebrewRow } from "../homebrew/domain/rows";
import type { ListField } from "@skald/types/schema";
import type { GameSpell, ReferenceContextValue } from "./use-reference-context";

/** The four lists the compendium appends to (design §3.6); each tab is named after its list field. */
export type CompendiumTab = "spells" | "feats" | "equipment" | "features";

/** Every compendium tab: the list tabs and the reference tabs (plan T2b §5.2, §5.3, §5.5). */
export type CompendiumDialogTab = CompendiumTab | "magicItems" | "monsters" | "books";

/**
 * Where the compendium opens (plan-uat2 §3.2): the tab of the list that opened it, a filter preset,
 * and for 戰鬥 the attack intent (weapons, with 「加為攻擊」 as the main action).
 */
export interface CompendiumStart {
  tab: CompendiumDialogTab;
  /** An item category (`weapon`, `armor`, …) or a feat category. */
  category?: string;
  /** A class id: the spells and features class filter. */
  classId?: string;
  intent?: "attack";
}

export function newEntryId(prefix: string): string {
  const suffix =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}_${suffix}`;
}

export function copySpellFields(spell: GameSpell, token: ReferenceContextValue["token"]) {
  return {
    level: spell.level,
    castingTime: token(spell.castingTime),
    range: token(spell.range),
    concentration: spell.concentration === true,
    ritual: spell.ritual === true,
    material: spell.material === true,
  };
}

/** Row template defaults, so a picked row looks like one added with the list's own "Add" button. */
export function rowDefaults(list: ListField | undefined): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};
  for (const field of list?.rowTemplate.children ?? []) {
    if (field.type !== "computed" && field.defaultValue !== undefined) defaults[field.id] = structuredClone(field.defaultValue);
  }
  return defaults;
}

/**
 * A row for a picked compendium entry: `ref` + localized `name`. A built-in row has
 * `origin: "srd"` and empty `text`, resolved live from the corpus; a pack row has
 * `origin: "pack"` and the entry's text copied in (snapshot rule, §1.8), so it renders without the pack.
 * With `snapshotText` false (a table's copy, D9) a pack row keeps ref, name and origin only.
 */
export function buildCompendiumRow(
  tab: CompendiumTab,
  ref: string,
  name: string,
  system: LoadedSystem,
  context: Pick<ReferenceContextValue, "gameSpells" | "token"> & Partial<Pick<ReferenceContextValue, "packRefs" | "packText" | "homebrewOf">>,
  snapshotText = true,
): { list: string; row: Record<string, unknown> } | null {
  const listId = tab;
  const field = system.schema.fields[listId];
  const list = field?.type === "list" ? field : undefined;
  if (!list) return null;
  const [kind, id = ""] = ref.split(":");
  const row: Record<string, unknown> = {
    ...rowDefaults(list),
    id: newEntryId(list.idPrefix ?? listId),
    name,
    ref,
    origin: "srd",
    text: "",
  };
  if (context.packRefs?.has(ref) && context.packText) {
    row.origin = "pack";
    if (snapshotText) row.text = context.packText.text(ref);
    else delete row.text;
  }
  if (tab === "spells") {
    const spell = context.gameSpells.get(id);
    if (spell) Object.assign(row, copySpellFields(spell, context.token), { source: "other" });
  } else if (tab === "feats") {
    const feats = Array.isArray(system.gameData?.feats) ? (system.gameData.feats as Array<{ id?: string; category?: string }>) : [];
    const category = feats.find((feat) => feat.id === id)?.category;
    if (category) row.category = category;
  } else if (tab === "features") {
    const level = /-l(\d+)$/.exec(id)?.[1];
    if (level && kind !== "optionalFeature") row.level = Number(level);
  }
  const stamp = context.homebrewOf?.(ref);
  return { list: listId, row: stamp && context.packText?.has(ref) ? asHomebrewRow(row, context.packText.text(ref), stamp) : row };
}
