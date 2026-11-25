/**
 * `parseSystemPack`: the one check of a `skald/system-pack/v1` file, run by the SDK's `check`
 * command and by the site before anything is stored. It is pure (no Supabase, no environment) and
 * refuses rather than repairs: a file with any issue yields no pack.
 *
 * The input is untrusted, so every step is linear in its size and the issue list is capped: the
 * file size and nesting are checked before parsing, counts before any per-item work, and a walk
 * stops once the list is full.
 *
 * What it cannot run lives on the site: the template validation service (formulas, scoped CSS
 * compile, macros, the wizard against the pack's own game data), the character trial of ADR 0003,
 * entitlement and quota.
 */
import type { z } from "zod";
import {
  collectionSchema,
  entrySchema,
  envelopeSchema,
  sectionSchema,
  type SystemPackCollectionItem,
  type SystemPackEnvelope,
  type SystemPackEntryItem,
  type SystemPackSectionItem,
} from "./envelope";
import {
  SYSTEM_PACK_FIELD_MIGRATION_SCHEMAS,
  SYSTEM_PACK_SCHEMA_ID,
  type SystemPack,
  type SystemPackIssue,
  type SystemPackIssuePath,
} from "./format";
import { systemPackHash } from "./hash";
import { SYSTEM_PACK_LIMITS, type SystemPackLimit } from "./limits";
import { checkRuleBlocks, entryLinkTarget, type RuleBlocksContext } from "./rule-nodes";
import { checkSheetPart, type SheetPartName } from "./sheet-parts";

export interface SystemPackParseOptions {
  /**
   * The Game-Icons names that exist (`data/game-icons/icons.json`); a `game:<name>` icon must be one
   * of them. Omitted, icon names are not checked.
   */
  gameIconNames?: ReadonlySet<string>;
}

export interface SystemPackParseResult {
  /** The pack, when there is no issue. */
  pack: SystemPack | null;
  issues: SystemPackIssue[];
}

/** More issues than this are not listed; the first ones are enough to fix the file. */
export const MAX_SYSTEM_PACK_ISSUES = 200;

const GAME_ICON_PREFIX = "game:";

class Issues {
  readonly list: SystemPackIssue[] = [];
  get full(): boolean {
    return this.list.length >= MAX_SYSTEM_PACK_ISSUES;
  }
  push(issue: SystemPackIssue): void {
    if (!this.full) this.list.push(issue);
  }
  /** Records the limit when `actual` is over it; returns whether it was. */
  limit(limit: SystemPackLimit, actual: number, path: SystemPackIssuePath, what: string): boolean {
    const max = SYSTEM_PACK_LIMITS[limit];
    if (actual <= max) return false;
    this.push({ code: "limit_exceeded", path, message: `${what}: ${actual} > ${max} (${limit}).`, limit, max, actual });
    return true;
  }
}

/** UTF-8 length of `text`, without encoding it. */
export function utf8Length(text: string): number {
  let bytes = 0;
  for (let index = 0; index < text.length; index += 1) {
    const unit = text.charCodeAt(index);
    if (unit < 0x80) bytes += 1;
    else if (unit < 0x800) bytes += 2;
    else if (unit >= 0xd800 && unit <= 0xdbff && index + 1 < text.length) {
      const next = text.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        index += 1;
      } else bytes += 3;
    } else bytes += 3;
  }
  return bytes;
}

/**
 * Bytes of a JSON number as Postgres prints it: `numeric` never uses an exponent, so `1e+21`
 * prints as 22 digits and `1.5e-7` as `0.00000015`.
 */
function numberBytes(value: number): number {
  const text = JSON.stringify(value);
  const at = text.indexOf("e");
  if (at === -1) return text.length;
  const sign = text.startsWith("-") ? 1 : 0;
  const mantissa = text.slice(sign, at);
  const exponent = Number(text.slice(at + 1));
  const point = mantissa.indexOf(".");
  const digits = point === -1 ? mantissa.length : mantissa.length - 1;
  const fraction = point === -1 ? 0 : mantissa.length - point - 1;
  if (exponent >= fraction) return sign + digits + exponent - fraction;
  if (exponent >= 0) return sign + digits + 1;
  return sign + 2 + (-exponent - 1) + digits;
}

