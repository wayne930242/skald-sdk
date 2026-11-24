// modules/character/ui/renderer/sheet-mode.tsx
//
// 宿主提供給 `views.web` 的狀態：操作模式與 GM 規則。
// 預設值讓沒有宿主的環境（預覽、單元測試）也能渲染。
"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { CampaignRules, SheetMode } from "@skald/types/schema";
import { InteractionModeContext } from "@skald/sheet-sdk/modules/rolls/ui/context/interaction-mode";

export type { InteractionMode } from "@skald/sheet-sdk/modules/rolls/ui/context/interaction-mode";

// One context for the sheet mode and the rolls' interaction mode (B-023): Rolls cannot depend on
// Character, so the context lives there and the sheet provides it.
const SheetModeContext = InteractionModeContext;

export function SheetModeProvider({
  mode,
  children,
}: {
  mode: SheetMode;
  children: ReactNode;
}) {
  return (
    <SheetModeContext.Provider value={mode}>
      {children}
    </SheetModeContext.Provider>
  );
}

/** 目前模式；沒有宿主提供時是 play */
export function useSheetMode(): SheetMode {
  return useContext(SheetModeContext);
}

/** B-023's agreed name: what a tap does on the sheet ("play" rolls or records, "edit" opens an editor). */
export const useSheetInteractionMode = useSheetMode;

/** `modes` 省略＝兩種模式都顯示 */
export function isVisibleInMode(
  modes: readonly SheetMode[] | undefined,
  mode: SheetMode,
): boolean {
  return !modes || modes.includes(mode);
}

/**
 * GM 規則。目前宿主都沒有提供，永遠是 null；
 * `slot: "campaign-rules"` 的區塊在 null 時不渲染。
 */
const CampaignRulesContext = createContext<CampaignRules | null>(null);

export const CampaignRulesProvider = CampaignRulesContext.Provider;

export function useCampaignRules(): CampaignRules | null {
  return useContext(CampaignRulesContext);
}
