"use client";

import { useEffect, useMemo, useState } from "react";
import type { FateCharacterData, FatePresetState } from "../../domain/character";
import { fateRecord } from "../../domain/normalize";
import { loadFatePresetCatalog, resolveFateRules, type FatePresetCatalog, type FateRules } from "../../domain/presets";

/** The roll-relevant rules: gear ratings and scale. Both off until the catalog says otherwise. */
export type FateRollRules = Pick<FateRules, "ratings" | "scale">;

export const FATE_ROLL_RULES_OFF: FateRollRules = {
  ratings: { id: "off", enabled: false },
  scale: { id: "off", enabled: false, tiers: [], modes: [] },
};

let catalogPromise: Promise<FatePresetCatalog> | null = null;

/** One catalog load per page; a failed chunk leaves the cache so the next mount retries. */
function loadCatalog(): Promise<FatePresetCatalog> {
  if (!catalogPromise) {
    const pending = loadFatePresetCatalog();
    catalogPromise = pending;
    pending.catch(() => {
      if (catalogPromise === pending) catalogPromise = null;
    });
  }
  return catalogPromise;
}

/** The character's preset selection resolved against the lazily loaded catalog. */
export function resolveFateRollRules(catalog: FatePresetCatalog | null, data: FateCharacterData): FateRollRules {
  if (!catalog) return FATE_ROLL_RULES_OFF;
  const preset = fateRecord(fateRecord(data.fateV2).preset) as Partial<FatePresetState>;
  const { rules } = resolveFateRules(catalog, preset);
  return { ratings: rules.ratings, scale: rules.scale };
}

/**
 * Rules for this character's rolls. Until the catalog arrives (or if it cannot load) gear and
 * scale count as off, which is the standard preset anyway: a tap roll never waits for it.
 */
export function useFateRollRules(data: FateCharacterData): FateRollRules {
  const [catalog, setCatalog] = useState<FatePresetCatalog | null>(null);
  useEffect(() => {
    let live = true;
    loadCatalog().then((loaded) => live && setCatalog(loaded), () => {});
    return () => {
      live = false;
    };
  }, []);
  const preset = fateRecord(data.fateV2).preset;
  // Only the preset selection matters: an FP change does not resolve the rules again.
  return useMemo(() => resolveFateRollRules(catalog, { fateV2: { preset } }), [catalog, preset]);
}
