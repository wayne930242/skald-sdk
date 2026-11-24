"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useHostPort } from "@skald/sheet-sdk/modules/systems/ui/host-ports";
import type { EffectivePacks } from "../content-pack/domain/types";
import { dndPackSourcePort } from "./pack-source-port";

/**
 * This device's enabled content packs as one view for the reference and compendium, through the
 * host's `dndPackSourcePort`: the cached copies at once, then one check of their links when a
 * picker opens (`revalidate`). Without the port, no pack: the views show the SRD alone. A pack that
 * cannot be read leaves the sheet on the SRD, as without one.
 */
export function useDevicePacks(): { packs: EffectivePacks | null; revalidate: () => void } {
  const source = useHostPort(dndPackSourcePort);
  const [packs, setPacks] = useState<EffectivePacks | null>(null);
  const revalidated = useRef(false);
  useEffect(() => {
    if (!source) return;
    let live = true;
    source.readCached().then((cached) => live && setPacks(cached), () => {});
    return () => {
      live = false;
    };
  }, [source]);
  const revalidate = useCallback(() => {
    if (!source || revalidated.current) return;
    revalidated.current = true;
    source.revalidate(setPacks).then(setPacks, () => {});
  }, [source]);
  return { packs, revalidate };
}
