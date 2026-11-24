// modules/rolls/ui/stores/dice-roller-store.ts
import { create } from "zustand";
import type {
  DiceRoll,
  SkillCheckRoll,
  SimpleDiceRoll,
  DiceVisibility,
  SuccessLevel,
} from "@skald/dice";
import type { DiceBoxResult } from "@skald/sheet-sdk/modules/rolls/domain/dice-box-result";

/**
 * 擲骰選項
 */
export interface RollOptions {
  /** 技能名稱（用於技能檢定顯示） */
  skillName?: string;
  /** 目標值（用於技能檢定） */
  targetValue?: number;
  /** 成功等級（用於技能檢定） */
  successLevel?: SuccessLevel;
  /** 可見性設定 */
  visibility?: DiceVisibility;
  /** 角色 ID */
  characterId?: string;
  /** 角色名稱 */
  characterName?: string;
}

/**
 * Dice Roller Ref 介面（與 DiceTableCanvas 相容）
 */
export interface DiceRollerRef {
  roll: (notation: string) => Promise<DiceBoxResult[] | null>;
  isReady: boolean;
}

interface DiceRollerState {
  /** Dice roller ref（由 DiceTableCanvas 註冊） */
  rollerRef: DiceRollerRef | null;

  /** 當前用戶 ID（用於發送擲骰訊息） */
  userId: string | null;
  /** 當前用戶名稱 */
  userName: string | null;

  /** 擲骰結果回調（用於發送到聊天室） */
  onRollResult: ((roll: DiceRoll) => void) | null;

  /** 註冊 Dice Roller */
  registerRoller: (ref: DiceRollerRef) => void;

  /** 取消註冊 */
  unregisterRoller: () => void;

  /** 設定用戶資訊 */
  setUser: (userId: string, userName: string) => void;

  /** 設定擲骰結果回調 */
  setOnRollResult: (callback: ((roll: DiceRoll) => void) | null) => void;

  /** 執行擲骰（統一入口） */
  roll: (
    notation: string,
    options?: RollOptions,
  ) => Promise<DiceBoxResult[] | null>;

  /** 執行技能檢定擲骰 */
  rollSkillCheck: (
    skillName: string,
    targetValue: number,
    successLevel: SuccessLevel,
    options?: Omit<RollOptions, "skillName" | "targetValue" | "successLevel">,
  ) => Promise<void>;
}

export const useDiceRollerStore = create<DiceRollerState>((set, get) => ({
  rollerRef: null,
  userId: null,
  userName: null,
  onRollResult: null,

  registerRoller: (ref) => {
    set({ rollerRef: ref });
    console.log("[DiceRollerStore] Roller registered");
  },

  unregisterRoller: () => {
    set({ rollerRef: null });
    console.log("[DiceRollerStore] Roller unregistered");
  },

  setUser: (userId, userName) => {
    set({ userId, userName });
  },

  setOnRollResult: (callback) => {
    set({ onRollResult: callback });
  },

  roll: async (notation, options = {}) => {
    const { rollerRef, userId, userName, onRollResult } = get();

    if (!rollerRef?.isReady) {
      console.warn("[DiceRollerStore] Roller not ready");
      return null;
    }

    // 執行 3D 骰子動畫
    const results = await rollerRef.roll(notation);
    if (!results || results.length === 0) return null;

    // 如果有回調且有用戶資訊，發送擲骰結果
    if (onRollResult && userId && userName) {
      const rollResult = results[0];

      if (
        options.skillName &&
        options.targetValue !== undefined &&
        options.successLevel
      ) {
        // 技能檢定
        const skillCheckRoll: SkillCheckRoll = {
          id: crypto.randomUUID(),
          type: "skill_check",
          timestamp: new Date(),
          rollerId: userId,
          rollerName: userName,
          characterId: options.characterId,
          characterName: options.characterName,
          skillName: options.skillName,
          targetValue: options.targetValue,
          roll: rollResult.total,
          successLevel: options.successLevel,
          selectedUnits: rollResult.total % 10,
          selectedTens: Math.floor(rollResult.total / 10) * 10,
          visibility: options.visibility || "all",
        };
        onRollResult(skillCheckRoll);
      } else {
        // 一般擲骰
        const simpleDiceRoll: SimpleDiceRoll = {
          id: crypto.randomUUID(),
          type: "simple",
          timestamp: new Date(),
          rollerId: userId,
          rollerName: userName,
          characterId: options.characterId,
          characterName: options.characterName,
          notation,
          rolls: rollResult.rolls.map((d) => d.value),
          total: rollResult.total,
          visibility: options.visibility || "all",
        };
        onRollResult(simpleDiceRoll);
      }
    }

    return results;
  },

  rollSkillCheck: async (
    skillName,
    targetValue,
    successLevel,
    options = {},
  ) => {
    const { roll } = get();
    await roll("1d100", {
      ...options,
      skillName,
      targetValue,
      successLevel,
    });
  },
}));

// Selectors
export const selectIsRollerReady = (state: DiceRollerState) =>
  state.rollerRef?.isReady ?? false;
