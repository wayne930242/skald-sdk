"use client";

import { useMemo } from "react";
import { useLocale } from "next-intl";
import type { LoadedSystem } from "@skald/types/system";
import type { EditorHandlers } from "@skald/sheet-sdk/modules/sheet-schema";
import type { SheetAdapterInput, SheetAdapterOutput } from "@skald/sheet-sdk/modules/systems/ui/system-plugin-ui";
import { FATE_PLAY_FIELDS } from "./play/play-model";
import { loadFatePlayMessages } from "./play/play-messages";
import { loadFatePlayRules } from "./play/play-rules";
import { FatePlayView } from "./play/play-view";

const NO_HANDLERS: EditorHandlers = {};

/**
 * The B view is the built-in Fate Condensed template's presentation: a fork, a user template or
 * another System keeps its own layout (fields it added would not show). It needs the v1 field
 * contract, which v2 keeps, not v2-only keys: an old Template Version still gets the view.
 */
export function supportsFatePlayView(system: LoadedSystem): boolean {
  if (system.runtime?.builtinTemplate !== true || system.config?.id !== "fate-condensed") return false;
  const fields = system.schema?.fields ?? {};
  return FATE_PLAY_FIELDS.every((id) => Object.hasOwn(fields, id));
}

/**
 * Fate sheet adapter: the B play view where supported. The rules reader opens from inside the
 * view, so the adapter has no dialogs. The view serves play and edit (`playViewModes: "both"`):
 * edit mode turns on setup controls in the same cards; print keeps the template.
 */
export function useFateSheetAdapter({ system, initialData }: SheetAdapterInput): SheetAdapterOutput {
  const playable = useMemo(() => supportsFatePlayView(system), [system]);
  // Start the play labels and preset rules with the sheet: the view mounts once the character
  // data is in.
  const locale = useLocale();
  if (playable) {
    void loadFatePlayMessages(locale);
    void loadFatePlayRules(locale);
  }
  return {
    handlers: NO_HANDLERS,
    // The host's data (a cloud character's server copy, the preview's) seeds the sheet, as the
    // generic adapter does.
    defaultData: initialData || system.defaultData,
    playView: playable ? <FatePlayView system={system} /> : undefined,
    ...(playable ? { playViewModes: "both" as const } : {}),
    dialogs: null,
  };
}
