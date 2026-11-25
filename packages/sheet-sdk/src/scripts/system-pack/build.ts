/**
 * Compiles an authoring folder into one `skald/system-pack/v1` file (layout in
 * `docs/system-packs.md`; the folder mirrors the DSL reference's `data/<slug>/`, plus `game/`,
 * `rules/` and `entries/`). Building never repairs: an unknown file, key or Markdown construct
 * stops it with the file and line.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { SYSTEM_PACK_SCHEMA_ID, systemPackHash } from "@skald/sheet-sdk/modules/systems";
import { jsonCollection, markdownCollection, rulesSections, SystemPackBuildError } from "./markdown";

/** The version of this build tool, written to `manifest.sdk`. */
export const SYSTEM_PACK_BUILD_VERSION = "1.0.0";

/** Root files besides `system.json`: file name → where the part goes in `system`. */
const PART_FILES: Record<string, { key: string; dsl?: true; required?: true }> = {
  "schema.json": { key: "schema", required: true },
  "template.json": { key: "template", required: true },
  "default-data.json": { key: "defaultData", required: true },
  "mappings.json": { key: "mappings" },
  "dsl-lookup-tables.json": { key: "lookupTables", dsl: true },
  "dsl-roll-rules.json": { key: "rollRules", dsl: true },
  "dsl-aliases.json": { key: "aliases", dsl: true },
  "roll-macros.json": { key: "rollMacros", dsl: true },
  "wizard.json": { key: "wizard" },
  "field-migration.json": { key: "fieldMigration" },
};

/** `system.json` keys copied into the manifest (`id` becomes `packId`). */
const MANIFEST_KEYS = ["name", "version", "description", "category", "locale", "notice", "sheetComponent"] as const;

/**
 * `system.json` keys of the DSL reference layout that a pack does not need, because its file names
 * are fixed. They are ignored, so a built-in style `system.json` builds as is.
 */
const IGNORED_SYSTEM_KEYS = new Set(["$schema", "author", "schema", "template", "defaultData", "mappings", "dsl", "gameData", "wizard"]);

const SUBFOLDERS = new Set(["game", "rules", "entries"]);

function readJson(file: string): unknown {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw new SystemPackBuildError(`${file}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Drops an editor hint such as `"$schema": "../schemas/schema.schema.json"`; keeps format ids. */
function withoutSchemaHint(value: unknown): unknown {
  if (!isRecord(value) || typeof value.$schema !== "string" || !value.$schema.endsWith(".json")) return value;
  const { $schema: _hint, ...rest } = value;
  return rest;
}

function filesIn(folder: string, extensions: readonly string[]): string[] {
  let names: string[];
  try {
    names = readdirSync(folder);
  } catch {
    return [];
  }
  return names
    .filter((name) => !name.startsWith("."))
    .sort()
    .map((name) => {
      const file = path.join(folder, name);
      if (!statSync(file).isFile() || !extensions.includes(path.extname(name))) {
        throw new SystemPackBuildError(`${file}: expected only ${extensions.join(" or ")} files here`);
      }
      return file;
    });
}

function manifestOf(dir: string): Record<string, unknown> {
  const file = path.join(dir, "system.json");
  const system = readJson(file);
  if (!isRecord(system)) throw new SystemPackBuildError(`${file}: expected an object`);
  const manifest: Record<string, unknown> = { packId: system.id };
  for (const key of Object.keys(system)) {
    if (key !== "id" && !IGNORED_SYSTEM_KEYS.has(key) && !(MANIFEST_KEYS as readonly string[]).includes(key)) {
      throw new SystemPackBuildError(`${file}: unknown key "${key}"`);
    }
  }
  for (const key of MANIFEST_KEYS) if (system[key] !== undefined) manifest[key] = system[key];
  manifest.sdk = SYSTEM_PACK_BUILD_VERSION;
  return manifest;
}

/** The pack file for the authoring folder `dir`, sealed with its hash; not yet checked. */
export async function buildSystemPack(dir: string): Promise<Record<string, unknown>> {
  const manifest = manifestOf(dir);
  const system: Record<string, unknown> = {};
  const dsl: Record<string, unknown> = {};
  for (const name of readdirSync(dir).sort()) {
    const file = path.join(dir, name);
    if (statSync(file).isDirectory()) {
      if (!SUBFOLDERS.has(name)) throw new SystemPackBuildError(`${file}: unknown folder (expected game/, rules/ or entries/)`);
    } else if (name.endsWith(".json") && name !== "system.json" && !PART_FILES[name]) {
      throw new SystemPackBuildError(`${file}: unknown part file (expected ${Object.keys(PART_FILES).join(", ")})`);
    }
  }
  for (const [name, part] of Object.entries(PART_FILES)) {
    const file = path.join(dir, name);
    let exists = true;
    try {
      statSync(file);
    } catch {
      exists = false;
    }
    if (!exists) {
      if (part.required) throw new SystemPackBuildError(`${file}: missing`);
      continue;
    }
    (part.dsl ? dsl : system)[part.key] = withoutSchemaHint(readJson(file));
  }
  if (Object.keys(dsl).length > 0) system.dsl = dsl;

  const content: Record<string, unknown> = { schema: SYSTEM_PACK_SCHEMA_ID, manifest, system };

  const gameFiles = filesIn(path.join(dir, "game"), [".json"]);
  if (gameFiles.length > 0) {
    content.gameData = Object.fromEntries(gameFiles.map((file) => [path.basename(file, ".json"), readJson(file)]));
  }

  const ruleFiles = filesIn(path.join(dir, "rules"), [".md"]);
  if (ruleFiles.length > 0) {
    content.rules = { sections: ruleFiles.flatMap((file) => rulesSections(readFileSync(file, "utf8"), file)) };
  }

  const entryFiles = filesIn(path.join(dir, "entries"), [".md", ".json"]);
  if (entryFiles.length > 0) {
    content.entries = {
      collections: entryFiles.map((file) => {
        const id = path.basename(file, path.extname(file));
        return file.endsWith(".md")
          ? markdownCollection(id, readFileSync(file, "utf8"), file)
          : jsonCollection(id, readJson(file), file);
      }),
    };
  }

  return { ...content, hash: await systemPackHash(content) };
}

/** A pack file's text: indented JSON with one trailing newline. */
export function systemPackText(pack: Record<string, unknown>): string {
  return `${JSON.stringify(pack, null, 2)}\n`;
}
