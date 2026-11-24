/**
 * Several enabled packs as one view (B-025). Every entry identity shows once: the built-in SRD
 * already won in the validator; across packs the one higher in the user's order wins, by ref or
 * by name key (`identity.ts`). An entry's zh-TW layer and its wizard items follow it. An overlay
 * of a built-in ref comes whole from the highest pack that has one (no field merge). A ref
 * dropped for a same-name entry resolves to the winner through `aliases`, so a character row
 * saved with the loser's ref opens the winner's reference.
 *
 * Loaded only with two or more enabled packs: one pack is its own view (`singlePackView`).
 */
import { nameKey } from "./identity";
import type { EffectivePacks, PackContent, PackEntry, PackOverlay, PackWizardItem, PackZhEntry, ShadowedEntry } from "./types";

export interface KeyedPack {
  /** The pack's `packId`. */
  key: string;
  pack: PackContent;
}

export function mergePacks(packs: readonly KeyedPack[]): EffectivePacks | null {
  if (packs.length === 0) return null;
  const supplier: Record<string, string> = {};
  const aliases: Record<string, string> = {};
  const shadowed: Record<string, ShadowedEntry[]> = {};
  const byName = new Map<string, { key: string; ref: string }>();
  const entries: PackEntry[] = [];
  const zhTW: Record<string, PackZhEntry> = {};

  for (const { key, pack } of packs) {
    const lost: ShadowedEntry[] = [];
    const ownNames = new Map<string, string>();
    for (const entry of pack.entries) {
      const owner = supplier[entry.ref];
      if (owner !== undefined) {
        if (owner !== key) lost.push({ ref: entry.ref, by: owner });
        continue;
      }
      const name = nameKey(entry.kind, entry.id, entry.name);
      const winner = name === null ? undefined : byName.get(name);
      if (winner && winner.key !== key) {
        aliases[entry.ref] = winner.ref;
        lost.push({ ref: entry.ref, by: winner.key });
        continue;
      }
      supplier[entry.ref] = key;
      if (name !== null && !ownNames.has(name)) ownNames.set(name, entry.ref);
      entries.push(entry);
      const zh = pack.zhTW[entry.ref];
      if (zh) zhTW[entry.ref] = zh;
    }
    // A pack's names count against the packs below it only: two same-name entries inside one pack stay as the validator left them.
    for (const [name, ref] of ownNames) if (!byName.has(name)) byName.set(name, { key, ref });
    shadowed[key] = lost;
  }

  const wizard: Record<string, PackWizardItem[]> = {};
  for (const { key, pack } of packs) {
    for (const [list, items] of Object.entries(pack.wizard)) {
      const out = (wizard[list] ??= []);
      const ids = new Set(out.map((item) => item.id));
      for (const item of items) {
        if (typeof item.ref === "string" && supplier[item.ref] !== key) continue;
        if (ids.has(item.id)) continue;
        ids.add(item.id);
        out.push(item);
      }
    }
  }

  const overlays: Record<string, PackOverlay> = {};
  for (const { key, pack } of packs) {
    for (const [ref, overlay] of Object.entries(pack.overlays ?? {})) {
      const owner = supplier[ref];
      if (owner !== undefined) {
        if (owner !== key) shadowed[key].push({ ref, by: owner });
        continue;
      }
      supplier[ref] = key;
      overlays[ref] = overlay;
    }
  }

  return { content: { entries, zhTW, wizard, overlays }, keys: packs.map((pack) => pack.key), supplier, aliases, shadowed };
}
