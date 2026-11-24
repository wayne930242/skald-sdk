"use client";

import { useTranslations } from "next-intl";
import type { TableSetupEditorProps } from "@skald/sheet-sdk/modules/systems";
import { allowedSources, allowsDevicePacks, DEVICE_PACKS, sources, SRD } from "./sources";

export function SourceEditor({ config, onChange, disabled }: TableSetupEditorProps<string[]>) {
  const t = useTranslations();
  return <label className="grid gap-2 text-sm">
    {t("dndSources.label")}
    <select className="min-h-11 rounded-md border bg-background px-3 sm:w-80" disabled={disabled}
      value={allowsDevicePacks(config) ? DEVICE_PACKS : SRD}
      onChange={(event) => onChange(allowedSources(event.target.value === DEVICE_PACKS))}>
      {sources.map((source) => <option key={source.id} value={source.id}>{t(source.labelKey)}</option>)}
    </select>
  </label>;
}
