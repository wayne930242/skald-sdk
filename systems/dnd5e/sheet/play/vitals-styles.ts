"use client";

import { useTranslations } from "next-intl";
import { useOpenDndEditor, usePlayEditing } from "./play-context";
import type { EditTarget } from "./edit-layer";

/** The vitals card and its tiles (frames 05 and 07), shared by the vitals bar and the hit dice. */
export const PANEL = "rounded-xl border border-border bg-card";
export const TILE = "flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg bg-muted/50 px-2 py-1.5 text-center";
export const TILE_LABEL = "max-w-full text-balance text-xs leading-tight text-muted-foreground";
export const TILE_VALUE = "whitespace-nowrap text-xl font-semibold leading-tight tabular-nums";

/** B-023: in edit mode a play control opens its value's editor; its name says so. */
export function useEditTap(target: EditTarget, name: string) {
  const tRenderer = useTranslations("renderer");
  const editing = usePlayEditing();
  const open = useOpenDndEditor();
  return editing ? { onClick: () => open(target), label: tRenderer("editValue", { name }) } : null;
}
