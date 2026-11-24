"use client";

import { createContext, useContext, type ComponentType, type ReactNode } from "react";
import type { Field, Schema, Section } from "@skald/types/schema";
import type { CharacterFormulaRuntime } from "@skald/sheet-sdk/modules/sheet-schema";

export interface PrintFieldGateProps {
  /** The field's value path in the data */
  path: string;
  type: Field["type"];
  printHidden?: boolean;
  /** A formula computes the field */
  derived: boolean;
  /** A System-scoped renderer draws the field and may show more than its own value: never empty */
  systemDrawn: boolean;
  children: ReactNode;
}

export interface PrintSectionContext {
  schema: Pick<Schema, "fields">;
  data: Record<string, unknown>;
  formulaRuntime?: CharacterFormulaRuntime;
  /** A System-scoped renderer draws this field (see `PrintFieldGateProps.systemDrawn`) */
  systemDraws?: (type: Field["type"], fieldId: string) => boolean;
}

/**
 * Generic print: a print document's `TemplateRenderer` omits what would print as an empty line.
 * The rules live with the print code (`modules/character/ui/print`) and arrive through this context,
 * so the sheet's first load carries only the context. Absent everywhere else: the sheet, the editor
 * and the legacy CoC print render as before.
 */
export interface PrintHygiene {
  /** False when the player keeps the blanks to write in by hand; `printHidden` still applies. */
  readonly omitEmpty: boolean;
  /** Renders a field unless the print document omits it */
  readonly FieldGate: ComponentType<PrintFieldGateProps>;
  /** A section whose fields were all omitted */
  omitsSection(section: Pick<Section, "children">, context: PrintSectionContext): boolean;
}

export const PrintHygieneContext = createContext<PrintHygiene | null>(null);

export function usePrintHygiene(): PrintHygiene | null {
  return useContext(PrintHygieneContext);
}
