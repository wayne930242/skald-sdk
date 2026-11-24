/**
 * `bun scripts/check-pack-files.ts`: fails when the repository holds a content pack file other than
 * the documented example. Content packs carry text that each player keeps for themselves; they never
 * belong in this repository, not even in a test (docs/content-packs.md, CONTRIBUTING.md).
 *
 * A pack file is a `.json` file whose `$schema` is a Skald pack format (`skald/pack/v<N>` or
 * `skald/content-pack/v<N>`).
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

/** The one pack file this repository keeps: the example the documentation walks through. */
export const ALLOWED_PACK_FILES = ["systems/dnd5e/content-pack/open/example/lantern-table.pack.json"];

const SKIPPED_DIRECTORIES = new Set([".git", "node_modules", ".next", ".turbo", "coverage"]);
const PACK_SCHEMA = /"\$schema"\s*:\s*"skald\/(?:content-)?pack\/v\d+"/;

export function findPackFiles(root: string): string[] {
  const found: string[] = [];
  const walk = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRECTORIES.has(entry.name)) walk(absolute);
      } else if (entry.isFile() && entry.name.endsWith(".json") && PACK_SCHEMA.test(readFileSync(absolute, "utf8"))) {
        found.push(path.relative(root, absolute).split(path.sep).join("/"));
      }
    }
  };
  walk(root);
  return found.filter((file) => !ALLOWED_PACK_FILES.includes(file)).sort();
}

if (import.meta.main) {
  const found = findPackFiles(path.resolve(import.meta.dirname, ".."));
  if (found.length > 0) {
    console.error("Content pack files do not belong in this repository (see docs/content-packs.md):");
    for (const file of found) console.error(`  ${file}`);
    process.exit(1);
  }
  console.log("check:packs: no content pack files besides the example");
}
