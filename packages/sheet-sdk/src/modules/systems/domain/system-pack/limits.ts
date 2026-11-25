/**
 * The limits a `skald/system-pack/v1` file must stay within, in one place: the validator reads them
 * here, and the database migration mirrors them (a parity fixture generated from this object pins
 * both sides).
 *
 * Bytes are the UTF-8 length of the value's Postgres `jsonb` text (`jsonBytes` in parse.ts): compact
 * JSON with a space after every `:` and `,`, numbers in plain decimal. The database measures
 * `octet_length(content::text)`, the same number, so a pack this validator accepts is never refused
 * there for its size. Lengths are UTF-16 code units, never fewer than the database's characters.
 */
export const SYSTEM_PACK_LIMITS = {
  /** The whole file, the largest tier quota (patron, 50 MiB); the upload route applies the caller's own. */
  maxPackBytes: 52_428_800,
  /** JSON nesting: the root object is depth 1. */
  maxDepth: 64,
  /** Bytes of `manifest`. */
  maxManifestBytes: 32_768,
  maxNameLength: 120,
  /** `major.minor.patch`. */
  maxVersionLength: 50,
  /** Length of `manifest.sdk`. */
  maxSdkLength: 64,
  maxDescriptionLength: 2_000,
  maxNoticeLength: 20_000,
  /** Bytes of `system` (schema, template, default data, mappings, DSL, wizard, field migration): the template source. */
  maxSystemBytes: 2_097_152,
  maxGameDataKeys: 200,
  /** Bytes of one `gameData` value. */
  maxGameDataValueBytes: 4_194_304,
  maxSections: 5_000,
  /** Bytes of one section's `blocks`. */
  maxSectionBytes: 524_288,
  maxCollections: 100,
  /** Entries over all collections. */
  maxEntries: 20_000,
  /** Bytes of one entry (name, tags, summary and blocks). */
  maxEntryBytes: 65_536,
  maxTitleLength: 200,
  maxSummaryLength: 1_000,
  maxTags: 20,
  maxTagLength: 50,
  /** Length of an `external` link's URL. */
  maxUrlLength: 2_048,
} as const;

export type SystemPackLimit = keyof typeof SYSTEM_PACK_LIMITS;
