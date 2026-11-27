"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useMessages, useTranslations } from "next-intl";
import type { EntriesTextOptions } from "../reference/entries-to-text";
import { createBuiltinSource, spellLevelsFrom, type NamesCatalog, type ReferenceSource } from "../reference/sources";
import { splitRef, TIER_A_TAG_LABELS, type TagLabel } from "../reference/tags";
import { text } from "../sheet/play/play-model";
import type { GameSpell, ReferenceContextValue } from "../sheet/use-reference-context";
import { useHostPort } from "@skald/sheet-sdk/modules/systems/ui/host-ports";
import type { EffectivePacks } from "../content-pack/domain/types";
import { dndPackSourcePort } from "../sheet/pack-source-port";
import { useTablePackScope } from "../sheet/pack-scope";
import type { CastingOptions } from "../sheet/play/casting-classes";
import { sheetNamesFrom } from "../sheet/play/sheet-names";
import type { SnapshotLabels } from "../sheet/play/snapshot-labels";
import { withRowOption } from "../sheet/level-up/option-row";

/**
 * What the print reads of the reference: the SRD source, row names in the viewer's locale and a
 * spell's casting time and range. The sheet's names (tier A messages) and game data only, the
 * same values `useReferenceContext` gives the sheet without a pack; the print chunk leaves out the
 * pack overlays and name merging it does not use.
 */
export interface PrintReference {
  locale: string;
  srd: ReferenceSource;
  options: EntriesTextOptions;
  naming: PrintNaming;
  gameSpells: ReadonlyMap<string, GameSpell>;
}

/** What naming a row reads of the reference context. */
export type PrintNaming = Pick<ReferenceContextValue, "names" | "englishNames" | "nameOf" | "token">;

/**
 * A row's name in the viewer's locale, the play view's rule (`displayName` in row-text.ts; the
 * parity test pins them together): pack and custom rows keep the player's name, a species trait
 * row takes its trait name, a known built-in ref takes the catalog name (with a picked option,
 * `option-row.ts`). The print keeps its own
 * copy because importing row-text into the print chunk splits the sheet's play chunk in two
 * (Turbopack can no longer merge row-text into it), which grows the sheet's first open.
 */
export function printName(naming: PrintNaming, row: Record<string, unknown>, labels?: SnapshotLabels): string {
  const saved = text(row.name);
  const ref = text(row.ref);
  if (!ref) return saved;
  const origin = text(row.origin);
  if (origin === "pack" || origin === "custom") return saved || naming.nameOf(ref);
  const id = text(row.id);
  const fragment = id.startsWith(`${ref}#`) ? id.slice(ref.length + 1) : "";
  if (fragment) {
    const trait = naming.token(`{{i18n:wizard.trait.${fragment}}}`);
    return trait && trait !== fragment ? trait : saved;
  }
  const parsed = splitRef(ref);
  const known = parsed && (naming.names[parsed.kind]?.[parsed.id] ?? naming.englishNames[parsed.kind]?.[parsed.id]);
  return known ? withRowOption(naming.token, naming.nameOf(ref), row, labels) : saved || naming.nameOf(ref);
}