/**
 * Bytes of `value` as the database stores and measures it: the UTF-8 length of its `jsonb` text,
 * which is compact JSON with a space after every `:` and `,` and numbers in plain decimal. Every
 * byte limit uses this measure, on both sides, so the site never refuses what the SDK accepts.
 */
export function jsonBytes(value: unknown): number {
  if (value === null) return 4;
  switch (typeof value) {
    case "string":
      return utf8Length(JSON.stringify(value));
    case "number":
      return Number.isFinite(value) ? numberBytes(value) : 4;
    case "boolean":
      return value ? 4 : 5;
    case "object":
      break;
    default:
      return 0;
  }
  if (Array.isArray(value)) {
    let bytes = 2;
    value.forEach((item, index) => {
      bytes += (index > 0 ? 2 : 0) + (item === undefined || typeof item === "function" ? 4 : jsonBytes(item));
    });
    return bytes;
  }
  let bytes = 2;
  let first = true;
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (item === undefined || typeof item === "function") continue;
    bytes += (first ? 0 : 2) + utf8Length(JSON.stringify(key)) + 2 + jsonBytes(item);
    first = false;
  }
  return bytes;
}

/**
 * Bytes of one reference entry: its name, summary, tags and blocks, as the database counts the
 * stored entry (`system_pack_documents.bytes`). The id is the row's key and is not counted.
 */
export function entryBytes(entry: { name: string; summary?: string; tags?: string[]; blocks: unknown[] }): number {
  return utf8Length(entry.name) + utf8Length(entry.summary ?? "") + jsonBytes(entry.tags ?? []) + jsonBytes(entry.blocks);
}

/** Whether `text` has U+0000 or an unpaired surrogate: valid in JSON text, refused by the database's `jsonb`. */
function hasForbiddenText(text: string): boolean {
  for (let index = 0; index < text.length; index += 1) {
    const unit = text.charCodeAt(index);
    if (unit === 0) return true;
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = text.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) return true;
  }
  return false;
}

/** Whether `text`'s arrays and objects nest deeper than `max`, scanned before parsing. */
function textDepthExceeds(text: string, max: number): boolean {
  let depth = 0;
  let inString = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text.charCodeAt(index);
    if (inString) {
      if (char === 0x5c) index += 1;
      else if (char === 0x22) inString = false;
    } else if (char === 0x22) inString = true;
    else if (char === 0x7b || char === 0x5b) {
      depth += 1;
      if (depth > max) return true;
    } else if (char === 0x7d || char === 0x5d) depth -= 1;
  }
  return false;
}

/**
 * Depth, `__proto__` keys and text the database cannot store, over the parsed value. Stops
 * descending past the depth limit.
 */
