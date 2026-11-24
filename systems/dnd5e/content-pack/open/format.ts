/**
 * The SDK pack format, `skald/pack/v1`: the documented, source-neutral format anyone can write a
 * D&D 2024 content pack in (`docs/content-packs.md`). Its JSON Schema is
 * `data/dnd5e-2024/schemas/pack.v1.schema.json`, built from the app's own pack schema by
 * `schema.ts` so entries, text blocks, wizard items and limits stay the same.
 *
 * What it leaves out of the app's format: build pins, per-kind counts, a fixed list of books and
 * the fields only Skald's own builder writes. `ref`, `meta`, `zhTW`, `wizard` and `overlays` are
 * optional, an entry's `source` is any short label (for example `homebrew`), and the manifest
 * carries the pack's `name`.
 */
import type { PackOverlayText, PackOverlayZh, PackWizardItem, PackZhEntry } from "../domain/types";
import type { DndKind } from "../../reference/tags";

export const OPEN_PACK_SCHEMA_ID = "skald/pack/v1";
/** Majors of `skald/pack/v<N>` this code reads. */
export const OPEN_PACK_READ_VERSIONS: readonly number[] = [1];
/** An entry's optional `source` label. */
export const OPEN_PACK_SOURCE_PATTERN = "^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$";

/** The major of a `skald/pack/v<N>` id, or null for any other value. */
export function openPackVersion(id: unknown): number | null {
  const match = typeof id === "string" ? /^skald\/pack\/v([1-9][0-9]{0,5})$/.exec(id) : null;
  return match ? Number(match[1]) : null;
}

export interface OpenPackManifest {
  systemId: string;
  packId: string;
  packVersion: string;
  /** The pack's name, shown wherever the pack is listed. */
  name: string;
  /** Who wrote the pack and on what terms. */
  notice: string;
  /** SHA-256 of the canonical JSON of `payload` (`seal.ts`). */
  payloadSha256: string;
  /** SHA-256 of the sorted built-in ref list the pack was checked against; absent: none. */
  requiresBuiltin?: string;
  generatedAt?: string;
  locales?: string[];
}

export interface OpenPackEntry {
  kind: DndKind;
  id: string;
  /** `kind:id`; filled in when absent. */
  ref?: string;
  name: string;
  /** A label for the author's own records, such as `homebrew`; Skald does not show it. */
  source?: string;
  entries: unknown[];
  meta?: Record<string, unknown>;
  lore?: unknown[];
}

export interface OpenPackOverlay {
  en: PackOverlayText;
  zhTW?: PackOverlayZh;
}

export interface OpenPackPayload {
  entries: OpenPackEntry[];
  zhTW?: Record<string, PackZhEntry>;
  wizard?: Record<string, PackWizardItem[]>;
  overlays?: Record<string, OpenPackOverlay>;
}

export interface OpenPack {
  $schema: typeof OPEN_PACK_SCHEMA_ID;
  manifest: OpenPackManifest;
  payload: OpenPackPayload;
}
