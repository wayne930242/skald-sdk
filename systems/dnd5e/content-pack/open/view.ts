/**
 * Validated packs as the one view a sheet reads through `dndPackSourcePort`: one pack is its own
 * view, several merge in list order (the first wins). For a host that keeps packs in memory, such
 * as the previewer.
 */
import { singlePackView } from "../domain/effective";
import type { EffectivePacks, ValidatedPack } from "../domain/types";

export async function packsView(packs: readonly ValidatedPack[]): Promise<EffectivePacks | null> {
  const keyed = packs.map(({ manifest, ...pack }) => ({ key: manifest.packId, pack }));
  if (keyed.length === 0) return null;
  if (keyed.length === 1) return singlePackView(keyed[0].key, keyed[0].pack);
  const { mergePacks } = await import("../domain/merge-packs");
  return mergePacks(keyed);
}
