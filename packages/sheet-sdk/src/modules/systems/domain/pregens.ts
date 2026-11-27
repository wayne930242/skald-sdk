import { z } from "zod";

/**
 * Sample characters a System ships (`system.json` `pregens`): an index of who they are, and one
 * sheet per character and locale. A sheet is `{ system, data }`, `data` a patch over the System's
 * default data, the same shape a scenario's NPC sheet has. Pure, so a system pack can carry them.
 */
export const PREGENS_SCHEMA = "skald/pregens/v1";

const localeSchema = z.string().regex(/^[a-z]{2}(?:-[A-Z]{2})?$/);
const idSchema = z.string().min(1).max(64).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const text = (max: number) => z.string().trim().min(1).max(max);
const localized = (max: number) =>
  z.record(localeSchema, text(max)).refine((value) => Object.keys(value).length > 0, "no locale");

/**
 * Where a System's pregen files come from (its plugin's lazy entry): the index, and the sheet of
 * `id` in `locale` (null, or a promise of null, for a locale it has no sheets in).
 */
export interface PregenFiles {
  index: () => Promise<unknown>;
  sheet: (locale: string, id: string) => Promise<unknown> | null;
}

/** A sheet laid over a System's default data: a pregen's, or a scenario NPC's. */
export const sheetPatchSchema = z.strictObject({
  system: idSchema,
  data: z.record(z.string(), z.json()),
});
export type SheetPatch = z.infer<typeof sheetPatchSchema>;

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/**
 * A sheet patch laid over default data: objects merge key by key, anything else (a list, a value)
 * replaces what was there. The same rule a scenario NPC's sheet follows when it joins a table.
 */
export function mergeSheetPatch(base: Readonly<Record<string, unknown>>, patch: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (key === "__proto__") continue;
    merged[key] = isObject(value) ? mergeSheetPatch(isObject(base[key]) ? base[key] : {}, value) : value;
  }
  return merged;
}

/** CC licences only: the list shows their names as they are, in every locale. */
const licenceSchema = z.string().regex(/^cc-by(?:-nc)?(?:-sa|-nd)?-(?:3\.0|4\.0)$/);

const pregenEntrySchema = z.strictObject({
  id: idSchema,
  group: idSchema,
  /** The name on the card and on the sheet (the book's code name). */
  label: localized(80),
  /** Short lines under the name: morph, background and career, … */
  lines: z.record(localeSchema, z.array(text(120)).max(4)),
  concept: localized(120),
  badges: z.array(idSchema).max(4).optional(),
  /** An opaque detail reference for the System's rules host, as a wizard pick item's `display.detail`. */
  detail: z.string().min(1).max(200).optional(),
  /** Locale → sheet file, relative to the index: `./<locale>/<id>.json`. */
  sheets: z.record(localeSchema, z.string().regex(/^\.\/[a-zA-Z-]+\/[a-z0-9-]+\.json$/)),
});

export const pregenIndexSchema = z
  .strictObject({
    $schema: z.literal(PREGENS_SCHEMA),
    /** The sheet used when a pregen has none in the viewer's locale. */
    defaultLocale: localeSchema,
    source: z.strictObject({
      title: localized(200),
      publisher: text(120),
      licence: licenceSchema,
    }),
    badges: z.record(idSchema, localized(40)).optional(),
    groups: z.array(z.strictObject({ id: idSchema, label: localized(80) })).min(1).max(20),
    pregens: z.array(pregenEntrySchema).min(1).max(100),
  })
  .superRefine((index, context) => {
    const groups = new Set(index.groups.map((group) => group.id));
    const seen = new Set<string>();
    index.pregens.forEach((pregen, at) => {
      const issue = (message: string) => context.addIssue({ code: "custom", path: ["pregens", at], message });
      if (seen.has(pregen.id)) issue(`duplicate id ${pregen.id}`);
      seen.add(pregen.id);
      if (!groups.has(pregen.group)) issue(`unknown group ${pregen.group}`);
      for (const badge of pregen.badges ?? []) if (!index.badges?.[badge]) issue(`unknown badge ${badge}`);
      if (!pregen.sheets[index.defaultLocale]) issue(`no ${index.defaultLocale} sheet`);
      for (const [locale, path] of Object.entries(pregen.sheets)) {
        if (path !== `./${locale}/${pregen.id}.json`) issue(`sheet path ${path}`);
      }
    });
  });
export type PregenIndex = z.infer<typeof pregenIndexSchema>;

/** One pregen as the list shows it, in one locale. */
export interface PregenCard {
  id: string;
  group: string;
  label: string;
  lines: string[];
  concept: string;
  badges: { id: string; label: string }[];
  detail?: string;
}

/** The list in one locale: its groups in order, the pregens, and the credit line's parts. */
export interface PregenList {
  groups: { id: string; label: string }[];
  pregens: PregenCard[];
  source: { title: string; publisher: string; licence: string };
}

function pick(value: Readonly<Record<string, string>>, locale: string, fallback: string): string {
  return value[locale] ?? value[fallback] ?? Object.values(value)[0] ?? "";
}

/** "cc-by-nc-sa-4.0" → "CC BY-NC-SA 4.0". */
export function creativeCommonsLabel(licence: string): string {
  const match = /^cc-(by(?:-nc)?(?:-sa|-nd)?)-(3\.0|4\.0)$/.exec(licence);
  return match ? `CC ${match[1].toUpperCase()} ${match[2]}` : licence;
}

/** The index in `locale`, falling back to the index's default locale text by text. */
export function localizePregenIndex(index: PregenIndex, locale: string): PregenList {
  const fallback = index.defaultLocale;
  return {
    groups: index.groups.map((group) => ({ id: group.id, label: pick(group.label, locale, fallback) })),
    pregens: index.pregens.map((pregen) => ({
      id: pregen.id,
      group: pregen.group,
      label: pick(pregen.label, locale, fallback),
      lines: pregen.lines[locale] ?? pregen.lines[fallback] ?? [],
      concept: pick(pregen.concept, locale, fallback),
      badges: (pregen.badges ?? []).map((id) => ({ id, label: pick(index.badges![id], locale, fallback) })),
      ...(pregen.detail ? { detail: pregen.detail } : {}),
    })),
    source: {
      title: pick(index.source.title, locale, fallback),
      publisher: index.source.publisher,
      licence: creativeCommonsLabel(index.source.licence),
    },
  };
}

/** The locale whose sheet a viewer in `locale` gets for `pregenId`; null for an unknown pregen. */
export function pregenSheetLocale(index: PregenIndex, pregenId: string, locale: string): string | null {
  const pregen = index.pregens.find((entry) => entry.id === pregenId);
  if (!pregen) return null;
  return pregen.sheets[locale] ? locale : index.defaultLocale;
}
