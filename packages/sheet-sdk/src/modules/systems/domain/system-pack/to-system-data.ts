/**
 * A checked pack in the shapes the host already stores: the system's config and local data (as the
 * built-in importer takes them) and the rows of its rules text and reference entries.
 */
import type { SystemConfig } from "@skald/types/system";
import type { BuiltinLocalSystemData } from "../builtin-local-system-data";
import type { SystemPack, SystemPackCategory } from "./format";
import type { RuleNode } from "./rule-nodes";

/**
 * `SystemConfig` with the full category list of the `systems` table, which is wider than the
 * built-in systems' type. The file paths name the `system_files` types the parts are stored as.
 */
export interface SystemPackConfig extends Omit<SystemConfig, "category"> {
  category: SystemPackCategory;
  sheetComponent: "generic";
}

/** One stored document: a rules section, a reference collection, or one of its entries. */
export interface SystemPackDocument {
  kind: "section" | "collection" | "entry";
  /** Null for sections and collections; the collection id for entries. */
  collection: string | null;
  /** For entries: their collection's title. */
  collectionTitle: string | null;
  /** Section, collection or entry id; unique per kind and collection. */
  key: string;
  /** For sections: the parent section id. */
  parentKey: string | null;
  /** Order among the same kind (and, for entries, the same collection), from 0. */
  position: number;
  title: string;
  summary: string | null;
  tags: string[];
  /** Empty for collections. */
  blocks: RuleNode[];
}

export interface SystemPackSystemData {
  config: SystemPackConfig;
  data: BuiltinLocalSystemData;
  documents: SystemPackDocument[];
}

/**
 * Converts a pack that `parseSystemPack` accepted. `slug` is the system's slug on the host (the
 * server assigns it); it defaults to the pack id, for tools that run offline.
 */
export function toSystemData(pack: SystemPack, slug: string = pack.manifest.packId): SystemPackSystemData {
  const { manifest, system } = pack;
  const config: SystemPackConfig = {
    id: slug,
    name: manifest.name,
    version: manifest.version,
    category: manifest.category,
    ...(manifest.description === undefined ? {} : { description: manifest.description }),
    sheetComponent: "generic",
    schema: "schema",
    template: "template",
    defaultData: "default-data",
  };
  const data: BuiltinLocalSystemData = {
    schema: system.schema,
    template: system.template,
    defaultData: system.defaultData,
    ...(system.mappings === undefined ? {} : { mappings: system.mappings }),
    gameData: pack.gameData ?? {},
    ...(system.dsl === undefined ? {} : { dsl: system.dsl }),
    ...(system.fieldMigration === undefined ? {} : { fieldMigration: system.fieldMigration }),
    ...(system.wizard === undefined ? {} : { wizard: system.wizard }),
  };
  const documents: SystemPackDocument[] = [];
  (pack.rules?.sections ?? []).forEach((section, position) => {
    documents.push({
      kind: "section",
      collection: null,
      collectionTitle: null,
      key: section.id,
      parentKey: section.parentId,
      position,
      title: section.title,
      summary: null,
      tags: [],
      blocks: section.blocks,
    });
  });
  (pack.entries?.collections ?? []).forEach((collection, collectionPosition) => {
    documents.push({
      kind: "collection",
      collection: null,
      collectionTitle: null,
      key: collection.id,
      parentKey: null,
      position: collectionPosition,
      title: collection.title,
      summary: null,
      tags: [],
      blocks: [],
    });
    collection.entries.forEach((entry, position) => {
      documents.push({
        kind: "entry",
        collection: collection.id,
        collectionTitle: collection.title,
        key: entry.id,
        parentKey: null,
        position,
        title: entry.name,
        summary: entry.summary ?? null,
        tags: entry.tags ?? [],
        blocks: entry.blocks,
      });
    });
  });
  return { config, data, documents };
}
