import { createPackSource, type ReferenceSource } from "../reference/sources";
import type { DndPackSource, PackScope } from "../sheet/pack-source-port";

/**
 * This device's enabled packs as one reference source for the print, read the way the sheet mount
 * reads them (the cache alone) and only when a row asks. A row whose ref lost a same-name dedupe
 * opens the winner (B-025). Without the host's pack source, or without a cached pack, null: a pack
 * row then prints its name and a notice. A table copy's scope adds the table's shared GM homebrew.
 */
export function devicePackLoader(source: DndPackSource | null, scope?: PackScope): () => Promise<ReferenceSource | null> {
  return async () => {
    const effective = source ? await (scope ? source.readCached(scope) : source.readCached()) : null;
    return effective ? createPackSource(effective.content.entries, effective.content.zhTW, effective.aliases) : null;
  };
}
