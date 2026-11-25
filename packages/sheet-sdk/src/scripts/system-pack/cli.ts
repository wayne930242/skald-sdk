/**
 * The system pack command: builds a `skald/system-pack/v1` file from an authoring folder and checks
 * a file with the same validator the site runs before it stores one.
 *
 *   build <dir> --out <file>   Compiles the folder, checks the result, and writes it.
 *   check <file>               Checks a file and lists every issue by code and JSON Pointer.
 *
 * The site checks more than this command can: formulas, scoped CSS compile, macros, the wizard
 * against the pack's game data, and the upgrade of existing characters (ADR 0003).
 *
 * Exit codes: 0 the pack is valid, 1 it is not, 2 a usage, file or build error.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  issuePointer,
  parseSystemPack,
  type SystemPack,
  type SystemPackIssue,
} from "@skald/sheet-sdk/modules/systems";
import { buildSystemPack, systemPackText } from "./build";
import { SystemPackBuildError } from "./markdown";

export interface SystemPackCliIo {
  log(line: string): void;
  error(line: string): void;
  read(file: string): string;
  write(file: string, text: string): void;
}

const nodeIo: SystemPackCliIo = {
  log: (line) => console.log(line),
  error: (line) => console.error(line),
  read: (file) => readFileSync(file, "utf8"),
  write: (file, text) => {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, text);
  },
};

const USAGE = "usage: system-pack build <dir> --out <file> | system-pack check <file>";

let gameIconNames: Promise<ReadonlySet<string>> | undefined;

/** The Game-Icons names the site knows (`data/game-icons/icons.json`). */
function loadGameIconNames(): Promise<ReadonlySet<string>> {
  gameIconNames ??= import("@skald/sheet-sdk/data/game-icons/icons.json").then((module) => {
    const icons = (module.default ?? module) as Record<string, unknown>;
    return new Set(Object.keys(icons));
  });
  return gameIconNames;
}

/** One issue as a line: code, where, why. */
export function issueLine(issue: SystemPackIssue): string {
  return `${issue.code} ${issuePointer(issue.path)}: ${issue.message}`;
}

function describe(pack: SystemPack, bytes: number, io: SystemPackCliIo): void {
  const { manifest } = pack;
  const collections = pack.entries?.collections ?? [];
  const entries = collections.reduce((total, collection) => total + collection.entries.length, 0);
  io.log(`ok: ${manifest.name} (${manifest.packId} ${manifest.version}), ${bytes} bytes`);
  io.log(`  rules: ${pack.rules?.sections.length ?? 0} sections`);
  io.log(`  entries: ${entries} in ${collections.length} collections`);
  io.log(`  game data: ${Object.keys(pack.gameData ?? {}).length} keys`);
  io.log(`  hash: ${pack.hash}`);
}

async function check(text: string, io: SystemPackCliIo): Promise<number> {
  const { pack, issues } = await parseSystemPack(text, { gameIconNames: await loadGameIconNames() });
  if (!pack) {
    io.error(`refused: ${issues.length} issue${issues.length === 1 ? "" : "s"}`);
    for (const issue of issues) io.error(`  ${issueLine(issue)}`);
    return 1;
  }
  describe(pack, new TextEncoder().encode(text).byteLength, io);
  return 0;
}

async function build(dir: string, out: string, io: SystemPackCliIo): Promise<number> {
  let file: Record<string, unknown>;
  try {
    file = await buildSystemPack(dir);
  } catch (error) {
    if (error instanceof SystemPackBuildError) {
      io.error(`build failed: ${error.message}`);
      return 2;
    }
    throw error;
  }
  const text = systemPackText(file);
  const { pack, issues } = await parseSystemPack(text, { gameIconNames: await loadGameIconNames() });
  if (!pack) {
    io.error(`refused: ${issues.length} issue${issues.length === 1 ? "" : "s"}; nothing written`);
    for (const issue of issues) io.error(`  ${issueLine(issue)}`);
    return 1;
  }
  io.write(out, text);
  io.log(`built ${out}`);
  describe(pack, new TextEncoder().encode(text).byteLength, io);
  return 0;
}

export async function runSystemPackCli(args: readonly string[], io: SystemPackCliIo = nodeIo): Promise<number> {
  const [command, target, ...rest] = args;
  if (command === "check" && target && rest.length === 0) {
    let text: string;
    try {
      text = io.read(target);
    } catch (error) {
      io.error(`cannot read ${target}: ${error instanceof Error ? error.message : String(error)}`);
      return 2;
    }
    return check(text, io);
  }
  if (command === "build" && target && rest.length === 2 && rest[0] === "--out" && rest[1]) {
    return build(target, rest[1], io);
  }
  io.error(USAGE);
  return 2;
}

if (import.meta.main) process.exit(await runSystemPackCli(process.argv.slice(2)));
