"use client";

import { useCallback, useEffect, useState } from "react";
import { useHostPort } from "@skald/sheet-sdk/modules/systems/ui/host-ports";
import type { EffectivePacks } from "../content-pack/domain/types";
import { dndPackSourcePort, type PackScope } from "./pack-source-port";

/**
 * This device's enabled content packs as one view for the reference and compendium, through the
 * host's `dndPackSourcePort`: the cached copies at once, then one check of their links when a
 * picker opens (`revalidate`). Without the port, no pack: the views show the SRD alone. A pack that
 * cannot be read leaves the sheet on the SRD, as without one.
 *
 * With a `scope` (a table copy whose setup takes the GM's homebrew), the view holds the table's
 * shared copies too: the mount reads them from the cache, and once a picker has asked for a check,
 * a scope that arrives or changes later is checked as well.
 */
export function useDevicePacks(scope?: PackScope): { packs: EffectivePacks | null; revalidate: () => void } {
  const source = useHostPort(dndPackSourcePort);
  const [packs, setPacks] = useState<EffectivePacks | null>(null);
  const [checked, setChecked] = useState(false);
  const tableId = scope?.tableId;
  useEffect(() => {
    if (!source) return;
    let live = true;
    const show = (view: EffectivePacks | null) => {
      if (live) setPacks(view);
    };
    const scoped = tableId === undefined ? [] : ([{ tableId }] as const);
    const read = checked ? source.revalidate(show, ...scoped) : source.readCached(...scoped);
    read.then(show, () => {});
    return () => {
      live = false;
    };
  }, [source, checked, tableId]);
  const revalidate = useCallback(() => {
    if (source) setChecked(true);
  }, [source]);
  return { packs, revalidate };
}