function checkJsonTree(value: unknown, issues: Issues): void {
  const max = SYSTEM_PACK_LIMITS.maxDepth;
  const path: SystemPackIssuePath = [];
  let tooDeep = false;
  const checkText = (text: string) => {
    if (hasForbiddenText(text)) {
      issues.push({ code: "text_invalid", path: [...path], message: "Text may not contain U+0000 or an unpaired surrogate." });
    }
  };
  const visit = (node: unknown, depth: number) => {
    if (typeof node === "string") checkText(node);
    if (typeof node !== "object" || node === null || tooDeep || issues.full) return;
    if (depth > max) {
      tooDeep = true;
      issues.push({ code: "too_deep", path: [...path], message: `JSON nesting is deeper than ${max}.`, limit: "maxDepth", max });
      return;
    }
    if (Array.isArray(node)) {
      for (let index = 0; index < node.length; index += 1) {
        path.push(index);
        visit(node[index], depth + 1);
        path.pop();
      }
      return;
    }
    for (const key of Object.keys(node)) {
      path.push(key);
      checkText(key);
      if (key === "__proto__") {
        issues.push({ code: "forbidden_key", path: [...path], message: 'The key "__proto__" is not allowed.' });
      } else {
        visit((node as Record<string, unknown>)[key], depth + 1);
      }
      path.pop();
    }
  };
  visit(value, 1);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function arrayAt(value: unknown, key: string): unknown[] {
  const child = isRecord(value) ? value[key] : undefined;
  return Array.isArray(child) ? child : [];
}

/**
 * Sizes that bound all later work, read from the raw value before the envelope is parsed: the
 * system's bytes and every count. An over-limit pack is refused here, before any per-item check.
 */
function checkBounds(value: Record<string, unknown>, issues: Issues): void {
  if (value.system !== undefined) issues.limit("maxSystemBytes", jsonBytes(value.system), ["system"], "system bytes");
  if (isRecord(value.gameData)) issues.limit("maxGameDataKeys", Object.keys(value.gameData).length, ["gameData"], "game data keys");
  issues.limit("maxSections", arrayAt(value.rules, "sections").length, ["rules", "sections"], "sections");
  const collections = arrayAt(value.entries, "collections");
  issues.limit("maxCollections", collections.length, ["entries", "collections"], "collections");
  let entries = 0;
  for (const collection of collections) entries += arrayAt(collection, "entries").length;
  issues.limit("maxEntries", entries, ["entries", "collections"], "entries");
  if (entries > SYSTEM_PACK_LIMITS.maxEntries || collections.length > SYSTEM_PACK_LIMITS.maxCollections) return;
  collections.forEach((collection, collectionIndex) => {
    arrayAt(collection, "entries").forEach((entry, entryIndex) => {
      const tags = arrayAt(entry, "tags");
      issues.limit("maxTags", tags.length, ["entries", "collections", collectionIndex, "entries", entryIndex, "tags"], "tags");
    });
  });
}

function envelopeIssues(error: z.ZodError, issues: Issues, prefix: SystemPackIssuePath = []): void {
  for (const issue of error.issues) {
    if (issues.full) return;
    const path = [...prefix, ...issue.path.map((segment) => (typeof segment === "number" ? segment : String(segment)))];
    if (issue.code === "unrecognized_keys") {
      for (const key of issue.keys) issues.push({ code: "unknown_key", path: [...path, key], message: `Unknown key "${key.slice(0, 64)}".` });
    } else {
      issues.push({ code: "invalid_value", path, message: issue.message });
    }
  }
}

/** CSS without its comments, in one pass; an unterminated comment runs to the end. */
export function stripCssComments(css: string): string {
  let out = "";
  let from = 0;
  for (;;) {
    const open = css.indexOf("/*", from);
    if (open === -1) return out + css.slice(from);
    out += css.slice(from, open);
    const close = css.indexOf("*/", open + 2);
    if (close === -1) return out;
    from = close + 2;
  }
}

/** `url()`, `@import` and other ways CSS can fetch a resource, and escapes that could hide them. */
function checkCss(css: string, path: SystemPackIssuePath, issues: Issues): void {
  if (css.includes("\\")) {
    issues.push({ code: "css_escape_forbidden", path, message: "CSS escape sequences are not allowed." });
  }
  const normalized = stripCssComments(css).toLowerCase();
  if (/(?:^|[^a-z0-9_-])(?:u\s*r\s*l|image-set|-webkit-image-set|image|src)\s*\(/.test(normalized)) {
    issues.push({ code: "css_url_forbidden", path, message: "url() and other resource references are not allowed in template CSS." });
  }
  if (/@\s*(?:import|font-face|namespace)\b/.test(normalized)) {
    issues.push({ code: "css_import_forbidden", path, message: "@import, @font-face and @namespace are not allowed in template CSS." });
  }
}

/** Every `icon: "game:<name>"` under `value`; one path stack, copied only into an issue. */
function checkGameIcons(root: unknown, rootPath: SystemPackIssuePath, names: ReadonlySet<string>, issues: Issues): void {
  const path = [...rootPath];
  const visit = (value: unknown) => {
    if (issues.full) return;
    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index += 1) {
        path.push(index);
        visit(value[index]);
        path.pop();
      }
      return;
    }
    if (!isRecord(value)) return;
    for (const [key, child] of Object.entries(value)) {
      path.push(key);
      if (key === "icon" && typeof child === "string" && child.startsWith(GAME_ICON_PREFIX)) {
        const name = child.slice(GAME_ICON_PREFIX.length);
        if (!names.has(name)) {
          issues.push({ code: "game_icon_unknown", path: [...path], message: `No Game-Icons icon is named "${name.slice(0, 64)}".` });
        }
      } else visit(child);
      path.pop();
    }
  };
  visit(root);
}

