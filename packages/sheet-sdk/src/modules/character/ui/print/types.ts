import type { ComponentType } from "react";
import type { LoadedSystem } from "@skald/types/system";
import type { CharacterFormulaRuntime, EditorHandlers, OptionSource } from "@skald/sheet-sdk/modules/sheet-schema";

/** What the sheet hands its print preview: the data on screen, unsaved edits included. */
export interface CharacterPrintProps {
  system: LoadedSystem;
  data: Record<string, unknown>;
  formulaRuntime?: CharacterFormulaRuntime;
  editable: boolean;
  setupMode: boolean;
  handlers?: EditorHandlers;
  optionSources?: OptionSource;
  onClose: () => void;
}

/** Loads the print preview on demand; the composition supplies it so the sheet never imports print code. */
export type OpenPrint = () => Promise<ComponentType<CharacterPrintProps>>;
