"use client";

import { useMemo } from "react";
import { usePlay } from "./play-context";
import { sheetNamesFrom, type SheetNames } from "./sheet-names";
import type { CastingOptions } from "./casting-classes";

/**
 * The play view's names in the viewer's locale (built-in catalog plus the enabled packs' names) and
 * the casting options that read them and the packs' subclass entries.
 */
export function useSheetNames(): { names: SheetNames; casting: CastingOptions } {
  const { reference } = usePlay();
  return useMemo(() => {
    const names = sheetNamesFrom(reference.names as Record<string, Record<string, string> | undefined>);
    const metaOf = reference.packMetaOf;
    return { names, casting: { names, ...(metaOf ? { subclassMeta: (id: string) => metaOf(`subclass:${id}`) } : {}) } };
  }, [reference]);
}