function checkManifest(manifest: SystemPackEnvelope["manifest"], issues: Issues): void {
  issues.limit("maxManifestBytes", jsonBytes(manifest), ["manifest"], "manifest bytes");
  issues.limit("maxNameLength", manifest.name.length, ["manifest", "name"], "name length");
  issues.limit("maxVersionLength", manifest.version.length, ["manifest", "version"], "version length");
  if (manifest.sdk !== undefined) issues.limit("maxSdkLength", manifest.sdk.length, ["manifest", "sdk"], "sdk length");
  if (manifest.description !== undefined) {
    issues.limit("maxDescriptionLength", manifest.description.length, ["manifest", "description"], "description length");
  }
  if (manifest.notice !== undefined) {
    issues.limit("maxNoticeLength", manifest.notice.length, ["manifest", "notice"], "notice length");
  }
  if (manifest.sheetComponent !== undefined && manifest.sheetComponent !== "generic") {
    issues.push({
      code: "sheet_component_forbidden",
      path: ["manifest", "sheetComponent"],
      message: `A system pack runs on the generic sheet renderer; sheetComponent "${manifest.sheetComponent.slice(0, 64)}" is not allowed.`,
    });
  }
}

async function checkSystem(system: SystemPackEnvelope["system"], options: SystemPackParseOptions, issues: Issues): Promise<void> {
  if (system.mappings) {
    for (const map of ["eraMappings", "categoryMappings"] as const) {
      for (const [key, value] of Object.entries(system.mappings[map])) {
        if (issues.full) return;
        if (typeof value !== "string") {
          issues.push({ code: "invalid_value", path: ["system", "mappings", map, key], message: "Expected a string." });
        }
      }
    }
  }
  const parts: [SheetPartName, unknown, SystemPackIssuePath][] = [
    ["schema", system.schema, ["system", "schema"]],
    ["template", system.template, ["system", "template"]],
  ];
  const dsl = system.dsl ?? {};
  for (const name of ["lookupTables", "rollRules", "aliases", "rollMacros"] as const) {
    if (dsl[name] !== undefined) parts.push([name, dsl[name], ["system", "dsl", name]]);
  }
  if (system.wizard !== undefined) parts.push(["wizard", system.wizard, ["system", "wizard"]]);
  for (const [name, value, path] of parts) {
    for (const issue of await checkSheetPart(name, value, path, jsonBytes(value))) issues.push(issue);
  }
  if (system.fieldMigration !== undefined) {
    const schema = system.fieldMigration.$schema;
    if (typeof schema !== "string" || !(SYSTEM_PACK_FIELD_MIGRATION_SCHEMAS as readonly string[]).includes(schema)) {
      issues.push({
        code: "invalid_value",
        path: ["system", "fieldMigration", "$schema"],
        message: `Expected ${SYSTEM_PACK_FIELD_MIGRATION_SCHEMAS.join(" or ")}.`,
      });
    }
  }
  const styles = system.template.scopedStyles;
  if (isRecord(styles)) {
    if (typeof styles.css === "string") checkCss(styles.css, ["system", "template", "scopedStyles", "css"], issues);
    if (isRecord(styles.variables)) {
      for (const [name, value] of Object.entries(styles.variables)) {
        if (typeof value === "string") checkCss(value, ["system", "template", "scopedStyles", "variables", name], issues);
      }
    }
  }
  checkDefaultImages(system.schema, system.defaultData, issues);
  if (options.gameIconNames) {
    checkGameIcons(system.schema, ["system", "schema"], options.gameIconNames, issues);
    checkGameIcons(system.template, ["system", "template"], options.gameIconNames, issues);
  }
}

