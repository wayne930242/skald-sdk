/**
 * `bun scripts/check-protected-paths.ts <base>`: fails when the commits between <base> and HEAD
 * touch a file this repository does not take pull requests for.
 *
 * Skald's source repo generates or overlays those files, and its export would overwrite a change
 * to them on the next sync: the overlaid repo setup, the message subsets, the zh-TW fallback files
 * and the generated D&D data. The export lists them in .github/protected-paths.json. The list is
 * read from <base>, so a pull request cannot loosen it, and a rename counts both its paths. A path
 * under a top-level name the export never writes (a new root) counts too: oss:import refuses it.
 * CONTRIBUTING.md says where those changes go instead.
 */
import { spawnSync } from "node:child_process";

export const PROTECTED_PATHS_FILE = ".github/protected-paths.json";

export interface ProtectedPaths {
  files: string[];
  patterns: { glob: string; regex: string }[];
  /** Top-level names the export writes; a path under any other name is a new root, which import refuses. */
  roots?: string[];
}

/** The `changed` paths the list protects, in their given order; matched case-insensitively. */
export function protectedChanges(list: ProtectedPaths, changed: readonly string[]): string[] {
  const files = new Set(list.files.map((file) => file.toLowerCase()));
  const patterns = list.patterns.map(({ regex }) => new RegExp(regex, "i"));
  const roots = list.roots && new Set(list.roots.map((root) => root.toLowerCase()));
  return changed.filter((file) =>
    files.has(file.toLowerCase())
    || patterns.some((pattern) => pattern.test(file))
    || (roots !== undefined && !roots.has(file.split("/")[0].toLowerCase())));
}

function git(cwd: string, args: string[]): string {
  const run = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (run.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${run.stderr.trim()}`);
  return run.stdout;
}

export interface CheckIO {
  cwd?: string;
  log?: (line: string) => void;
}

export function checkCommand(argv: string[], io: CheckIO = {}): number {
  const cwd = io.cwd ?? process.cwd();
  const log = io.log ?? ((line: string) => console.log(line));
  const [base] = argv;
  if (!base || argv.length !== 1) {
    log("usage: bun scripts/check-protected-paths.ts <base ref>");
    return 2;
  }
  const list = JSON.parse(git(cwd, ["show", `${base}:${PROTECTED_PATHS_FILE}`])) as ProtectedPaths;
  const changed = git(cwd, ["diff", "--name-only", "--no-renames", "-z", `${base}...HEAD`]).split("\0").filter(Boolean);
  const touched = protectedChanges(list, changed);
  if (touched.length === 0) {
    log(`check-protected-paths: no protected path among ${changed.length} changed file${changed.length === 1 ? "" : "s"}`);
    return 0;
  }
  log("check-protected-paths: this pull request changes files Skald generates or maintains outside this repository:");
  for (const file of touched) log(`  ${file}`);
  log("Revert these changes and open an issue for them instead; CONTRIBUTING.md explains why.");
  return 1;
}

if (import.meta.main) process.exit(checkCommand(process.argv.slice(2)));
