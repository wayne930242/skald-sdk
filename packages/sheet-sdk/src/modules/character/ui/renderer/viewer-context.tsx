// modules/character/ui/renderer/viewer-context.tsx
//
// Who is looking at the sheet, as the host already knows it: the card's owner, the table's GM.
// Presentation only, not access control: what a system hides with it (for example secret
// aspects) still reaches the client in the character data. Authorization stays in the
// database (RLS, can_edit_character).
//
// Each key is `undefined` when the host does not know it (public share, preview, editor):
// read `undefined` as unknown, never as false or true. `{}` is the default.
"use client";

import { createContext, useContext } from "react";

export interface SheetViewer {
  /** The viewer owns this character; `undefined` = unknown */
  isOwner?: boolean;
  /** The viewer is the GM of the table this copy plays at; `undefined` = unknown */
  isGM?: boolean;
  /**
   * The host's own header already shows the character's portrait, so a system can drop its
   * duplicate; `undefined` = unknown (keep showing it). Display only.
   */
  hostShowsPortrait?: boolean;
}

const UNKNOWN_VIEWER: SheetViewer = Object.freeze({});

export const SheetViewerContext = createContext<SheetViewer>(UNKNOWN_VIEWER);

/** The host's viewer; `{}` (every role unknown) without a host. Display only. */
export function useSheetViewer(): SheetViewer {
  return useContext(SheetViewerContext);
}
