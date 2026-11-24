/**
 * Rule T of the print plan: the text a row prints on the full text pages and in the spellbook.
 *
 * - The row's own text by the sheet's rule (`rowBodyText`, plan-uat2 §3.4): the player's text
 *   (`playerText`), else the row's saved `text` (a pack row's snapshot, a custom row's text),
 *   read as the play view shows it: heads saved before B-001 take today's form.
 * - A pack row the rule leaves empty prints the pack cached on this device; without that, its
 *   name and a notice. Pack text is only rendered here: it is never written to the row, the
 *   store or a log.
 * - Any other row the rule leaves empty prints the SRD text of its ref in the viewer's locale,
 *   read from the corpus the sheet already loads on demand.
 *
 * Rule L of the official-layout print: a lineage row (`lineage:dragonborn/brass`) repeats its species'
 * traits in its own version. Each of its blocks, matched by English name (a trailing parenthetical
 * dropped: "Elven Lineage (High Elf)") to a species trait row's fragment (`species:elf#elven-lineage`),
 * replaces that trait's printed text; what matches nothing stays on the lineage row, which drops out
 * once nothing is left. A trait the player rewrote keeps the player's text.
 *
 * Nothing here writes; the loaders read the corpus chunks and this device's pack cache.
 */
import { entriesToText, type EntriesTextOptions } from "../reference/entries-to-text";
import { normalizeInlineHead } from "../reference/inline-head";
import type { ReferenceSource, ResolvedReference } from "../reference/sources";
import { slugId, splitRef } from "../reference/tags";
import { text } from "../sheet/play/play-model";
import { rowBodyText } from "../sheet/play/row-body";
import type { Row } from "./print-model";

export type BodySource =
  | { kind: "own"; text: string }
  | { kind: "srd"; ref: string; fragment: string }
  | { kind: "pack"; ref: string; fragment: string }
  | { kind: "none" };

/** Where a row's printed text comes from (no loading). */
export function bodySource(row: Row): BodySource {
  // The corpus text is resolved below, on its own: a null SRD text leaves only the row's own.
  const own = rowBodyText(row, null);
  if (own.trim() !== "") return { kind: "own", text: own };
  const ref = text(row.ref);
  if (!ref || !splitRef(ref)) return { kind: "none" };
  const id = text(row.id);
  const fragment = id.startsWith(`${ref}#`) ? id.slice(ref.length + 1) : "";
  if (text(row.origin) === "pack") return { kind: "pack", ref, fragment };
  if (text(row.origin) === "custom") return { kind: "none" };
  return { kind: "srd", ref, fragment };
}

export interface PrintText {
  /**
   * "packMissing": a pack row whose pack is not on this device; "none": nothing to print;
   * "merged": a lineage row whose every block prints on its species trait rows (rule L).
   */
  status: "ok" | "packMissing" | "none" | "merged";
  body: string;
  /** A spell's "Using a Higher-Level Spell Slot" text. */
  higher: string;
  /** The resolved entry's `meta` (a spell's school, components and duration), when one resolved. */
  meta: Record<string, unknown> | null;
  /** Rule L: the key of the lineage row whose own version of this trait differs from the species'. */
  lineage?: string;
}

export interface PrintTextDeps {
  locale: string;
  srd: ReferenceSource;
  /** This device's cached pack as a reference source, or null; called only when a row needs it. */
  pack: () => Promise<ReferenceSource | null>;
  options: EntriesTextOptions;
}

/** No cap: the print carries the whole text, unlike a row snapshot (8,000 characters). */
const FULL = Number.POSITIVE_INFINITY;

function blockName(block: unknown): string {
  const name = typeof block === "object" && block !== null ? (block as { name?: unknown }).name : undefined;
  return typeof name === "string" ? name : "";
}

function blockBody(block: unknown): unknown[] {
  const entries = typeof block === "object" && block !== null ? (block as { entries?: unknown }).entries : undefined;
  return Array.isArray(entries) ? entries : [block];
}

/**
 * The blocks a row shows, the same choice as the play view (`row-text.ts`): a species trait row
 * (`species:elf#darkvision`) the trait's own block, a lineage row the block named after it.
 */
