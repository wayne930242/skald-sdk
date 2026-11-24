/**
 * The pack command (`docs/content-packs.md`): checks and seals a D&D 2024 content pack in the SDK
 * format, with the same rules Skald applies when it loads one.
 *
 *   check <file>          Validates the file and reports what loads and what is dropped.
 *   seal <file> [--pin]   Writes `manifest.payloadSha256` (and, with --pin, `requiresBuiltin`)
 *                         into the file, then checks it.
 *   schema                Prints the format's JSON Schema (`pack.v1.schema.json`).
 *
 * Exit codes: 0 the pack loads, 1 it does not, 2 a usage or file error.
 */
import { readFileSync, writeFileSync } from "node:fs";
import type { PackErrorCode } from "../domain/types";
import { OPEN_PACK_SCHEMA_ID, openPackVersion, type OpenPack } from "./format";
import { loadBuiltinIdentity, loadOpenPackSchemaCheck } from "./load";
import { openPackSchema } from "./schema";
import { openPackText, sealOpenPack } from "./seal";
import { validateOpenPackText, type OpenPackValidation } from "./validate-open-pack";

export interface PackCliIo {
  log(line: string): void;
  error(line: string): void;
  read(file: string): string;
  write(file: string, text: string): void;
}

const nodeIo: PackCliIo = {
  log: (line) => console.log(line),
  error: (line) => console.error(line),
  read: (file) => readFileSync(file, "utf8"),
  write: (file, text) => writeFileSync(file, text),
};

const USAGE = "usage: pack check <file> | pack seal <file> [--pin] | pack schema";

/** What each refusal means, in the words of the pack panel. */
export const PACK_ERROR_TEXT: Record<PackErrorCode, string> = {
  tooLarge: "The file is over 12 MB.",
  notJson: "The file is not a JSON object.",
  schema: "Not a valid content pack",
  wrongSystem: `This file isn't a D&D 2024 content pack in the ${OPEN_PACK_SCHEMA_ID} format.`,
  unsupportedVersion: "This pack needs a newer version of this tool.",
  shaMismatch: "The checksum doesn't match the payload: run `seal` after every change.",
};

function describeReport({ name, pack, report }: OpenPackValidation & { ok: true }, io: PackCliIo) {
  const { manifest } = pack;
  const kept = Object.entries(report.counts).sort(([a], [b]) => (a < b ? -1 : 1));
  io.log(`ok: ${name} (${manifest.packId} ${manifest.packVersion}), ${report.bytes} bytes`);
  io.log(`  entries: ${kept.length ? kept.map(([kind, count]) => `${kind} ${count}`).join(", ") : "none"}`);
  io.log(`  overlays: ${Object.keys(pack.overlays ?? {}).length}`);
  for (const ref of report.dropped) io.log(`  dropped ${ref}: a built-in entry has this ref, or the pack repeats it`);
  for (const { ref, builtinRef } of report.droppedByName ?? []) io.log(`  dropped ${ref}: same kind and name as built-in ${builtinRef}; write an overlay on it instead`);
  for (const ref of report.droppedOverlays ?? []) io.log(`  dropped overlay ${ref}: no built-in entry has this ref`);
  if (report.builtinMismatch) io.log("  warning: requiresBuiltin was taken from other built-in data; run `seal --pin` to update it");
}

async function check(text: string, io: PackCliIo): Promise<number> {
  const [schema, identity] = await Promise.all([loadOpenPackSchemaCheck(), loadBuiltinIdentity()]);
  const result = await validateOpenPackText(text, { builtinRefs: identity.refs, builtinNameKeys: identity.nameKeys, schema });
  if (!result.ok) {
    io.error(`refused: ${PACK_ERROR_TEXT[result.error]}${result.detail ? ` (${result.detail})` : ""}`);
    return 1;
  }
  describeReport(result, io);
  return 0;
}

export async function runPackCli(args: readonly string[], io: PackCliIo = nodeIo): Promise<number> {
  const [command, file, ...flags] = args;
  if (command === "schema" && file === undefined) {
    const app = await import("@skald/system-dnd5e/data/dnd5e-2024/schemas/content-pack.v2.schema.json");
    io.log(JSON.stringify(openPackSchema((app.default ?? app) as Record<string, unknown>), null, 2));
    return 0;
  }
  const pin = flags.includes("--pin");
  if (!file || (command !== "check" && command !== "seal") || flags.some((flag) => flag !== "--pin") || (pin && command !== "seal")) {
    io.error(USAGE);
    return 2;
  }
  let text: string;
  try {
    text = io.read(file);
  } catch (error) {
    io.error(`cannot read ${file}: ${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }
  if (command === "check") return check(text, io);

  let pack: OpenPack;
  try {
    pack = JSON.parse(text) as OpenPack;
  } catch {
    io.error(`refused: ${PACK_ERROR_TEXT.notJson}`);
    return 1;
  }
  if (!pack || typeof pack !== "object" || openPackVersion(pack.$schema) === null || !pack.manifest || !pack.payload) {
    io.error(`refused: ${PACK_ERROR_TEXT.wrongSystem}`);
    return 1;
  }
  const sealed = await sealOpenPack(pack, pin ? { builtinRefs: (await loadBuiltinIdentity()).refs } : {});
  const out = openPackText(sealed);
  io.write(file, out);
  io.log(`sealed ${file}`);
  return check(out, io);
}

if (import.meta.main) process.exit(await runPackCli(process.argv.slice(2)));
