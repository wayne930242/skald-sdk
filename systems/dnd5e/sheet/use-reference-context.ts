"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useMessages, useTranslations } from "next-intl";
import type { LoadedSystem } from "@skald/types/system";
import { useSystemPluginUi } from "@skald/sheet-sdk/modules/systems/ui/system-plugin-provider";
import type { EntriesRenderContext } from "../reference/entries-renderer";
import type { EffectivePacks, PackContent } from "../content-pack/domain/types";
import { PackTextIndex } from "../content-pack/domain/overlay";
import { loadReferenceNames } from "../reference/load-corpus";
import {
  createBuiltinSource,
  createPackSource,
  createRefResolver,
  ReferenceSources,
  spellLevelsFrom,
  type NamesCatalog,
} from "../reference/sources";
import { splitRef, TIER_A_TAG_LABELS, type TagLabel } from "../reference/tags";

export const DND_SYSTEM_ID = "dnd5e-2024";

export interface GameSpell {
  id: string;
  ref: string;
  level: number;
  classes: string[];
  castingTime?: string;
  range?: string;
  concentration?: boolean;
  ritual?: boolean;
  material?: boolean;
}

function gameSpellsFrom(value: unknown): Map<string, GameSpell> {
  const spells = new Map<string, GameSpell>();
  if (!Array.isArray(value)) return spells;
  for (const item of value) {
    if (item && typeof item === "object" && typeof item.id === "string" && typeof item.level === "number") {
      spells.set(item.id, item as GameSpell);
    }
  }
  return spells;
}

/** Everything the reference and compendium dialogs share: names, sources, tag labels. */
export interface ReferenceContextValue {
  locale: string;
  names: NamesCatalog;
  englishNames: NamesCatalog;
  sources: ReferenceSources;
  srdSource: ReturnType<typeof createBuiltinSource>;
  resolveRef: (candidate: string) => string | null;
  /** Localized display name of a ref, falling back to English, then the id. */
  nameOf: (ref: string) => string;
  /** `{{i18n:a.b}}` → message text in the viewer's locale (game data labels). */
  token: (value: unknown) => string;
  /** Wizard spell items (tier B) by spell id: level, casting time and range tokens. */
  gameSpells: ReadonlyMap<string, GameSpell>;
  /** Refs of the enabled content packs' entries on this device (none without one). */
  packRefs: ReadonlySet<string>;
  /** The `packId` that supplies a ref (entry or overlay), or undefined. */
  packSupplier: (ref: string) => string | undefined;
  /** Names and snapshot text of the enabled packs, in the viewer's locale. */
  packText: PackTextIndex | null;
  renderContext: Omit<EntriesRenderContext, "onOpenRef">;
}