async function rowBlocks(deps: PrintTextDeps, resolved: ResolvedReference, ref: string, fragment: string): Promise<unknown[] | null> {
  const blocks = resolved.blocks.map((block) => block.block);
  if (!fragment && resolved.kind !== "lineage") return blocks;
  // Block names to match are English: the localized blocks sit at the same indexes.
  const english = deps.locale === "en" ? resolved : await deps.srd.resolve(ref, "en");
  const names = (english?.blocks ?? []).map((block) => blockName(block.block));
  const keep = names.flatMap((name, index) =>
    fragment ? (slugId(name) === fragment ? [index] : []) : /\)$/.test(name) ? [index] : [],
  );
  if (keep.length > 0) return keep.flatMap((index) => blockBody(blocks[index]));
  return fragment ? null : blocks;
}

function fromResolved(deps: PrintTextDeps, resolved: ResolvedReference, blocks: unknown[]): PrintText {
  const body = entriesToText(blocks, deps.options, FULL).trim();
  const higher = entriesToText(resolved.higherLevel.map((block) => block.block), deps.options, FULL).trim();
  return { status: body || higher ? "ok" : "none", body, higher, meta: resolved.meta ?? null };
}

const NONE: PrintText = { status: "none", body: "", higher: "", meta: null };

/** The printed text of one row. Pack text resolves from this device's cache only. */
export async function loadPrintText(row: Row, deps: PrintTextDeps): Promise<PrintText> {
  const source = bodySource(row);
  // A spell row also prints its stat line, which comes from the resolved entry even when the
  // player's own text replaces the rules text.
  const ref = text(row.ref);
  const isSpell = ref.startsWith("spell:");
  if (source.kind === "own") {
    const meta = isSpell ? await metaOf(row, deps) : null;
    // read as the play view reads it (SnapshotText): a snapshot saved before B-001 with today's heads
    const body = source.text.trim().split("\n").map(normalizeInlineHead).join("\n");
    return { status: "ok", body, higher: "", meta };
  }
  if (source.kind === "none") return NONE;
  if (source.kind === "pack") {
    const pack = await deps.pack().catch(() => null);
    const resolved = pack ? await pack.resolve(source.ref, deps.locale).catch(() => null) : null;
    if (!resolved) return { ...NONE, status: "packMissing" };
    // A trait row without its snapshot (a table copy, D9) prints its own section, else the whole entry.
    const blocks = source.fragment ? await rowBlocks({ ...deps, srd: pack! }, resolved, source.ref, source.fragment) : null;
    return fromResolved(deps, resolved, blocks ?? resolved.blocks.map((block) => block.block));
  }
  const resolved = await deps.srd.resolve(source.ref, deps.locale).catch(() => null);
  if (!resolved) return NONE;
  const blocks = await rowBlocks(deps, resolved, source.ref, source.fragment);
  return blocks ? fromResolved(deps, resolved, blocks) : NONE;
}

async function metaOf(row: Row, deps: PrintTextDeps): Promise<Record<string, unknown> | null> {
  const ref = text(row.ref);
  const resolved = text(row.origin) === "pack"
    ? await deps.pack().then((pack) => pack?.resolve(ref, deps.locale) ?? null).catch(() => null)
    : await deps.srd.resolve(ref, deps.locale).catch(() => null);
  return resolved?.meta ?? null;
}

/** Every keyed row's printed text; each row resolves on its own, so one failure leaves the rest. */
export async function loadPrintTexts(entries: ReadonlyArray<{ key: string; row: Row }>, deps: PrintTextDeps): Promise<Map<string, PrintText>> {
  let packSource: Promise<ReferenceSource | null> | null = null;
  const shared: PrintTextDeps = { ...deps, pack: () => (packSource ??= deps.pack()) };
  const loaded = new Map(await Promise.all(
    entries.map(async (entry) => [entry.key, await loadPrintText(entry.row, shared).catch(() => NONE)] as const),
  ));
  for (const entry of entries) {
    const source = bodySource(entry.row);
    if (source.kind !== "srd" || splitRef(source.ref)?.kind !== "lineage") continue;
    await mergeLineage(entry.key, source.ref, entries, loaded, shared).catch(() => undefined);
  }
  return loaded;
}

