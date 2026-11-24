"use client";

import { useState } from "react";

/**
 * `onCloseAutoFocus` for a Fate roll dialog. Radix Dialog's own close handler focuses its
 * `DialogTrigger`, and these dialogs (opened by a roll gesture or a tray button) have none, so
 * focus fell to the page body. This puts it back on the control that had focus when the dialog
 * mounted, while that control is still on the page.
 */
export function useReturnFocus(): (event: Event) => void {
  const [opener] = useState(() => (typeof document === "undefined" ? null : (document.activeElement as HTMLElement | null)));
  return (event) => {
    if (!opener?.isConnected || opener === document.body) return;
    event.preventDefault();
    opener.focus();
  };
}