/** The ids of every image field in the schema, list row fields included. */
function imageFieldIds(schema: unknown): Set<string> {
  const ids = new Set<string>();
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (!isRecord(value)) return;
    if (value.type === "image" && typeof value.id === "string") ids.add(value.id);
    for (const child of Object.values(value)) visit(child);
  };
  visit(isRecord(schema) ? schema.fields : undefined);
  return ids;
}

/**
 * Top-level keys of a card's data the site shows as a picture whatever the schema says: the
 * table's character list and the chat avatar read `data.portrait`.
 */
const PICTURE_DATA_KEYS: ReadonlySet<string> = new Set(["portrait"]);

/**
 * A pack carries no images (phase 1): an image field's default value, at the top level or in a
 * default list row, and the default value of a picture key must be empty, so a new card never
 * shows a picture from another site.
 */
function checkDefaultImages(schema: unknown, defaultData: Record<string, unknown>, issues: Issues): void {
  const ids = imageFieldIds(schema);
  const path: SystemPackIssuePath = ["system", "defaultData"];
  const isPicture = (key: string) => ids.has(key) || (path.length === 3 && PICTURE_DATA_KEYS.has(key));
  const visit = (value: unknown) => {
    if (issues.full) return;
    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index += 1) {
        path.push(index);
        visit(value[index]);
        path.pop();
      }
      return;
    }
    if (!isRecord(value)) return;
    for (const [key, child] of Object.entries(value)) {
      path.push(key);
      if (isPicture(key) && child !== null && child !== "") {
        issues.push({
          code: "default_image_forbidden",
          path: [...path],
          message: ids.has(key)
            ? `The default value of image field "${key.slice(0, 64)}" must be empty: a pack carries no images.`
            : `The default value of "${key}" must be empty: the site shows it as the card's picture, and a pack carries no images.`,
        });
      } else visit(child);
      path.pop();
    }
  };
  visit(defaultData);
}

function checkGameData(gameData: Record<string, unknown> | undefined, issues: Issues): void {
  for (const [key, value] of Object.entries(gameData ?? {})) {
    issues.limit("maxGameDataValueBytes", jsonBytes(value), ["gameData", key], `game data "${key}" bytes`);
  }
}

type Sections = SystemPackSectionItem[];
type Collections = SystemPackCollectionItem[];

/**
 * Parses each item with its strict schema, one at a time, and stops once the issue list is full;
 * null when any item was refused.
 */
function parseItems<T>(
  items: readonly unknown[],
  schema: { safeParse(value: unknown): { success: true; data: T } | { success: false; error: z.ZodError } },
  prefix: SystemPackIssuePath,
  issues: Issues,
): T[] | null {
  const parsed: T[] = [];
  let refused = false;
  for (let index = 0; index < items.length && !issues.full; index += 1) {
    const result = schema.safeParse(items[index]);
    if (result.success) parsed.push(result.data);
    else {
      refused = true;
      envelopeIssues(result.error, issues, [...prefix, index]);
    }
  }
  return refused || issues.full ? null : parsed;
}