/** Rule L for one lineage row: its blocks go to the species trait rows they repeat. */
async function mergeLineage(
  key: string,
  ref: string,
  entries: ReadonlyArray<{ key: string; row: Row }>,
  texts: Map<string, PrintText>,
  deps: PrintTextDeps,
): Promise<void> {
  const [resolved, english] = await Promise.all([
    deps.srd.resolve(ref, deps.locale),
    deps.locale === "en" ? null : deps.srd.resolve(ref, "en"),
  ]);
  const englishBlocks = (english ?? resolved)?.blocks ?? [];
  if (!resolved || englishBlocks.length !== resolved.blocks.length) return;
  // species trait rows by fragment: `species:elf#elven-lineage` → elven-lineage
  const traits = new Map<string, { key: string; row: Row }>();
  for (const entry of entries) {
    const id = text(entry.row.id);
    const match = /^species:[^#]+#(.+)$/.exec(id);
    if (match) traits.set(match[1], entry);
  }
  const speciesEnglish = new Map<string, unknown>();
  const kept: unknown[] = [];
  let changed = false;
  for (const [index, block] of englishBlocks.entries()) {
    const name = blockName(block.block).replace(/\s*\([^)]*\)\s*$/, "");
    const trait = name ? traits.get(slugId(name)) : undefined;
    if (!trait) {
      kept.push(resolved.blocks[index].block);
      continue;
    }
    changed = true;
    const own = bodySource(trait.row);
    // the player's own text wins (rule T), and a pack or custom row keeps its own text: the
    // lineage keeps what it would have replaced, so its version still prints once
    if (own.kind !== "srd") {
      kept.push(resolved.blocks[index].block);
      continue;
    }
    if (!speciesEnglish.has(own.ref)) {
      const species = await deps.srd.resolve(own.ref, "en").catch(() => null);
      for (const speciesBlock of species?.blocks ?? []) speciesEnglish.set(`${own.ref}#${slugId(blockName(speciesBlock.block))}`, speciesBlock.block);
      speciesEnglish.set(own.ref, true);
    }
    const generic = speciesEnglish.get(`${own.ref}#${own.fragment}`);
    const differs = generic === undefined || JSON.stringify(blockBody(generic)) !== JSON.stringify(blockBody(block.block));
    const body = entriesToText(blockBody(resolved.blocks[index].block), deps.options, FULL).trim();
    texts.set(trait.key, { status: body ? "ok" : "none", body, higher: "", meta: null, ...(differs ? { lineage: key } : {}) });
  }
  if (!changed) return;
  const body = entriesToText(kept, deps.options, FULL).trim();
  texts.set(key, body ? { status: "ok", body, higher: "", meta: resolved.meta ?? null } : { ...NONE, status: "merged" });
}

/** What a damage cantrip's table row prints besides its dice: the save it calls for and its damage type. */
export interface CantripFacts {
  save: "str" | "dex" | "con" | "int" | "wis" | "cha" | null;
  /** Lower case English (`fire`), or null when the caster chooses it. */
  damageType: string | null;
}

const SAVE = /(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) saving throw/;
const DAMAGE = /\{@damage [^}]+\} (\w+) damage/;

/**
 * Each cantrip's save and damage type, read from its English rules text (any viewer's locale).
 * Print-only, so it costs the sheet's first load and its on-demand chunks nothing.
 */
export async function loadCantripFacts(refs: readonly string[], deps: PrintTextDeps): Promise<Map<string, CantripFacts>> {
  const facts = await Promise.all(refs.map(async (ref) => {
    const resolved = await deps.srd.resolve(ref, "en").catch(() => null);
    if (!resolved) return null;
    const raw = JSON.stringify(resolved.blocks.map((block) => block.block));
    const save = SAVE.exec(raw)?.[1];
    const damage = DAMAGE.exec(raw)?.[1];
    return [ref, { save: save ? (save.slice(0, 3).toLowerCase() as CantripFacts["save"]) : null, damageType: damage ? damage.toLowerCase() : null }] as const;
  }));
  return new Map(facts.filter((fact): fact is NonNullable<typeof fact> => fact !== null));
}
