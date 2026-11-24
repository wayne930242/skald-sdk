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
 */
import { defineHostPort } from "@skald/sheet-sdk/modules/systems/ui/host-ports";
import type { EffectivePacks } from "../content-pack/domain/types";

export interface DndPackSource {
  /** The enabled packs from this browser's cache alone, no sign-in, database or network request; null without any. */
  readCached(): Promise<EffectivePacks | null>;
  /**
   * Checks the enabled packs' links for updates in the background. `onUpdated` receives the view
   * after each pack that changed; the promise settles with the view as it is now.
   */
  revalidate(onUpdated: (packs: EffectivePacks | null) => void): Promise<EffectivePacks | null>;
  /**
   * The display names the host gives packs, by `packId`, in `locale`, for the reference's
   * "Pack: …" badge. Without it, or for a pack it does not name, the badge shows the pack's id.
   */
  packNames?(locale: string): Promise<Readonly<Record<string, string>>>;
}

export const dndPackSourcePort = defineHostPort<DndPackSource>("dnd5e.packSource");
