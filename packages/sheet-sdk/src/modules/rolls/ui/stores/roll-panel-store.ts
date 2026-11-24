// modules/rolls/ui/stores/roll-panel-store.ts
//
// 擲骰台的頁面記憶體：擲骰對象、最近 4 筆結果。不寫入任何儲存空間，
// 重新整理就清空。
//
// 放在 store 而不是 RollProvider 的 state，因為遊戲桌與浮動卡的 TemplateRenderer
// 各自可能掛自己的 RollProvider，而擲骰台只有一個：兩邊必須讀到同一份。
import { create } from "zustand";
import {
  appendRollHistory,
  type RollAudience,
  type RollPanelEntry,
} from "@skald/sheet-sdk/modules/rolls/domain/roll-panel";

interface RollPanelState {
  /** 遊戲桌內的擲骰對象；桌外沒有作用 */
  audience: RollAudience;
  /** 擲骰對象是在哪一桌選的；換桌就回到「所有人」 */
  audienceTableId: string | null;
  /** 擲骰台目前服務的角色；換角色就清掉結果 */
  hostCharacterId: string | null;
  /** 最近結果，最新的在最前面 */
  results: RollPanelEntry[];
  /** 使用者按了「關閉」；下一筆結果出現時再打開 */
  dismissed: boolean;
  /** 已掛載的擲骰台實例；只有第一個會顯示，避免兩個宿主同時出現兩個面板 */
  docks: string[];
  /**
   * 外掛後續（CoC 的 SAN 損失、傷害）的狀態，以結果 id 為鍵：已套用的變更與復原放在這裡，
   * 不放在元件裡，關掉卡片再打開、換宿主重掛都還在，同一個後續不會再提供一次。
   * 結果離開最近紀錄（或換桌、換角色）時一起丟掉。
   */
  followUps: Record<string, FollowUpState>;

  setAudience: (audience: RollAudience) => void;
  /**
   * 加入一桌：與上次不同的桌，擲骰對象回到「所有人」，最近結果與關閉狀態清掉。
   * 結果屬於桌：同一個角色換到另一桌時，上一桌的結果不能留著（「也在聊天裡」會說謊）。
   */
  bindTable: (tableId: string) => void;
  /** 擲骰台換宿主角色：結果與關閉狀態清掉（對象屬於桌，不清） */
  bindHostCharacter: (characterId: string | null) => void;
  recordResult: (entry: RollPanelEntry) => void;
  /** 就地更新一筆結果（孤注一擲、花幸運之後）；已不在最近紀錄裡的忽略 */
  patchEntry: (id: string, patch: Partial<RollPanelEntry>) => void;
  /** 一次花幸運：累計點數、成功等級移到新等級，並記住第一次花之前的等級 */
  applyLuckSpend: (id: string, spend: { level: string; cost: number }) => void;
  /** 把自動勾的「可成長」撤銷（只會撤銷一次） */
  undoImprove: (id: string) => void;
  /** 以最新的值同步更新一筆結果的後續狀態（元件已卸載也照樣寫入，進行中的套用不會遺失） */
  updateFollowUp: (id: string, update: (state: FollowUpState) => FollowUpState) => void;
  dismiss: () => void;
  claimDock: (id: string) => void;
  releaseDock: (id: string) => void;
  reset: () => void;
}

/** 一筆結果的後續狀態：外掛自己的純資料 */
export type FollowUpState = Readonly<Record<string, unknown>>;

const NO_FOLLOW_UP_STATE: FollowUpState = Object.freeze({});

/** 只留下仍在最近紀錄裡的結果的後續狀態 */
function keepFollowUps(
  followUps: Record<string, FollowUpState>,
  results: readonly RollPanelEntry[],
): Record<string, FollowUpState> {
  const ids = Object.keys(followUps);
  if (ids.every((id) => results.some((entry) => entry.id === id))) return followUps;
  return Object.fromEntries(
    ids.filter((id) => results.some((entry) => entry.id === id)).map((id) => [id, followUps[id]]),
  );
}

const INITIAL = {
  audience: "all" as RollAudience,
  audienceTableId: null as string | null,
  hostCharacterId: null as string | null,
  results: [] as RollPanelEntry[],
  dismissed: false,
  docks: [] as string[],
  followUps: {} as Record<string, FollowUpState>,
};

export const useRollPanelStore = create<RollPanelState>((set, get) => ({
  ...INITIAL,

  setAudience: (audience) => set({ audience }),
  bindTable: (tableId) => {
    if (get().audienceTableId === tableId) return;
    set({
      audienceTableId: tableId,
      audience: "all",
      results: [],
      dismissed: false,
      followUps: {},
    });
  },
  bindHostCharacter: (characterId) => {
    if (get().hostCharacterId === characterId) return;
    set({
      hostCharacterId: characterId,
      results: [],
      dismissed: false,
      followUps: {},
    });
  },
  recordResult: (entry) =>
    set((state) => {
      const results = appendRollHistory(state.results, entry);
      return { results, dismissed: false, followUps: keepFollowUps(state.followUps, results) };
    }),
  patchEntry: (id, patch) =>
    set((state) => ({
      results: state.results.map((entry) =>
        entry.id === id ? { ...entry, ...patch } : entry,
      ),
    })),
  applyLuckSpend: (id, spend) =>
    set((state) => ({
      results: state.results.map((entry) =>
        entry.id === id
          ? {
              ...entry,
              successLevel: spend.level,
              luckSpent: (entry.luckSpent ?? 0) + spend.cost,
              levelBeforeLuck: entry.levelBeforeLuck ?? entry.successLevel,
            }
          : entry,
      ),
    })),
  undoImprove: (id) => {
    const improve = get().results.find((entry) => entry.id === id)?.improve;
    if (!improve || improve.status !== "ticked") return;
    // 勾的列表已經卸載（換分頁重掛）：撤銷寫不進任何東西，不能說「已撤銷」，直接拿掉這行
    if (improve.isMounted && !improve.isMounted()) {
      set((state) => ({
        results: state.results.map((entry) =>
          entry.id === id ? { ...entry, improve: undefined } : entry,
        ),
      }));
      return;
    }
    // 先標記再執行，避免連點撤銷時寫兩次
    set((state) => ({
      results: state.results.map((entry) =>
        entry.id === id && entry.improve
          ? { ...entry, improve: { ...improve, status: "undone" as const } }
          : entry,
      ),
    }));
    improve.undo();
  },
  updateFollowUp: (id, update) =>
    set((state) => {
      if (!state.results.some((entry) => entry.id === id)) return state;
      const previous = state.followUps[id] ?? NO_FOLLOW_UP_STATE;
      const next = update(previous);
      return next === previous ? state : { followUps: { ...state.followUps, [id]: next } };
    }),
  dismiss: () => set({ dismissed: true }),
  claimDock: (id) =>
    set((state) =>
      state.docks.includes(id) ? state : { docks: [...state.docks, id] },
    ),
  releaseDock: (id) =>
    set((state) => ({ docks: state.docks.filter((dock) => dock !== id) })),
  reset: () => set({ ...INITIAL }),
}));
