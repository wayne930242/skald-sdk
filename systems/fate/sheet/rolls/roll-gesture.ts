"use client";

import type { KeyboardEvent, MouseEvent } from "react";
import { useRollInteractionMode } from "@skald/sheet-sdk/modules/rolls/ui/context/interaction-mode";
import { useLongPress } from "@skald/sheet-sdk/modules/rolls/ui/dice/use-long-press";

export interface FateRollGestureOptions {
  /** Tap, click, Enter or Space: roll now with the defaults. */
  onRoll: () => void;
  /** Long press, right click, Shift+Enter or the menu key: open the options, never roll. */
  onOptions: () => void;
  /** Off (no roller, nothing to roll with): the gestures do nothing and the browser menu stays. */
  enabled: boolean;
  /**
   * Edit mode's tap target (B-023): the control's existing editor. Without one the control does
   * nothing in edit mode (Fate has adopted, so it never rolls there).
   */
  onEdit?: (chip: HTMLElement) => void;
}

/**
 * The one roll gesture of the Fate v2 sheet (B-022), shared by every Fate roll affordance. It
 * wraps the shared `useLongPress` primitive and mirrors `useRollGesture`'s suppression: the click
 * a browser sends after a long press, and the press Android's context menu takes over, never roll.
 * Unlike `useRollGesture` it opens Fate's own options, not the CoC options dialog.
 *
 * In edit mode (`useRollInteractionMode`) it follows the gesture contract on `InteractionMode`: a
 * tap, Enter, Space, Shift+Enter and the menu key call `onEdit`, never a roll; a long press does
 * nothing; a right click stays the browser's; no popup or shortcut is announced; nothing opens the
 * options. `editing` tells the control to name and draw itself as an editor.
 */
export function useFateRollGesture({ onRoll, onOptions, enabled: requested, onEdit }: FateRollGestureOptions) {
  const editing = useRollInteractionMode() === "edit";
  const enabled = requested && !editing;
  const longPress = useLongPress(onOptions, enabled);

  const onClick = (event: MouseEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (editing) {
      longPress.consumeLongPress();
      onEdit?.(event.currentTarget);
      return;
    }
    // The click after a long press: the options are already open.
    if (longPress.consumeLongPress() || !enabled) return;
    onRoll();
  };

  const onContextMenu = (event: MouseEvent) => {
    if (!enabled) return;
    event.preventDefault();
    event.stopPropagation();
    longPress.takeOverPress();
    onOptions();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (editing) {
      if (event.key !== "Enter" && event.key !== " " && event.key !== "ContextMenu") return;
      event.preventDefault();
      event.stopPropagation();
      onEdit?.(event.currentTarget);
      return;
    }
    if (!enabled) return;
    if (event.key === "ContextMenu" || (event.key === "Enter" && event.shiftKey)) {
      event.preventDefault();
      event.stopPropagation();
      onOptions();
      return;
    }
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onRoll();
  };

  return {
    editing,
    props: {
      onClick,
      onContextMenu,
      onKeyDown,
      ...longPress.handlers,
      "aria-haspopup": enabled ? ("dialog" as const) : undefined,
      "aria-keyshortcuts": enabled ? "Shift+Enter" : undefined,
    },
  };
}
