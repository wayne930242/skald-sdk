"use client";

import type { ReactNode } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@skald/sheet-sdk/components/ui/dialog";

export const FATE_CONTROL = "min-h-11 min-w-0 max-w-full rounded-md border border-border bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60";

export function FateDialog({ title, description, close, restoreFocus, children }: {
  title: string; description?: string; close: () => void; restoreFocus: () => void; children: ReactNode;
}) {
  return <Dialog open onOpenChange={open => { if (!open) close(); }}>
    <DialogContent showCloseButton={false} {...(description ? {} : { "aria-describedby": undefined })} onCloseAutoFocus={event => { event.preventDefault(); restoreFocus(); }}
      className="top-auto bottom-0 max-h-[90dvh] w-full max-w-none translate-y-0 overflow-y-auto rounded-t-xl rounded-b-none sm:top-1/2 sm:bottom-auto sm:max-w-2xl sm:-translate-y-1/2 sm:rounded-xl">
      <header className="space-y-2">
        <DialogTitle className="font-display text-xl">{title}</DialogTitle>
        {description && <DialogDescription>{description}</DialogDescription>}
      </header>
      {children}
    </DialogContent>
  </Dialog>;
}