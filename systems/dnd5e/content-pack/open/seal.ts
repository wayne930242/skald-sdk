/**
 * Sealing a pack in the SDK format: `manifest.payloadSha256` set to the checksum of `payload`, and,
 * when given the built-in refs, `manifest.requiresBuiltin` to the checksum of their sorted list.
 * The checksum is taken over the canonical JSON of the parsed `payload` (keys sorted, no spaces,
 * one trailing newline), so the file's own layout does not matter.
 */
import { builtinRefsSha } from "../domain/validate-pack";
import type { OpenPack } from "./format";
import { openPayloadSha } from "./validate-open-pack";

export async function sealOpenPack(pack: OpenPack, options: { builtinRefs?: ReadonlySet<string> } = {}): Promise<OpenPack> {
  const manifest = { ...pack.manifest, payloadSha256: await openPayloadSha(pack.payload) };
  if (options.builtinRefs) manifest.requiresBuiltin = await builtinRefsSha(options.builtinRefs);
  return { ...pack, manifest };
}

/** A pack file's text: indented JSON with one trailing newline. */
export function openPackText(pack: OpenPack): string {
  return `${JSON.stringify(pack, null, 2)}\n`;
}
