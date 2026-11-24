/**
 * The merged-view helpers every consumer needs, kept apart from `merge-packs.ts` so a device with
 * one pack loads none of the merge.
 */
import type { EffectivePacks, PackContent } from "./types";

/** One enabled pack is its own view: nothing to dedupe across packs. */
export function singlePackView(key: string, pack: PackContent): EffectivePacks {
  const supplier: Record<string, string> = {};
  for (const entry of pack.entries) supplier[entry.ref] = key;
  for (const ref of Object.keys(pack.overlays ?? {})) supplier[ref] = key;
  return { content: pack, keys: [key], supplier, aliases: {}, shadowed: { [key]: [] } };
}

/** The ref a character row's `ref` stands for in this view: the winner's when the row's lost by name. */
export function resolveAlias(effective: Pick<EffectivePacks, "aliases"> | null, ref: string): string {
  return effective?.aliases[ref] ?? ref;
}
