/**
 * Homebrew packs (ADR 0018): the user's own `skald/pack/v1` packs, stored in Skald one row per pack
 * item. A row's payload holds the v1 pieces of that item, so imports, the editor's forms and the
 * export share one format. Pure: no React, Next, Supabase or environment.
 */
import type { DndKind } from "../../reference/tags";
import type { OpenPackEntry, OpenPackOverlay } from "../../content-pack/open/format";
import type { PackWizardItem, PackZhEntry } from "../../content-pack/domain/types";

/** A stored row's kind: an entry kind, a wording `overlay` over a built-in ref, or a `wizard` item no entry owns. */
export type HomebrewItemKind = DndKind | "overlay" | "wizard";

/** The five kinds the editor's forms write (the first batch). Other kinds come only from imports. */
export type HomebrewFormKind = "feat" | "spell" | "item" | "species" | "background";

export const HOMEBREW_FORM_KINDS: readonly HomebrewFormKind[] = ["feat", "spell", "item", "species", "background"];

/** The wizard lists of `payload.wizard` in the v1 format (`pack.v1.schema.json`). */
export type WizardList =
  | "backgrounds" | "class-options" | "classes" | "equipment-packages" | "feats" | "invocations"
  | "languages" | "lineages" | "skills" | "species" | "spells" | "tools" | "weapons";

/**
 * One stored row's payload: the v1 pieces of one pack item. An entry row has `entry` (with its
 * zh-TW layer and the wizard items it owns), an `overlay` row has `overlay`, a `wizard` row has only
 * `wizard` (one item).
 */
export interface HomebrewPayload {
  /** `entry.id` is the row's key. */
  entry?: OpenPackEntry;
  /** The entry's zh-TW layer. */
  zhTW?: PackZhEntry;
  /** The wizard items this entry owns (same ref, or the owner of an equipment package). */
  wizard?: Partial<Record<WizardList, PackWizardItem[]>>;
  /** Kind `overlay`: wording over the built-in ref the row's key names. */
  overlay?: OpenPackOverlay;
}

export interface HomebrewPackRecord {
  /** The pack's uuid. */
  id: string;
  /** `manifest.packId` on export. */
  packId: string;
  name: string;
  notice: string;
  packVersion: string;
  position: number;
  enabled: boolean;
  /** Server-owned: grows whenever the pack's content changes. */
  revision: number;
  updatedAt: string;
}

export interface HomebrewItemRecord {
  /** The row's uuid. */
  id: string;
  packUuid: string;
  kind: HomebrewItemKind;
  /** An entry's id, an overlay's built-in ref, or `<list>/<item id>` for a wizard row. */
  key: string;
  payload: HomebrewPayload;
  /** Server-owned: grows whenever the payload changes. */
  revision: number;
  /** Size of the stored payload, the quantity the byte limit bounds. */
  bytes: number;
  updatedAt: string;
}

/** One row as the import writes it (`splitOpenPack`). */
export interface HomebrewItemInput {
  kind: HomebrewItemKind;
  key: string;
  payload: HomebrewPayload;
}

/** The manifest fields a homebrew pack keeps. */
export interface HomebrewManifest {
  packId: string;
  name: string;
  notice: string;
  packVersion: string;
}
