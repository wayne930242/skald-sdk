/**
 * The envelope of a `skald/system-pack/v1` file as a zod schema: strict objects (an unknown key is
 * an issue), ids and patterns. Rule nodes, limits and cross-references are checked by parse.ts.
 */
import { z } from "zod";
import {
  SYSTEM_PACK_CATEGORIES,
  SYSTEM_PACK_DOCUMENT_ID_PATTERN,
  SYSTEM_PACK_GAME_DATA_KEY_PATTERN,
  SYSTEM_PACK_ID_PATTERN,
  SYSTEM_PACK_LOCALES,
  SYSTEM_PACK_SCHEMA_ID,
} from "./format";

const record = z.record(z.string(), z.unknown());
const documentId = z.string().regex(SYSTEM_PACK_DOCUMENT_ID_PATTERN, "Expected a lowercase id: a-z, 0-9, - and _, up to 64 characters.");
const blocks = z.array(z.unknown());
/** Not blank; never trimmed, so the parsed value stays the hashed one. */
const text = z.string().regex(/\S/, "Expected text that is not blank.");

export const envelopeSchema = z.strictObject({
  schema: z.literal(SYSTEM_PACK_SCHEMA_ID),
  manifest: z.strictObject({
    packId: z.string().regex(SYSTEM_PACK_ID_PATTERN, "Expected a lowercase id: a-z, 0-9 and -, up to 64 characters."),
    name: text,
    version: z.string().regex(/^\d+\.\d+\.\d+$/, "Expected major.minor.patch."),
    description: z.string().optional(),
    category: z.enum(SYSTEM_PACK_CATEGORIES),
    locale: z.enum(SYSTEM_PACK_LOCALES),
    notice: z.string().optional(),
    sheetComponent: z.string().optional(),
    sdk: z.string().optional(),
  }),
  system: z.strictObject({
    schema: record,
    template: record,
    defaultData: record,
    // Values are checked by parse.ts, so a huge map of wrong values yields a capped issue list.
    mappings: z.strictObject({ eraMappings: record, categoryMappings: record }).optional(),
    dsl: z
      .strictObject({
        lookupTables: record.optional(),
        rollRules: record.optional(),
        aliases: record.optional(),
        rollMacros: record.optional(),
      })
      .optional(),
    wizard: record.optional(),
    fieldMigration: record.optional(),
  }),
  gameData: z
    .record(z.string().regex(SYSTEM_PACK_GAME_DATA_KEY_PATTERN, "Expected a key of letters, digits, - and _, up to 64 characters."), z.unknown())
    .optional(),
  // Items are parsed one by one (`sectionSchema` and the rest below), so the issue list can stop
  // at its cap instead of zod building one issue per bad field of every item first.
  rules: z.strictObject({ sections: z.array(z.unknown()) }).optional(),
  entries: z.strictObject({ collections: z.array(z.unknown()) }).optional(),
  hash: z.string().regex(/^[0-9a-f]{64}$/, "Expected a lowercase SHA-256 hex digest."),
});

export const sectionSchema = z.strictObject({
  id: documentId,
  parentId: documentId.nullable(),
  title: text,
  blocks,
});

/** A collection without its entries, which are parsed one by one. */
export const collectionSchema = z.strictObject({
  id: documentId,
  title: text,
  entries: z.array(z.unknown()),
});

export const entrySchema = z.strictObject({
  id: documentId,
  name: text,
  tags: z.array(text).optional(),
  summary: z.string().optional(),
  blocks,
});

export type SystemPackEnvelope = z.infer<typeof envelopeSchema>;
export type SystemPackSectionItem = z.infer<typeof sectionSchema>;
export type SystemPackEntryItem = z.infer<typeof entrySchema>;
export interface SystemPackCollectionItem extends Omit<z.infer<typeof collectionSchema>, "entries"> {
  entries: SystemPackEntryItem[];
}
