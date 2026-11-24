import type * as React from "react";
import type { MoveDefinition } from "@skald/types/schema";
import type { useSchemaI18n } from "@skald/sheet-sdk/lib/i18n/use-schema-i18n";
import type { RollContextValue } from "@skald/sheet-sdk/modules/rolls/ui/context/roll-context";
import type { ViewMode } from "../../../schema-context";

export interface PlaybookData {
  id: string;
  name: { en: string; "zh-TW": string };
  moves: MoveDefinition[];
  [key: string]: unknown;
}

export function getLocalizedText(
  text: string | { en: string; "zh-TW": string } | undefined,
  locale: string,
): string {
  if (!text) return "";
  if (typeof text === "string") return text;
  return text[locale as "en" | "zh-TW"] || text.en;
}

export interface MoveViewProps {
  moves: MoveDefinition[];
  selectedMoves: string[];
  cardGridClass: string;
  viewMode: ViewMode;
  editable: boolean;
  locale: string;
  getStatLabel: (stat: string | undefined) => string;
}

export interface MoveRollProps {
  rollContext: RollContextValue | null;
  handleStatRoll: (stat: string, moveId: string, moveName: string, transformExpression?: (expression: string) => string) => Promise<void>;
}

export interface MoveDialogState {
  dialogOpen: boolean;
  setDialogOpen: React.Dispatch<React.SetStateAction<boolean>>;
  adjustedMaxSelected: number | undefined;
  t: ReturnType<typeof useSchemaI18n>["t"];
}