function parseDocuments(envelope: SystemPackEnvelope, issues: Issues): { sections: Sections; collections: Collections } | null {
  const sections = parseItems(envelope.rules?.sections ?? [], sectionSchema, ["rules", "sections"], issues);
  const headers = parseItems(envelope.entries?.collections ?? [], collectionSchema, ["entries", "collections"], issues);
  if (!sections || !headers) return null;
  const collections: Collections = [];
  for (const [index, header] of headers.entries()) {
    const entries = parseItems<SystemPackEntryItem>(header.entries, entrySchema, ["entries", "collections", index, "entries"], issues);
    if (!entries) return null;
    collections.push({ ...header, entries });
  }
  return { sections, collections };
}

/** Ids, duplicates, parents and cycles of the section tree, in O(n). */
function checkSectionTree(sections: Sections, issues: Issues): Set<string> {
  const ids = new Set<string>();
  const indexOf = new Map<string, number>();
  const parentOf = new Map<string, string | null>();
  sections.forEach((section, index) => {
    if (ids.has(section.id)) {
      issues.push({ code: "duplicate_id", path: ["rules", "sections", index, "id"], message: `Section id "${section.id}" is used twice.` });
      return;
    }
    ids.add(section.id);
    indexOf.set(section.id, index);
    parentOf.set(section.id, section.parentId);
  });
  sections.forEach((section, index) => {
    if (section.parentId !== null && !ids.has(section.parentId)) {
      issues.push({
        code: "section_parent_missing",
        path: ["rules", "sections", index, "parentId"],
        message: `No section has the id "${section.parentId}".`,
      });
    }
  });
  // Walk up from each section once: 1 = on the current walk, 2 = known to reach a root or a cycle.
  const state = new Map<string, 1 | 2>();
  for (const start of indexOf.keys()) {
    const chain: string[] = [];
    let current: string | null = start;
    while (current !== null && ids.has(current) && !state.has(current)) {
      state.set(current, 1);
      chain.push(current);
      current = parentOf.get(current) ?? null;
    }
    if (current !== null && state.get(current) === 1) {
      for (const id of chain.slice(chain.indexOf(current))) {
        issues.push({
          code: "section_cycle",
          path: ["rules", "sections", indexOf.get(id)!, "parentId"],
          message: `Section "${id}" is its own ancestor.`,
        });
      }
    }
    for (const id of chain) state.set(id, 2);
  }
  return ids;
}

/** Entry link targets, and duplicate collection and entry ids. */
function checkEntryIds(collections: Collections, issues: Issues): Set<string> {
  const collectionIds = new Set<string>();
  const targets = new Set<string>();
  collections.forEach((collection, collectionIndex) => {
    const path = ["entries", "collections", collectionIndex];
    if (collectionIds.has(collection.id)) {
      issues.push({ code: "duplicate_id", path: [...path, "id"], message: `Collection id "${collection.id}" is used twice.` });
    }
    collectionIds.add(collection.id);
    collection.entries.forEach((entry, entryIndex) => {
      const target = entryLinkTarget(collection.id, entry.id);
      if (targets.has(target)) {
        issues.push({
          code: "duplicate_id",
          path: [...path, "entries", entryIndex, "id"],
          message: `Entry id "${entry.id}" is used twice in "${collection.id}".`,
        });
      }
      targets.add(target);
    });
  });
  return targets;
}

/** Sizes, then the rule nodes, of every section and entry; an item over its byte limit is not walked. */
function checkDocuments(sections: Sections, collections: Collections, context: RuleBlocksContext, issues: Issues): void {
  sections.forEach((section, index) => {
    if (issues.full) return;
    const path = ["rules", "sections", index];
    issues.limit("maxTitleLength", section.title.length, [...path, "title"], "title length");
    if (!issues.limit("maxSectionBytes", jsonBytes(section.blocks), [...path, "blocks"], `section "${section.id}" bytes`)) {
      checkRuleBlocks(section.blocks, [...path, "blocks"], context);
    }
  });
  collections.forEach((collection, collectionIndex) => {
    const path = ["entries", "collections", collectionIndex];
    issues.limit("maxTitleLength", collection.title.length, [...path, "title"], "title length");
    collection.entries.forEach((entry, entryIndex) => {
      if (issues.full) return;
      const entryPath = [...path, "entries", entryIndex];
      issues.limit("maxTitleLength", entry.name.length, [...entryPath, "name"], "name length");
      if (entry.summary !== undefined) issues.limit("maxSummaryLength", entry.summary.length, [...entryPath, "summary"], "summary length");
      entry.tags?.forEach((tag, tagIndex) => issues.limit("maxTagLength", tag.length, [...entryPath, "tags", tagIndex], "tag length"));
      if (!issues.limit("maxEntryBytes", entryBytes(entry), entryPath, `entry "${collection.id}/${entry.id}" bytes`)) {
        checkRuleBlocks(entry.blocks, [...entryPath, "blocks"], context);
      }
    });
  });
}

