/**
 * The system pack format, `skald/system-pack/v1`: one JSON file that carries a whole game system as
 * data (sheet structure and layout, formulas, DSL roll rules, game data, rules text and reference
 * entries) for an account to run at its own tables. The offline `system-pack build` command
 * compiles it from an authoring folder; `parseSystemPack` checks it, in the SDK and on the site.
 */
import type { Schema, Template } from "@skald/types/schema";
import type { DSLConfig, SystemMappings } from "@skald/types/system";
import type { SystemPackLimit } from "./limits";
import type { RuleNode } from "./rule-nodes";

export const SYSTEM_PACK_SCHEMA_ID = "skald/system-pack/v1";

/** The values the `systems.category` column accepts. */
export const SYSTEM_PACK_CATEGORIES = [
  "neo-classic",
  "classic",
  "osr",
  "pbta",
  "fate",
  "bitd",
  "year-zero",
  "d20",
  "storyteller",
  "other",
] as const;

export type SystemPackCategory = (typeof SYSTEM_PACK_CATEGORIES)[number];

/** The content language: one locale per pack. */
export const SYSTEM_PACK_LOCALES = ["zh-TW", "en"] as const;

export type SystemPackLocale = (typeof SYSTEM_PACK_LOCALES)[number];

/** The author's stable id for the pack: an upload with a known id updates that pack. */
export const SYSTEM_PACK_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** Section, collection and entry ids. */
export const SYSTEM_PACK_DOCUMENT_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;

/** `gameData` keys, as the sheet and the wizard name them. */
export const SYSTEM_PACK_GAME_DATA_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;

export const SYSTEM_PACK_FIELD_MIGRATION_SCHEMAS = ["skald/field-migration/v1", "skald/field-migration/v2"] as const;

export interface SystemPackManifest {
  packId: string;
  name: string;
  /** `major.minor.patch`. */
  version: string;
  description?: string;
  category: SystemPackCategory;
  locale: SystemPackLocale;
  /** Credits the author wants shown, plain text. */
  notice?: string;
  /** Only the generic renderer runs a pack; absent means generic. */
  sheetComponent?: "generic";
  /** The version of the tool that built the file; informational. */
  sdk?: string;
}

export interface SystemPackSystem {
  schema: Schema;
  template: Template;
  defaultData: Record<string, unknown>;
  mappings?: SystemMappings;
  dsl?: DSLConfig;
  /** `skald/wizard/v1` (ADR 0011). */
  wizard?: unknown;
  /** `skald/field-migration/v1` or `/v2`, for an update that renames fields. */
  fieldMigration?: unknown;
}

export interface SystemPackSection {
  id: string;
  parentId: string | null;
  title: string;
  blocks: RuleNode[];
}

export interface SystemPackEntry {
  id: string;
  name: string;
  tags?: string[];
  summary?: string;
  blocks: RuleNode[];
}

export interface SystemPackCollection {
  id: string;
  title: string;
  entries: SystemPackEntry[];
}

/** A file in the format, as it is hashed and stored. */
export interface SystemPack {
  schema: typeof SYSTEM_PACK_SCHEMA_ID;
  manifest: SystemPackManifest;
  system: SystemPackSystem;
  gameData?: Record<string, unknown>;
  rules?: { sections: SystemPackSection[] };
  entries?: { collections: SystemPackCollection[] };
  /** SHA-256 (hex) of the canonical JSON of every other key. */
  hash: string;
}

/** Stable reasons a pack is refused; the site maps each to its message. */
export const SYSTEM_PACK_ISSUE_CODES = [
  "not_json",
  "too_deep",
  "forbidden_key",
  "unknown_schema",
  "unknown_key",
  "invalid_value",
  "limit_exceeded",
  "hash_mismatch",
  "sheet_component_forbidden",
  "sheet_part_invalid",
  "game_icon_unknown",
  "css_url_forbidden",
  "css_import_forbidden",
  "css_escape_forbidden",
  "rule_node_unknown",
  "link_scheme_forbidden",
  "link_url_invalid",
  "link_dangling",
  "duplicate_id",
  "section_parent_missing",
  "section_cycle",
  "text_invalid",
  "default_image_forbidden",
] as const;

export type SystemPackIssueCode = (typeof SYSTEM_PACK_ISSUE_CODES)[number];

export type SystemPackIssuePath = (string | number)[];

export interface SystemPackIssue {
  code: SystemPackIssueCode;
  /** Where in the file, from its root. */
  path: SystemPackIssuePath;
  /** English, for the CLI and logs; the site shows its own text for `code`. */
  message: string;
  /** For `limit_exceeded`: which limit, its value and what the pack has. */
  limit?: SystemPackLimit;
  max?: number;
  actual?: number;
}

/** A path as a JSON Pointer, for messages. */
export function issuePointer(path: SystemPackIssuePath): string {
  return path.length === 0 ? "/" : path.map((segment) => `/${String(segment).replace(/~/g, "~0").replace(/\//g, "~1")}`).join("");
}