function messagePath(messages: unknown, path: string): unknown {
  let current = messages;
  for (const part of path.split(".")) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/** `names` with the lazy names (creatures, magic items, tables, chapters) added per kind. */
function withLazyNames(names: NamesCatalog, lazy: NamesCatalog | undefined): NamesCatalog {
  if (!lazy) return names;
  const out: NamesCatalog = { ...names };
  for (const [kind, ids] of Object.entries(lazy) as Array<[keyof NamesCatalog, Record<string, string>]>) {
    out[kind] = { ...ids, ...out[kind] };
  }
  return out;
}

interface LazyNames {
  locale: string;
  own: NamesCatalog;
  english?: NamesCatalog;
}

/**
 * The lazy names (plan T2b §5.10) once `enabled`: the reference catalog and the creature and magic
 * item indexes, in the viewer's locale and, when `english`, in English. Nothing loads before.
 */
function useLazyNames(locale: string, enabled: boolean, english: boolean): LazyNames | null {
  const [loaded, setLoaded] = useState<LazyNames | null>(null);
  const needEnglish = english && locale !== "en";
  const current = loaded && loaded.locale === locale && (!needEnglish || loaded.english) ? loaded : null;
  useEffect(() => {
    if (!enabled || current) return;
    let live = true;
    // A failed chunk load is left unhandled, so it reaches the error reporting instead of passing silently.
    void Promise.all([loadReferenceNames(locale), needEnglish ? loadReferenceNames("en") : Promise.resolve(undefined)])
      .then(([own, englishNames]) => {
        if (live) setLoaded({ locale, own, ...(englishNames ? { english: englishNames } : {}) });
      });
    return () => {
      live = false;
    };
  }, [current, enabled, locale, needEnglish]);
  return enabled ? current : null;
}

/** `names` with the pack's names added where no built-in name exists (built-in wins). */
function withPackNames(names: NamesCatalog, pack: PackContent, locale: string): NamesCatalog {
  const zh = locale.toLowerCase().startsWith("zh");
  const out: NamesCatalog = { ...names };
  for (const entry of pack.entries) {
    const kind = entry.kind;
    if (out[kind]?.[entry.id] !== undefined) continue;
    out[kind] = { ...out[kind], [entry.id]: (zh ? pack.zhTW[entry.ref]?.name : undefined) ?? entry.name };
  }
  return out;
}

/**
 * Pack spell picks as wizard spell items: level and classes; casting time and range as the
 * built-in message token when this locale has one for the pick's code (B-014), else as the pack words it.
 */
export function packSpells(pack: PackContent, hasMessage: (key: string) => boolean): GameSpell[] {
  return (pack.wizard.spells ?? []).flatMap((item) => {
    const w = (item.w ?? {}) as Record<string, unknown>;
    if (typeof item.level !== "number" || typeof item.ref !== "string") return [];
    const coded = (namespace: string, code: unknown, own: unknown) =>
      typeof code === "string" && hasMessage(`${namespace}.${code}`) ? `{{i18n:${namespace}.${code}}}` : typeof own === "string" ? own : undefined;
    const castingTime = coded("spellCastingTime", item.castingTimeCode, w.castingTime);
    const range = coded("spellRange", item.rangeCode, w.range);
    return [{
      id: item.id,
      ref: item.ref,
      level: item.level,
      classes: Array.isArray(item.classes) ? (item.classes as string[]) : [],
      ...(castingTime ? { castingTime } : {}),
      ...(range ? { range } : {}),
      concentration: item.concentration === true,
      ritual: item.ritual === true,
      material: item.material === true,
    }];
  });
}

/**
 * `english`: the English names are needed (the dialogs search and show them). The sheet reads
 * only its own locale's catalog, which names every tier A entry; another locale's catalog
 * loads when `english` is set or when the own one has no names.
 *
 * `reference`: a reference view, the compendium or the reader is open, so the lazy names load
 * (creatures, magic items, tables, chapters; plan T2b §5.10) and links to them resolve. The sheet
 * mount leaves it off and stays on tier A and the pack cache.
 *
 * The enabled packs' overlays show over the built-in text they key (plan T2b §4); they never reach
 * a character row, and without the pack every view shows the SRD text. A ref that lost to a
 * same-name entry of a higher pack (B-025) resolves to the winner.
 */
export function useReferenceContext(
  system: LoadedSystem,
  packs: EffectivePacks | null = null,
  { english = false, reference = false }: { english?: boolean; reference?: boolean } = {},
): ReferenceContextValue {
  const locale = useLocale();
  const messages = useMessages();
  const t = useTranslations("reference");
  const tAbility = useTranslations("ability");
  const { getClientSystemMessages } = useSystemPluginUi();
  const ownEmpty = Object.keys((messagePath(messages, "ref") ?? {}) as object).length === 0;
  const lazy = useLazyNames(locale, reference, english || ownEmpty);

  return useMemo(() => {
    const pack = packs?.content ?? null;
    const aliases = packs?.aliases ?? {};
    const packText = pack ? new PackTextIndex(pack, locale) : null;
    const tierA = (messagePath(messages, "ref") ?? {}) as NamesCatalog;
    // Any locale but zh-TW already reads the English catalog.
    const ownIsEnglish = locale !== "zh-TW";
    const readEnglish = !ownIsEnglish && (english || Object.keys(tierA).length === 0);
    const builtinNames = withLazyNames(tierA, lazy?.own);
    const builtinEnglish = ownIsEnglish
      ? builtinNames
      : readEnglish
        ? withLazyNames((messagePath(getClientSystemMessages(DND_SYSTEM_ID, "en"), "ref") ?? {}) as NamesCatalog, lazy?.english)
        : {};
    const names = pack ? withPackNames(builtinNames, pack, locale) : builtinNames;
    const englishNames = pack ? withPackNames(builtinEnglish, pack, "en") : builtinEnglish;
    const resolveName = createRefResolver(Object.keys(tierA).length > 0 ? names : englishNames, pack?.entries);
    const resolveRef = (candidate: string) => resolveName(aliases[candidate] ?? candidate);
    const spellLevels = spellLevelsFrom(system.gameData?.spells);
    const srdSource = createBuiltinSource(spellLevels);
    const sources = new ReferenceSources([
      pack ? createBuiltinSource(spellLevels, pack.overlays) : srdSource,
      ...(pack ? [createPackSource(pack.entries, pack.zhTW, aliases)] : []),
    ]);
    const gameSpells = gameSpellsFrom(system.gameData?.spells);
    if (pack) {
      const hasMessage = (key: string) => typeof messagePath(messages, key) === "string";
      for (const spell of packSpells(pack, hasMessage)) if (!gameSpells.has(spell.id)) gameSpells.set(spell.id, spell);
    }
    const packRefs = new Set(pack?.entries.map((entry) => entry.ref) ?? []);
    const packSupplier = (ref: string) => packs?.supplier[aliases[ref] ?? ref];
    const abilityName = (value: string | undefined) => {
      const key = (value ?? "").toLowerCase().slice(0, 3);
      return ["str", "dex", "con", "int", "wis", "cha"].includes(key) ? tAbility(key) : value ?? "";
    };
    const label = (key: TagLabel, value: string | undefined) => {
      // Stat block labels live in the lazy reference catalog (the reference views resolve them); English here.
      if (!TIER_A_TAG_LABELS.has(key)) return undefined;
      if (key === "save") return t("tag.save", { ability: abilityName(value) });
      if (key === "recharge") return t("tag.recharge", { value: value ?? "6" });
      return t(`tag.${key}`);
    };
    const nameOf = (ref: string) => {
      const parsed = splitRef(aliases[ref] ?? ref);
      if (!parsed) return ref;
      return names[parsed.kind]?.[parsed.id] ?? englishNames[parsed.kind]?.[parsed.id] ?? parsed.id;
    };
    const token = (value: unknown) => {
      if (typeof value !== "string") return "";
      const match = /^\{\{i18n:(.+)\}\}$/.exec(value);
      if (!match) return value;
      const text = messagePath(messages, match[1]);
      return typeof text === "string" ? text : match[1].split(".").pop() ?? value;
    };
    const abilities = (list: string) => list.split("/").map((value) => abilityName(value)).join(" / ");
    return {
      locale,
      names,
      englishNames,
      sources,
      srdSource,
      resolveRef,
      nameOf,
      token,
      gameSpells,
      packRefs,
      packSupplier,
      packText,
      renderContext: {
        resolveRef,
        label,
        abilityDc: (name, list) => t("abilityDc", { name, abilities: abilities(list) }),
        abilityAttackMod: (name, list) => t("abilityAttackMod", { name, abilities: abilities(list) }),
      },
    };
  }, [english, getClientSystemMessages, lazy, locale, messages, packs, system.gameData, t, tAbility]);
}