/** Reads JSON text (or takes an already parsed value) up to the envelope; null when refused. */
function readValue(raw: unknown, issues: Issues): Record<string, unknown> | null {
  const max = SYSTEM_PACK_LIMITS.maxDepth;
  let value = raw;
  if (typeof raw === "string") {
    if (issues.limit("maxPackBytes", utf8Length(raw), [], "file bytes")) return null;
    if (textDepthExceeds(raw, max)) {
      issues.push({ code: "too_deep", path: [], message: `JSON nesting is deeper than ${max}.`, limit: "maxDepth", max });
      return null;
    }
    try {
      value = JSON.parse(raw);
    } catch (error) {
      issues.push({ code: "not_json", path: [], message: `Not JSON: ${error instanceof Error ? error.message : String(error)}` });
      return null;
    }
  }
  if (!isRecord(value)) {
    issues.push({ code: "not_json", path: [], message: "Expected a JSON object." });
    return null;
  }
  checkJsonTree(value, issues);
  if (issues.list.length > 0) return null;
  // A value parsed by the caller has not been measured yet; its depth is bounded now.
  if (typeof raw !== "string" && issues.limit("maxPackBytes", jsonBytes(value), [], "file bytes")) return null;
  return value;
}

/**
 * Checks JSON text, or a value parsed from JSON text, as a `skald/system-pack/v1` file. Pass the
 * text when there is one: only then is the size known before parsing.
 */
export async function parseSystemPack(raw: unknown, options: SystemPackParseOptions = {}): Promise<SystemPackParseResult> {
  const issues = new Issues();
  const refused = (): SystemPackParseResult => ({ pack: null, issues: issues.list });
  const value = readValue(raw, issues);
  if (!value) return refused();
  if (value.schema !== SYSTEM_PACK_SCHEMA_ID) {
    issues.push({ code: "unknown_schema", path: ["schema"], message: `Not a ${SYSTEM_PACK_SCHEMA_ID} file.` });
    return refused();
  }
  checkBounds(value, issues);
  if (issues.list.length > 0) return refused();
  const envelope = envelopeSchema.safeParse(value);
  if (!envelope.success) {
    envelopeIssues(envelope.error, issues);
    return refused();
  }
  const pack = envelope.data;
  const documents = parseDocuments(pack, issues);
  if (!documents) return refused();
  const { sections, collections } = documents;

  checkManifest(pack.manifest, issues);
  await checkSystem(pack.system, options, issues);
  checkGameData(pack.gameData, issues);
  const sectionIds = checkSectionTree(sections, issues);
  const entryTargets = checkEntryIds(collections, issues);
  const context: RuleBlocksContext = {
    push: (issue) => issues.push(issue),
    get full() {
      return issues.full;
    },
    resolves: (target) => sectionIds.has(target) || entryTargets.has(target),
  };
  checkDocuments(sections, collections, context, issues);

  const expected = await systemPackHash(value);
  if (expected !== pack.hash) {
    issues.push({ code: "hash_mismatch", path: ["hash"], message: `The hash does not match the content (expected ${expected}); rebuild the file.` });
  }
  if (issues.list.length > 0) return refused();
  // The value itself, not zod's copy: what was hashed is what the caller stores.
  return { pack: value as unknown as SystemPack, issues: [] };
}
