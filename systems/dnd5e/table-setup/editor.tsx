"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@skald/sheet-sdk/components/ui/alert-dialog";
import { Checkbox } from "@skald/sheet-sdk/components/ui/checkbox";
import { Label } from "@skald/sheet-sdk/components/ui/label";
import type { TableSetupEditorProps } from "@skald/sheet-sdk/modules/systems";
import { useHostPort } from "@skald/sheet-sdk/modules/systems/ui/host-ports";
import { dndHomebrewStorePort } from "../homebrew/store-port";
import { dndTableHomebrewPort } from "../homebrew/table-share-port";
import { GmHomebrewPicker } from "./gm-homebrew-picker";
import { allowedSources, allowsDevicePacks, allowsGmHomebrew } from "./sources";
import { useGmHomebrewShare } from "./use-gm-homebrew-share";

/**
 * D&D's content sources: the SRD always, players' own packs, and 「GM 的自製內容」 with its share
 * picker. The GM option needs the host's table homebrew port and homebrew store; a host without
 * them (the SDK previewer) does not offer it.
 */
export function SourceEditor({ config, onChange, disabled, tableId, registerAfterSave }: TableSetupEditorProps<string[]>) {
  const t = useTranslations();
  const port = useHostPort(dndTableHomebrewPort);
  const store = useHostPort(dndHomebrewStorePort);
  const offersGm = !!port && !!store;
  const device = allowsDevicePacks(config);
  const gm = offersGm && allowsGmHomebrew(config);
  const share = useGmHomebrewShare({ port: offersGm ? port : null, store: offersGm ? store : null, tableId, ticked: gm, registerAfterSave });
  const [confirmUntick, setConfirmUntick] = useState(false);

  const list = share.snapshot?.list;
  const untickGm = () => {
    if (list && list.shares.length > 0) setConfirmUntick(true);
    else onChange(allowedSources(device, false));
  };

  return (
    <fieldset className="grid gap-3 text-sm" disabled={disabled}>
      <legend className="mb-2">{t("dndSources.label")}</legend>
      <Source id="dnd-source-srd" label={t("dndSources.options.srd")} checked disabled />
      <Source id="dnd-source-device" label={t("dndSources.options.device")} checked={device} disabled={disabled}
        onChange={(on) => onChange(allowedSources(on, gm))} />
      {offersGm && (
        <>
          <Source id="dnd-source-gm" label={t("dndSources.options.gm")} hint={t("dndSources.gmHint")} checked={gm} disabled={disabled}
            onChange={(on) => (on ? onChange(allowedSources(device, true)) : untickGm())} />
          {gm && <GmHomebrewPicker share={share} disabled={disabled} />}
          <AlertDialog open={confirmUntick} onOpenChange={setConfirmUntick}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("dndShare.untick.title")}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t(list && list.viewerId === list.ownerId ? "dndShare.untick.owner" : "dndShare.untick.assistant")}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("dndShare.untick.cancel")}</AlertDialogCancel>
                <AlertDialogAction onClick={() => onChange(allowedSources(device, false))}>{t("dndShare.untick.confirm")}</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </fieldset>
  );
}

function Source({ id, label, hint, checked, disabled, onChange }: {
  id: string;
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onChange?: (on: boolean) => void;
}) {
  return (
    <div className="flex min-h-11 items-start gap-3">
      <Checkbox id={id} className="mt-0.5" checked={checked} disabled={disabled || !onChange}
        aria-describedby={hint ? `${id}-hint` : undefined} onCheckedChange={(value) => onChange?.(value === true)} />
      <div className="grid gap-1">
        <Label htmlFor={id} className="font-normal">{label}</Label>
        {hint && <span id={`${id}-hint`} className="text-xs text-muted-foreground">{hint}</span>}
      </div>
    </div>
  );
}
