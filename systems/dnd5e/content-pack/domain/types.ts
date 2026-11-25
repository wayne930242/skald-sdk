import type { HomebrewStamp } from "../../homebrew/domain/rows";
import type { DndKind } from "../../reference/tags";

/** The book a pack entry or overlay comes from (pack format v2). */
export type PackSource = "XPHB" | "XMM" | "XDMG";

/** One corpus entry of a pack (§1.8), the same shape as a built-in corpus entry. */
export interface PackEntry {
  kind: DndKind;
  id: string;
  ref: string;
  name: string;
  entries: unknown[];
  meta: Record<string, unknown>;
  /** v2: the book; v1 entries are all XPHB. */
  source?: PackSource;
  /** v2: background blocks, for example monster lore. */
  lore?: unknown[];
}

export interface PackZhEntry {
  name: string;
  entries: unknown[];
  entriesHigherLevel?: unknown[];
  material?: string;
  /** v2: translated text fields of `meta`; a `null` value means the English one. */
  meta?: Record<string, unknown>;
  /** v2: sparse, `null` = the English block. */
  lore?: Array<unknown | null>;
}

/** The original wording of a built-in entry, in English (v2 `payload.overlays[ref].en`). */
export interface PackOverlayText {
  name?: string;
  entries?: unknown[];
  entriesHigherLevel?: unknown[];
  material?: string;
  /** Stat block header fields that differ from the SRD `meta`. */
  meta?: Record<string, unknown>;
  lore?: unknown[];
}

/** Its zh-TW layer: sparse, a `null` block or `meta` value means the English one. */
export interface PackOverlayZh {
  name?: string;
  entries?: Array<unknown | null>;
  entriesHigherLevel?: Array<unknown | null>;
  material?: string;
  meta?: Record<string, unknown>;
  lore?: Array<unknown | null>;
}

/** A pack overlay on a built-in ref (plan T2b §3): shown over the SRD text while the pack is loaded. */
export interface PackOverlay {
  /** The book the wording comes from; absent for a pack's own wording (the SDK format, `open/format.ts`). */
  source?: PackSource;
  en: PackOverlayText;
  zhTW?: PackOverlayZh;
}

export type PackWizardItem = Record<string, unknown> & { id: string; ref?: string; origin: "pack" };

export interface PackManifest {
  name?: string;
  systemId: string;
  packId: string;
  packVersion: string;
  requiresBuiltin: string;
  payloadSha256: string;
  counts: Record<string, number>;
  notice: string;
}

/** A pack that passed validation, with every colliding or duplicate ref already dropped. */
export interface ValidatedPack {
  manifest: PackManifest;
  entries: PackEntry[];
  zhTW: Record<string, PackZhEntry>;
  wizard: Record<string, PackWizardItem[]>;
  /**
   * Keyed by built-in ref; `{}` for a v1 pack. Never copied into a character. The validator and
   * the cache read always set it; it is optional only for hand-built packs in tests.
   */
  overlays?: Record<string, PackOverlay>;
}

/** What every consumer of pack text reads: one validated pack, or several merged (`EffectivePacks.content`). */
export type PackContent = Omit<ValidatedPack, "manifest">;

/** A pack dropped from the merged view, with the pack (by `packId`) that supplies it instead. */
export interface ShadowedEntry {
  ref: string;
  by: string;
}

/**
 * The enabled packs of a device merged into one view (B-025): every entry identity once, the
 * built-in SRD first (the validator), then the packs in the user's order, top wins.
 */
export interface EffectivePacks {
  content: PackContent;
  /** The enabled packs' `packId`s, in priority order. */
  keys: string[];
  /** The pack that supplies each entry and overlay ref. */
  supplier: Record<string, string>;
  /** A ref dropped for a same-name entry of a higher pack → the winner's ref. */
  aliases: Record<string, string>;
  /** Per pack, what it carries that a higher pack supplies. */
  shadowed: Record<string, ShadowedEntry[]>;
  /**
   * The stamp of every ref a homebrew pack supplies in this view, after the merge (a shadowed
   * homebrew entry has none). `mergePacks` and `singlePackView` leave it unset; the host fills it.
   * A view without it has no homebrew.
   */
  homebrew?: Record<string, HomebrewStamp>;
}

export interface PackReport {
  bytes: number;
  /** Kept corpus entries per kind. */
  counts: Record<string, number>;
  /** Refs dropped: equal to a built-in ref (built-in wins), or repeated in the pack. */
  dropped: string[];
  /**
   * Entries dropped because a built-in entry of the same kind has the same English name (B-025),
   * with that built-in ref. Absent in records cached before; read as `[]`.
   */
  droppedByName?: Array<{ ref: string; builtinRef: string }>;
  /** Overlay keys dropped because they name no built-in ref (absent in records cached before v2). */
  droppedOverlays?: string[];
  /** The pack was built against another built-in ref list; still usable. */
  builtinMismatch: boolean;
}

export type PackErrorCode = "tooLarge" | "notJson" | "schema" | "wrongSystem" | "unsupportedVersion" | "shaMismatch";

export type PackValidation =
  | { ok: true; pack: ValidatedPack; report: PackReport }
  | { ok: false; error: PackErrorCode; detail?: string };