function messagePath(messages: unknown, path: string): unknown {
  let current = messages;
  for (const part of path.split(".")) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function gameSpellsFrom(value: unknown): Map<string, GameSpell> {
  const spells = new Map<string, GameSpell>();
  if (!Array.isArray(value)) return spells;
  for (const item of value) {
    if (item && typeof item === "object" && typeof item.id === "string" && typeof item.level === "number") spells.set(item.id, item as GameSpell);
  }
  return spells;
}

export function usePrintReference(gameData: Record<string, unknown> | undefined): PrintReference {
  const locale = useLocale();
  const messages = useMessages();
  const t = useTranslations("reference");
  const tAbility = useTranslations("ability");
  return useMemo(() => {
    const names = (messagePath(messages, "ref") ?? {}) as NamesCatalog;
    const nameOf = (ref: string) => {
      const parsed = splitRef(ref);
      return parsed ? names[parsed.kind]?.[parsed.id] ?? parsed.id : ref;
    };
    const token = (value: unknown) => {
      if (typeof value !== "string") return "";
      const match = /^\{\{i18n:(.+)\}\}$/.exec(value);
      if (!match) return value;
      const found = messagePath(messages, match[1]);
      return typeof found === "string" ? found : match[1].split(".").pop() ?? value;
    };
    const abilityName = (value: string | undefined) => {
      const key = (value ?? "").toLowerCase().slice(0, 3);
      return ["str", "dex", "con", "int", "wis", "cha"].includes(key) ? tAbility(key as never) : value ?? "";
    };
    const abilities = (list: string) => list.split("/").map((value) => abilityName(value)).join(" / ");
    const label = (key: TagLabel, value: string | undefined) => {
      if (!TIER_A_TAG_LABELS.has(key)) return undefined;
      if (key === "save") return t("tag.save", { ability: abilityName(value) });
      if (key === "recharge") return t("tag.recharge", { value: value ?? "6" });
      return t(`tag.${key}` as never);
    };
    return {
      locale,
      srd: createBuiltinSource(spellLevelsFrom(gameData?.spells)),
      options: {
        label,
        abilityDc: (name, list) => t("abilityDc", { name, abilities: abilities(list) }),
        abilityAttackMod: (name, list) => t("abilityAttackMod", { name, abilities: abilities(list) }),
      },
      // an English viewer reads the English catalog as its own, as the sheet does
      naming: { names, englishNames: locale === "zh-TW" ? {} : names, nameOf, token },
      gameSpells: gameSpellsFrom(gameData?.spells),
    };
  }, [gameData, locale, messages, t, tAbility]);
}

/**
 * This device's enabled packs from its cache (no network), read once for the print: their class,
 * subclass, species and background names and their subclass entries (a homebrew third caster).
 * `settled` once read, or at once without the host's pack source. A table copy whose setup takes the
 * GM's homebrew reads the table's shared copies with them (its sheet's scope), so a shared class
 * prints its casting.
 */
export function usePrintPacks(): { packs: EffectivePacks | null; settled: boolean } {
  const source = useHostPort(dndPackSourcePort);
  const tableId = useTablePackScope()?.tableId;
  const [state, setState] = useState<{ packs: EffectivePacks | null; settled: boolean }>({ packs: null, settled: false });
  useEffect(() => {
    if (!source) return;
    let live = true;
    (tableId === undefined ? source.readCached() : source.readCached({ tableId })).then(
      (packs) => live && setState({ packs, settled: true }),
      () => live && setState({ packs: null, settled: true }),
    );
    return () => {
      live = false;
    };
  }, [source, tableId]);
  return source ? state : { packs: null, settled: true };
}

const NAMED_KINDS = ["class", "subclass", "species", "background"] as const;

/**
 * The print model's names and casting (UAT M10, item 1): the built-in catalog in the viewer's
 * locale, then the packs' names for what it does not name, and the packs' subclass entries.
 */
export function printCasting(naming: PrintNaming, packs: EffectivePacks | null, locale: string): CastingOptions {
  const zh = locale.toLowerCase().startsWith("zh");
  const catalog: Record<string, Record<string, string>> = {};
  for (const kind of NAMED_KINDS) catalog[kind] = { ...(naming.names[kind] ?? {}) };
  const content = packs?.content;
  for (const entry of content?.entries ?? []) {
    const own = catalog[entry.kind as (typeof NAMED_KINDS)[number]];
    if (!own || own[entry.id] !== undefined) continue;
    own[entry.id] = (zh ? content?.zhTW[entry.ref]?.name : undefined) ?? entry.name;
  }
  const meta = new Map((content?.entries ?? []).filter((entry) => entry.kind === "subclass").map((entry) => [entry.id, entry.meta]));
  return { names: sheetNamesFrom(catalog), subclassMeta: (id) => meta.get(id) };
}
