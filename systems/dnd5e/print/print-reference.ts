"use client";

import { useMemo } from "react";
import { useLocale, useMessages, useTranslations } from "next-intl";
import type { EntriesTextOptions } from "../reference/entries-to-text";
import { createBuiltinSource, spellLevelsFrom, type NamesCatalog, type ReferenceSource } from "../reference/sources";
import { splitRef, TIER_A_TAG_LABELS, type TagLabel } from "../reference/tags";
import { text } from "../sheet/play/play-model";
import type { GameSpell, ReferenceContextValue } from "../sheet/use-reference-context";

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
 * row takes its trait name, a known built-in ref takes the catalog name. The print keeps its own
 * copy because importing row-text into the print chunk splits the sheet's play chunk in two
 * (Turbopack can no longer merge row-text into it), which grows the sheet's first open.
 */
export function printName(naming: PrintNaming, row: Record<string, unknown>): string {
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
  return known ? naming.nameOf(ref) : saved || naming.nameOf(ref);
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
