/**
 * The read-back check of an entry stored as several rows (a class or a subclass with its features).
 * A stored row reads back when one regeneration of its form gives its entry and zh-TW layer again
 * exactly (canonical JSON), generated parts included: a progression table, label or link list changed
 * by hand (advanced JSON, an import) keeps the entry read-only, so a save cannot overwrite it.
 *
 * The editors regenerate twice: with the current wording, and with the generated wording v4.152.0
 * wrote (`LegacyWording` from the catalogs, names filled in unspaced, empty subclass slots as 0). An
 * entry saved by that release still opens as a form, and its next save rewrites the generated text.
 */
import { canonicalJson } from "../../content-pack/domain/canonical-json";
import type { HomebrewPayload } from "./types";

type Row = { key: string; payload: HomebrewPayload };
type Localized = { en: string; zh: string };

/** The generated wording of v4.152.0 that differs from today's: label templates and ability names. */
export interface LegacyWording<L> {
  labels: { en: Partial<L>; zh: Partial<L> };
  abilityNames: Readonly<Record<string, Localized>>;
}

/** What a generator context carries for the v4.152.0 regeneration. */
export interface LegacyAware<L> {
  labels: { en: L; zh: L };
  abilityNames: Readonly<Record<string, Localized>>;
  /** The v4.152.0 wording (`…generatedLegacy` catalogs); absent: only the generation rules differ. */
  legacy?: LegacyWording<L>;
  /** Generate as v4.152.0 did: names filled in without CJK spacing, empty subclass slots as 0. */
  legacyText?: boolean;
}

/** The context that regenerates an entry with the v4.152.0 wording. */
export function legacyContext<L, C extends LegacyAware<L>>(ctx: C): C {
  const w = ctx.legacy;
  return {
    ...ctx,
    legacyText: true,
    labels: { en: { ...ctx.labels.en, ...w?.labels.en }, zh: { ...ctx.labels.zh, ...w?.labels.zh } },
    abilityNames: { ...ctx.abilityNames, ...w?.abilityNames },
  };
}

const comparable = (payload: HomebrewPayload | undefined) => canonicalJson({ entry: payload?.entry, zhTW: payload?.zhTW });

/**
 * Whether the regenerations in `variants` (each main row first, rows in the same order) give back the
 * `stored` main row and the `features` by key: each stored row equal to that row of some variant.
 */
export function readsBack(variants: ReadonlyArray<readonly Row[]>, stored: HomebrewPayload, features: readonly Row[]): boolean {
  const [first] = variants;
  if (!first || first.length !== features.length + 1) return false;
  const old = new Map(features.map((r) => [r.key, r.payload]));
  return first.every((row, i) => {
    const target = comparable(i ? old.get(row.key) : stored);
    return (i ? old.has(row.key) : true) && variants.some((rows) => rows[i]?.key === row.key && comparable(rows[i].payload) === target);
  });
}
