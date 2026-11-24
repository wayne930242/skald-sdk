"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * What a tap on the sheet does (B-023): "play" rolls or records, "edit" opens the value's editor.
 *
 * The gesture contract in edit mode, which every sheet roll gesture follows (`useRollGesture`, and
 * a system's own such as Fate's `useFateRollGesture`):
 * - a tap, Enter, Space, Shift+Enter and the context-menu key call the control's `onEdit`, never a roll;
 * - a long-press does nothing;
 * - a right-click is never `preventDefault`ed: it is the browser's menu;
 * - `aria-haspopup` and `aria-keyshortcuts` are unset, no options dialog or hint renders, nothing preloads;
 * - a control given no `onEdit` keeps rolling in both modes (a system that has not adopted).
 *
 * Read-only hosts (a GM viewing a player's sheet, a table copy) are always "play": rolls work,
 * and writes are blocked by the host's `editable`, which is not part of this mode.
 */
export type InteractionMode = "play" | "edit";

/** The sheet's mode. Character's `SheetModeProvider` provides this same context. */
export const InteractionModeContext = createContext<InteractionMode>("play");

/**
 * A template form's edit mode (the sheet's setup mode), for its rollables only. The form's field
 * renderers keep reading the sheet mode, so their edit-mode DOM does not change with it.
 */
const FormInteractionModeContext = createContext<InteractionMode>("play");

export function FormInteractionModeProvider({ mode, children }: { mode: InteractionMode; children: ReactNode }) {
  return <FormInteractionModeContext.Provider value={mode}>{children}</FormInteractionModeContext.Provider>;
}

/** The mode a roll control follows: edit when the sheet or the template form around it is in edit mode. */
export function useRollInteractionMode(): InteractionMode {
  const sheet = useContext(InteractionModeContext);
  const form = useContext(FormInteractionModeContext);
  return sheet === "edit" || form === "edit" ? "edit" : "play";
}
