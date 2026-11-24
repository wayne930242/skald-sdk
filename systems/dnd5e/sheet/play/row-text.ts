"use client";

import { useEffect, useState } from "react";
import { entriesToText, type EntriesTextOptions } from "../../reference/entries-to-text";
import { slugId, splitRef } from "../../reference/tags";
import type { ReferenceContextValue } from "../use-reference-context";
import { usePlay } from "./play-context";
import { text } from "./play-model";

/**
 * Rules text for a sheet row (S11): a built-in row reads the reference corpus in the viewer's
 * locale (tier C, loaded when a play tab shows the row), never through pack overlays. A pack or
 * custom row shows the text it
 * saved. A species trait row (`species:elf` + id `species:elf#darkvision`) shows the trait's own
 * block; a lineage row the block named after it.
 */

const cache = new Map<string, Promise<string | null>>();

function blockName(block: unknown): string {
  const name = typeof block === "object" && block !== null ? (block as { name?: unknown }).name : undefined;
  return typeof name === "string" ? name : "";
}

function blockBody(block: unknown): unknown[] {
  const entries = typeof block === "object" && block !== null ? (block as { entries?: unknown }).entries : undefined;
  return Array.isArray(entries) ? entries : [block];
}

async function readText(
  context: ReferenceContextValue,
  ref: string,
  fragment: string,
  options: EntriesTextOptions,
): Promise<string | null> {
  const parsed = splitRef(ref);
  if (!parsed) return null;
  const resolved = await context.srdSource.resolve(ref, context.locale);
  if (!resolved) return null;
  let blocks = resolved.blocks.map((block) => block.block);
  if (fragment || parsed.kind === "lineage") {
    // Block names to match are English: the localized blocks sit at the same indexes.
    const english = context.locale === "en" ? resolved : await context.srdSource.resolve(ref, "en");
    const names = (english?.blocks ?? []).map((block) => blockName(block.block));
    const keep = names.flatMap((name, index) =>
      fragment ? (slugId(name) === fragment ? [index] : []) : /\)$/.test(name) ? [index] : [],
    );
    // The row already shows the block's name: take what the block says, not its title.
    if (keep.length > 0) blocks = keep.flatMap((index) => blockBody(blocks[index]));
    else if (fragment) return null;
  }
  const body = entriesToText(blocks, options);
  return body.trim() === "" ? null : body;
}

export function loadRowText(
  context: ReferenceContextValue,
  row: Record<string, unknown>,
  options: EntriesTextOptions,
): Promise<string | null> {
  const ref = text(row.ref);
  if (!ref) return Promise.resolve(null);
  const id = text(row.id);
  const fragment = id.startsWith(`${ref}#`) ? id.slice(ref.length + 1) : "";
  const key = `${context.locale}\u0000${ref}\u0000${fragment}`;
  let found = cache.get(key);
  if (!found) {
    found = readText(context, ref, fragment, options).catch(() => null);
    cache.set(key, found);
  }
  return found;
}

export interface RowText {
  text: string | null;
  loading: boolean;
}

/**
 * The row's text, the rule of `rowBodyText` (row-body.ts, kept out of the sheet's first load): the
 * player's own text first, then its saved snapshot (pack, custom), else the corpus for its ref.
 */
/**
 * A pack row that holds no text (a table copy's, D9) with the text of the viewer's own pack, read
 * by ref and its name as section; the row itself when it holds text, or the viewer lacks the pack.
 */
export function withPackRowText(context: Pick<ReferenceContextValue, "packText">, row: Record<string, unknown>): Record<string, unknown> {
  if (text(row.origin) !== "pack" || text(row.text).trim() !== "" || !context.packText) return row;
  const found = context.packText.rowText(row);
  return found ? { ...row, text: found } : row;
}

