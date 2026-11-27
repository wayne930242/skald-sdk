/**
 * This device's content packs, which only the host can read (Skald keeps the pack list and cache
 * in the browser, behind its sign-in). The sheet and the print read them through
 * `dndPackSourcePort`; a host without packs (a test) leaves it out, and every view shows the SRD
 * alone. The SDK previewer serves packs loaded from local files (`content-pack/open/`).
 *
 * A view (`EffectivePacks`) is the enabled packs merged: their entries, names, overlays and text.
 * The reference reads names and overlays from it, and a pack row that holds no text (a table
 * copy's, D9) shows the viewer's own pack text through `PackTextIndex.rowText` over it. A later
 * need of the packs extends `EffectivePacks` or adds a member here.
 *
 * A table copy's sheet and print pass a `PackScope` when the table's setup takes the GM's homebrew
 * (`gm-homebrew`, ADR 0018 homebrew step 8): Skald's host then puts the table's shared copies first
 * in the view, so they win a same-name clash with the viewer's own packs. A host without table
 * content (the SDK previewer) ignores the scope.
 */
import { defineHostPort } from "@skald/sheet-sdk/modules/systems/ui/host-ports";
import type { EffectivePacks } from "../content-pack/domain/types";

/** The table whose shared GM homebrew a view includes; only given when the table's setup takes it. */
export interface PackScope {
  readonly tableId: string;
}

export interface DndPackSource {
  /** The enabled packs from this browser's cache alone, no sign-in, database or network request; null without any. */
  readCached(scope?: PackScope): Promise<EffectivePacks | null>;
  /**
   * Checks the enabled packs' links (and a scope's table homebrew) for updates in the background.
   * `onUpdated` receives the view after each pack that changed; the promise settles with the view as
   * it is now.
   */
  revalidate(onUpdated: (packs: EffectivePacks | null) => void, scope?: PackScope): Promise<EffectivePacks | null>;
  /**
   * The display names the host gives packs, by `packId`, in `locale`, for the reference's
   * "Pack: …" badge. Without it, or for a pack it does not name, the badge shows the pack's id.
   * With a scope, a table with two or more sharers names each share by its sharer.
   */
  packNames?(locale: string, scope?: PackScope): Promise<Readonly<Record<string, string>>>;
}

export const dndPackSourcePort = defineHostPort<DndPackSource>("dnd5e.packSource");
