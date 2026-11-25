/**
 * A validated v1 file split into homebrew rows (IMPL §3.5), what an import writes:
 *
 * - each kept entry → one row keyed by its id, with its zh-TW layer and the wizard items it owns
 *   (`ref` equal to the entry's, or an equipment package whose `ownerKind:owner` is the entry's ref);
 * - each kept overlay → one `overlay` row keyed by the built-in ref;
 * - a wizard item no entry owns → one `wizard` row keyed `<list>/<id>`.
 *
 * Rows follow the validator: what it dropped (a built-in or repeated ref, a same-name entry with its
 * zh-TW layer and wizard items, an overlay on no built-in ref, a repeated wizard id) is not returned.
 */
import type { PackWizardItem, ValidatedPack } from "../../content-pack/domain/types";
import type { OpenPack, OpenPackEntry } from "../../content-pack/open/format";
import type { HomebrewItemInput, HomebrewManifest, HomebrewPayload, WizardList } from "./types";

/** The refs a validation kept: its entries and its overlays. */
export function keptRefs(pack: Pick<ValidatedPack, "entries" | "overlays">): Set<string> {
  return new Set([...pack.entries.map((entry) => entry.ref), ...Object.keys(pack.overlays ?? {})]);
}

const refOf = (entry: OpenPackEntry) => entry.ref ?? `${entry.kind}:${entry.id}`;

/** The entry ref an equipment package belongs to, by its owner fields. */
function ownerRef(item: PackWizardItem): string | undefined {
  return typeof item.owner === "string" && typeof item.ownerKind === "string" ? `${item.ownerKind}:${item.owner}` : undefined;
}

export function splitOpenPack(open: OpenPack, kept: ReadonlySet<string>): { manifest: HomebrewManifest; items: HomebrewItemInput[] } {
  const { manifest, payload } = open;
  const inFile = new Set(payload.entries.map(refOf));
  const rows = new Map<string, HomebrewItemInput & { payload: HomebrewPayload }>();
  for (const entry of payload.entries) {
    const ref = refOf(entry);
    if (!kept.has(ref) || rows.has(ref)) continue;
    const zhTW = payload.zhTW?.[ref];
    rows.set(ref, { kind: entry.kind, key: entry.id, payload: { entry, ...(zhTW ? { zhTW } : {}) } });
  }

  const loose: HomebrewItemInput[] = [];
  for (const [list, items] of Object.entries(payload.wizard ?? {}) as Array<[WizardList, PackWizardItem[]]>) {
    const ids = new Set<string>();
    for (const item of items) {
      const ref = typeof item.ref === "string" ? item.ref : undefined;
      if (ref && !rows.has(ref)) continue;
      if (ids.has(item.id)) continue;
      ids.add(item.id);
      const owner = ref ?? ownerRef(item);
      const row = owner ? rows.get(owner) : undefined;
      if (row) {
        const wizard = (row.payload.wizard ??= {});
        (wizard[list] ??= []).push(item);
      } else if (!owner || !inFile.has(owner)) {
        // An item of an entry the validator dropped rides with it; any other is its own row.
        loose.push({ kind: "wizard", key: `${list}/${item.id}`, payload: { wizard: { [list]: [item] } } });
      }
    }
  }

  const overlays: HomebrewItemInput[] = Object.entries(payload.overlays ?? {})
    .filter(([ref]) => kept.has(ref))
    .map(([ref, overlay]) => ({ kind: "overlay", key: ref, payload: { overlay } }));

  return {
    manifest: { packId: manifest.packId, name: manifest.name, notice: manifest.notice, packVersion: manifest.packVersion },
    items: [...rows.values(), ...overlays, ...loose],
  };
}
