"use client";

import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { SlidersHorizontal } from "lucide-react";
import { TEXT_BUTTON } from "../play/card-styles";
import { useFatePlay } from "../play/play-context";
import { FateFeatureScope, type FateFeatureResources } from "./feature-scope";

const PresetDialog = lazy(() => import("./preset-dialog").then(module => ({ default: module.FatePresetDialog })));

/** F9 presets slot: play and read-only never mount either the entry or its editor. */
export function FatePresetsEntry() {
  const { editable, structural } = useFatePlay();
  return editable && structural ? <FateFeatureScope feature="presets">{resources => <Entry {...resources} />}</FateFeatureScope> : null;
}

/**
 * The recipe button, and the roster editor's host: in edit mode a ladder chip opens the same
 * dialog at its skill (B-023), and focus goes back to that chip when it closes.
 */
function Entry(resources: FateFeatureResources) {
  const t = useTranslations("fatePresets");
  const { provideSkillEditor } = useFatePlay();
  const [open, setOpen] = useState<{ skillId?: string } | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const chipOpener = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!provideSkillEditor) return;
    provideSkillEditor((skillId, chip) => {
      const active = document.activeElement;
      opener.current = active instanceof HTMLElement && active !== document.body ? active : null;
      chipOpener.current = chip;
      setOpen({ skillId });
    });
    return () => provideSkillEditor(null);
  }, [provideSkillEditor]);
  const restoreFocus = () => {
    // The chip pressed wins: Safari leaves focus elsewhere on a mouse click (REV2-F001)
    [chipOpener.current, opener.current, trigger.current].find((element) => element?.isConnected)?.focus();
  };
  return <>
    <button ref={trigger} type="button" className={TEXT_BUTTON} onClick={() => {
      opener.current = null;
      chipOpener.current = null;
      setOpen({});
    }}>
      <SlidersHorizontal size={16} aria-hidden />{t("open")}
    </button>
    {open && <Suspense fallback={null}>
      <PresetDialog {...resources} focusSkill={open.skillId} close={() => setOpen(null)} restoreFocus={restoreFocus} />
    </Suspense>}
  </>;
}
