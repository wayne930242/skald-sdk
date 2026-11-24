"use client";

import { useTranslations } from "next-intl";
import { DerivedValueView, type DerivedValueState } from "@skald/sheet-sdk/modules/character/ui/derived/derived-value";
import type { FateCharacterData } from "../../domain/character";
import { readFateResources, setFateRefreshOverride } from "../../domain/normalize";
import { FATE_REFRESH_ID } from "./derived";
import { useFatePlay, type FatePlayContextValue } from "./play-context";

/**
 * Refresh as B-024's derived value, from Fate's own accounting: auto = max(1, base + earned −
 * stunts over three), the override at `fateV2.refresh.override`. Writes go through the sheet's
 * update, so a read-only sheet gets no writer.
 */
export function fateRefreshState(data: FateCharacterData, play: Pick<FatePlayContextValue, "editable" | "update">): DerivedValueState {
  const resources = readFateResources(data);
  const write = (override: number | undefined) => play.update((previous) => setFateRefreshOverride(previous, override));
  return {
    fieldId: FATE_REFRESH_ID,
    value: resources.effectiveRefresh,
    auto: resources.autoRefresh,
    overridden: resources.refreshOverride !== undefined,
    setOverride: play.editable ? (value) => write(Number(value)) : undefined,
    restore: play.editable ? () => write(undefined) : undefined,
  };
}

/** The fate point card's refresh in edit mode: the value, its override and 恢復自動計算. */
export function FateRefreshEditor() {
  const t = useTranslations("fatePlay.derived");
  const play = useFatePlay();
  return (
    <div className="mt-2 rounded-lg border border-border px-2 @3xl:px-3">
      <DerivedValueView fieldId={FATE_REFRESH_ID} state={fateRefreshState(play.data, play)} label={t("refresh")} />
    </div>
  );
}
