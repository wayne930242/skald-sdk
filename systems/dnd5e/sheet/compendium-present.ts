/**
 * What the sheet already holds, for the compendium (UAT M6): a spell or a feature on the sheet shows
 * 已加入 and is not added again. Kept apart from `compendium-rows.ts` so the sheet adapter can
 * read it without the row builders.
 */

/** Lists where an entry is taken once. */
export const ONCE_LISTS: ReadonlySet<string> = new Set(["spells", "features"]);

/** Spell sources that are not a class: a background's or feat's spells, a species' spells. */
export const NOT_A_CLASS: ReadonlySet<string> = new Set(["magic-initiate", "species"]);

/**
 * A spell's presence key (F003): its ref and who casts it, so 聖焰 from Magic Initiate does not
 * block 聖焰 for the Cleric, and a spell two classes share is taken once per class. The caster is
 * the row's `castingClass` (`""` = the starting class), or `@<source>` for a background's, feat's
 * or species' spell with no class.
 */
export function spellKey(ref: string, castingClass: unknown, source?: unknown): string {
  const cls = typeof castingClass === "string" ? castingClass : "";
  const from = typeof source === "string" ? source : "";
  return `${ref}|${cls === "" && NOT_A_CLASS.has(from) ? `@${from}` : cls}`;
}

/** The presence key of a row on a once-only list: `spellKey` on 法術, the ref elsewhere. */
export function presenceKey(list: string, row: unknown): string | null {
  if (!row || typeof row !== "object") return null;
  const { ref, castingClass, source } = row as { ref?: unknown; castingClass?: unknown; source?: unknown };
  if (typeof ref !== "string" || !ref) return null;
  return list === "spells" ? spellKey(ref, castingClass, source) : ref;
}

/** The presence keys on each once-only list (`presenceKey`). */
export type PresentRefs = Readonly<Record<string, readonly string[]>>;

/** The presence keys on the sheet's once-only lists (`ONCE_LISTS`), for `CompendiumStart.present`. */
export function presentRefs(data: Record<string, unknown> | undefined): PresentRefs {
  const out: Record<string, string[]> = {};
  for (const list of ONCE_LISTS) {
    const value = data?.[list];
    out[list] = Array.isArray(value)
      ? value.flatMap((row) => {
          const key = presenceKey(list, row);
          return key ? [key] : [];
        })
      : [];
  }
  return out;
}
