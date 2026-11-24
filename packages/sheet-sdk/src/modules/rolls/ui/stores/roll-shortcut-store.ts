// modules/rolls/ui/stores/roll-shortcut-store.ts
//
// 角色卡上「現在擲得出的技能」：技能列表（coc-skill-list、stat-list 的列）把自己登記進來，
// 聊天欄的常用技能 chip 從這裡取得數值與擲骰函式。
//
// 為什麼是 store：聊天欄與角色卡宿主（RollProvider 所在）是 page-client 底下的兩棵子樹，
// 沒有共同的 React 祖先能放 context。chip 一按就呼叫該列自己的擲骰函式——也就是卡上
// 點那個技能走的同一條路（RollProvider.executeRoll，帶擲骰對象、下一擲、成長勾），
// 這裡不另外擲骰。
//
// 只有擁有者自己的卡會登記（見 RollShortcutScope），所以隊友的卡不會出現在 chip 裡。
import { create } from "zustand";

export interface RollShortcut {
  /** 技能的顯示名稱（目前語言）；也是 chip 上的字，沒有 key 的舊歷史紀錄靠它比對 */
  label: string;
  /**
   * 技能的穩定 key（技能 id、列 id），也就是擲骰時交給 RollProvider 的 rollKey。
   * 擲骰訊息的 skillName 是擲當時的語言，換語言或翻譯組後對不上；chip 優先用 key 對歷史紀錄。
   */
  key?: string;
  /** 卡上目前的目標值；沒有就不顯示 */
  value?: number;
  /** 擲這個技能。呼叫時才讀卡的最新資料，不是登記當下的 */
  roll: () => void;
}

interface RollShortcutSource {
  characterId: string;
  shortcuts: RollShortcut[];
}

interface RollShortcutState {
  /** 每個登記來源（一個技能列表或一列）目前擲得出的技能 */
  sources: Record<string, RollShortcutSource>;
  setSource: (id: string, characterId: string, shortcuts: RollShortcut[]) => void;
  removeSource: (id: string) => void;
  reset: () => void;
}

/**
 * 名稱、key 與數值都沒變就視為同一份登記。`roll` 不比：登記的 roll 都在呼叫當下才讀卡的最新資料
 * （見 RollShortcut.roll），舊的那個照樣擲得對。
 */
function sameShortcuts(
  current: RollShortcutSource,
  characterId: string,
  next: RollShortcut[],
): boolean {
  return (
    current.characterId === characterId &&
    current.shortcuts.length === next.length &&
    current.shortcuts.every((item, index) => {
      return (
        item.label === next[index].label &&
        item.key === next[index].key &&
        item.value === next[index].value
      );
    })
  );
}

export const useRollShortcutStore = create<RollShortcutState>((set) => ({
  sources: {},
  setSource: (id, characterId, shortcuts) =>
    set((state) => {
      // 卡上改一個無關的欄位，列表會重算出內容相同的新陣列；不換掉就不會通知聊天欄重畫
      const current = state.sources[id];
      if (current && sameShortcuts(current, characterId, shortcuts)) return state;
      return { sources: { ...state.sources, [id]: { characterId, shortcuts } } };
    }),
  removeSource: (id) =>
    set((state) => {
      if (!(id in state.sources)) return state;
      const { [id]: _removed, ...rest } = state.sources;
      return { sources: rest };
    }),
  reset: () => set({ sources: {} }),
}));

/** 某個角色目前所有來源合併後的技能，名稱相同時後登記的優先 */
export function shortcutsForCharacter(
  sources: Record<string, RollShortcutSource>,
  characterId: string | undefined,
): Map<string, RollShortcut> {
  const merged = new Map<string, RollShortcut>();
  if (!characterId) return merged;
  for (const source of Object.values(sources)) {
    if (source.characterId !== characterId) continue;
    for (const shortcut of source.shortcuts) merged.set(shortcut.label, shortcut);
  }
  return merged;
}