export function useRowText(context: ReferenceContextValue, row: Record<string, unknown>): RowText {
  const saved = text(row.playerText).trim() || text(withPackRowText(context, row).text).trim();
  const ref = text(row.ref);
  const wantsCorpus = saved === "" && ref !== "" && text(row.origin) !== "pack";
  const key = `${context.locale}\u0000${ref}\u0000${text(row.id)}`;
  const [loaded, setLoaded] = useState<{ key: string; text: string | null } | null>(null);
  useEffect(() => {
    if (!wantsCorpus) return;
    let live = true;
    void loadRowText(context, row, {
      label: context.renderContext.label,
      abilityDc: context.renderContext.abilityDc,
      abilityAttackMod: context.renderContext.abilityAttackMod,
    }).then((value) => {
      if (live) setLoaded({ key, text: value });
    });
    return () => {
      live = false;
    };
    // The row object changes on every sheet write; its ref and id decide the text.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, wantsCorpus, context]);
  if (saved !== "") return { text: saved, loading: false };
  if (!wantsCorpus) return { text: null, loading: false };
  return loaded?.key === key ? { text: loaded.text, loading: false } : { text: null, loading: true };
}

/** The opening sentence (two when the first is very short), for a one-line summary under a name. */
export function summaryOf(body: string | null, maxChars = 110): string {
  if (!body) return "";
  const first = body.split("\n").find((line) => line.trim() !== "") ?? "";
  const sentences = first.match(/[^。！？.!?]+[。！？.!?]?/g) ?? [first];
  let out = sentences[0] ?? "";
  if (out.trim().length < 24 && sentences[1]) out += sentences[1];
  out = out.trim();
  return out.length > maxChars ? `${out.slice(0, maxChars - 1)}…` : out;
}

/**
 * What a spell row needs to roll in play: an attack roll, damage dice, healing dice, and the dice
 * each gains per slot level above the spell's (from game data, any locale).
 */
export interface SpellFacts {
  attack: boolean;
  dice: string | null;
  heal?: string | null;
  /** The healing adds the spellcasting ability modifier to `heal` (game data `healAddsSpellMod`). */
  healMod?: boolean;
  diceHigher?: string | null;
  healHigher?: string | null;
}

const diceOf = (value: unknown): string | null => (typeof value === "string" && value ? value : null);

const factsByList = new WeakMap<object, Map<string, SpellFacts>>();

/**
 * A spell's roll facts from the System's game data (`damageDice`, `healDice`, their `*Higher` dice
 * per slot level, `healAddsSpellMod`, `spellAttack` in
 * game/spells.json): the sheet does not load the reference corpus to roll a cantrip.
 */
export function spellFactsOf(gameData: Record<string, unknown> | undefined, ref: string): SpellFacts | null {
  const list = gameData?.spells;
  if (!Array.isArray(list) || !ref.startsWith("spell:")) return null;
  let index = factsByList.get(list);
  if (!index) {
    index = new Map();
    for (const spell of list as Array<Record<string, unknown>>) {
      if (typeof spell?.ref !== "string") continue;
      index.set(spell.ref, {
        attack: spell.spellAttack === true,
        dice: diceOf(spell.damageDice),
        heal: diceOf(spell.healDice),
        healMod: spell.healAddsSpellMod === true,
        diceHigher: diceOf(spell.damageDiceHigher),
        healHigher: diceOf(spell.healDiceHigher),
      });
    }
    factsByList.set(list, index);
  }
  return index.get(ref) ?? null;
}

export function useSpellFacts(ref: string): SpellFacts | null {
  const { system } = usePlay();
  return spellFactsOf(system.gameData, ref);
}

/**
 * The name a built-in row takes from the catalog, in the viewer's locale; null when the row's own
 * `name` shows (a pack or custom row, or a ref the catalog does not name).
 */
export function catalogName(context: ReferenceContextValue, row: Record<string, unknown>): string | null {
  const ref = text(row.ref);
  const origin = text(row.origin);
  if (!ref || origin === "pack" || origin === "custom") return null;
  const id = text(row.id);
  const fragment = id.startsWith(`${ref}#`) ? id.slice(ref.length + 1) : "";
  if (fragment) {
    const trait = context.token(`{{i18n:wizard.trait.${fragment}}}`);
    return trait && trait !== fragment ? trait : null;
  }
  const parsed = splitRef(ref);
  const known = parsed && (context.names[parsed.kind]?.[parsed.id] ?? context.englishNames[parsed.kind]?.[parsed.id]);
  return known ? context.nameOf(ref) : null;
}

/**
 * A row's name in the viewer's locale (A2-10). The wizard and the library write names in the
 * creator's locale, so a built-in row (a ref the catalog names, not a pack or custom row) is named
 * from the catalog; a species trait row (`species:elf#darkvision`) from its wizard trait label.
 */
export function displayName(context: ReferenceContextValue, row: Record<string, unknown>): string {
  const catalog = catalogName(context, row);
  if (catalog !== null) return catalog;
  const saved = text(row.name);
  const ref = text(row.ref);
  if (!ref) return saved;
  const origin = text(row.origin);
  // A species trait row the wizard labels do not name keeps its saved name.
  if (origin !== "pack" && origin !== "custom" && text(row.id).startsWith(`${ref}#`)) return saved;
  return saved || context.nameOf(ref);
}

/**
 * A spell row's game data entry (casting time, range): a built-in spell, or a pack spell while its
 * pack is loaded here (B-014); none for a custom spell or an unloaded pack.
 */
export function gameSpellOf(context: ReferenceContextValue, spell: Record<string, unknown>) {
  const ref = text(spell.ref);
  return ref.startsWith("spell:") ? context.gameSpells.get(ref.slice(6)) : undefined;
}

/** A spell row's casting time and range in the viewer's locale: game data tokens for a built-in or loaded pack spell. */
export function spellLine(context: ReferenceContextValue, spell: Record<string, unknown>): string {
  const game = gameSpellOf(context, spell);
  const castingTime = context.token(game?.castingTime || text(spell.castingTime));
  const range = context.token(game?.range || text(spell.range));
  return [castingTime, range].filter(Boolean).join(" · ");
}
