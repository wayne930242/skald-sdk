// modules/rolls/ui/context/roll-shortcuts.tsx
"use client";

import * as React from "react";
import { useRollShortcutStore, type RollShortcut } from "@skald/sheet-sdk/modules/rolls/ui/stores/roll-shortcut-store";

interface RollShortcutScopeValue {
  characterId: string;
}

const RollShortcutScopeContext = React.createContext<RollShortcutScopeValue | null>(null);

/**
 * 標出「這張卡是擲骰者自己的卡」：只有它底下的技能列表會把技能登記給聊天欄的常用技能 chip。
 * 隊友的卡（characterId 傳 null）、桌外的角色卡頁沒有這層，登記就是空操作。
 */
export function RollShortcutScope({
  characterId,
  children,
}: {
  characterId: string | null;
  children: React.ReactNode;
}) {
  const value = React.useMemo(() => (characterId ? { characterId } : null), [characterId]);
  return (
    <RollShortcutScopeContext.Provider value={value}>
      {children}
    </RollShortcutScopeContext.Provider>
  );
}

/**
 * 把這個列表目前擲得出的技能登記給聊天欄；列表變動時更新、卸載時撤掉。
 * 不在 RollShortcutScope 裡什麼都不做。`shortcuts` 傳 null 表示現在擲不出（沒有擲骰環境、
 * 會開對話框的列）。
 */
export function useRollShortcuts(shortcuts: RollShortcut[] | null) {
  const scope = React.useContext(RollShortcutScopeContext);
  const sourceId = React.useId();
  const characterId = scope?.characterId;

  // 列表變動只更新登記，不先撤掉再登記：撤掉那一下會讓聊天欄的 chip 閃一次、白重畫
  React.useEffect(() => {
    const store = useRollShortcutStore.getState();
    if (!characterId || !shortcuts) {
      store.removeSource(sourceId);
      return;
    }
    store.setSource(sourceId, characterId, shortcuts);
  }, [characterId, shortcuts, sourceId]);

  React.useEffect(() => () => useRollShortcutStore.getState().removeSource(sourceId), [sourceId]);
}
