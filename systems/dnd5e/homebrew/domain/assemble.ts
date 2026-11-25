/**
 * A homebrew pack as one `skald/pack/v1` pack (IMPL §3.5): what the device validates and caches,
 * and, sealed, the export file (`bun run pack check` passes on it).
 */
import { PACK_SYSTEM_ID } from "../../content-pack/domain/pack-system";
import type { PackWizardItem, PackZhEntry } from "../../content-pack/domain/types";
import { OPEN_PACK_SCHEMA_ID, type OpenPack, type OpenPackEntry, type OpenPackOverlay } from "../../content-pack/open/format";
import { openPackText, sealOpenPack } from "../../content-pack/open/seal";
import type { HomebrewItemRecord, HomebrewPackRecord } from "./types";

type AssembledItem = Pick<HomebrewItemRecord, "kind" | "key" | "payload">;
type AssembledPack = Pick<HomebrewPackRecord, "packId" | "name" | "notice" | "packVersion">;

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * One homebrew pack as a v1 pack, not sealed (`payloadSha256` empty): rows sorted by kind, then
 * key; each list keeps the rows' order; no `requiresBuiltin`; `locales` lists zh-TW when any row
 * has a zh-TW layer. Empty `zhTW`, `wizard` and `overlays` are left out.
 */
export function assembleOpenPack(pack: AssembledPack, items: readonly AssembledItem[]): OpenPack {
  const entries: OpenPackEntry[] = [];
  const zhTW: Record<string, PackZhEntry> = {};
  const wizard: Record<string, PackWizardItem[]> = {};
  const overlays: Record<string, OpenPackOverlay> = {};
  const sorted = [...items].sort((a, b) => compare(a.kind, b.kind) || compare(a.key, b.key));
  for (const { kind, key, payload } of sorted) {
    if (kind === "overlay") {
      if (payload.overlay) overlays[key] = payload.overlay;
      continue;
    }
    if (kind !== "wizard" && payload.entry) {
      entries.push(payload.entry);
      if (payload.zhTW) zhTW[payload.entry.ref ?? `${payload.entry.kind}:${payload.entry.id}`] = payload.zhTW;
    }
    for (const [list, listItems] of Object.entries(payload.wizard ?? {})) {
      if (listItems?.length) (wizard[list] ??= []).push(...listItems);
    }
  }
  const zh = Object.keys(zhTW).length > 0 || Object.values(overlays).some((overlay) => overlay.zhTW);
  return {
    $schema: OPEN_PACK_SCHEMA_ID,
    manifest: {
      systemId: PACK_SYSTEM_ID,
      packId: pack.packId,
      packVersion: pack.packVersion,
      name: pack.name,
      notice: pack.notice,
      locales: zh ? ["en", "zh-TW"] : ["en"],
      payloadSha256: "",
    },
    payload: {
      entries,
      ...(Object.keys(zhTW).length ? { zhTW } : {}),
      ...(Object.keys(wizard).length ? { wizard } : {}),
      ...(Object.keys(overlays).length ? { overlays } : {}),
    },
  };
}

/** The export file of a homebrew pack: sealed, without a built-in pin, as indented JSON. */
export async function exportHomebrewPack(pack: AssembledPack, items: readonly AssembledItem[]): Promise<string> {
  return openPackText(await sealOpenPack(assembleOpenPack(pack, items)));
}
