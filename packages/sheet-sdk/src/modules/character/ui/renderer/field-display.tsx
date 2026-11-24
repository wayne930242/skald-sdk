// modules/character/ui/renderer/field-display.tsx
//
// `FieldReference.display`（已依容器斷點解析）交給欄位 renderer 的管道。
// renderer 只收得到 `field`，所以顯示變體走 context，不改 registry 的簽章。
// 舊版面（沒有斷點 context）從不提供值，renderer 讀到 undefined 就照舊渲染。
"use client";

import { createContext, useContext } from "react";

const FieldDisplayContext = createContext<string | undefined>(undefined);

export const FieldDisplayProvider = FieldDisplayContext.Provider;

/** 目前欄位的顯示變體（例如 "tile"）；沒有指定時為 undefined */
export function useFieldDisplay(): string | undefined {
  return useContext(FieldDisplayContext);
}
