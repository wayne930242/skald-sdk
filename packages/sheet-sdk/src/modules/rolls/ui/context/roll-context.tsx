"use client";

import * as React from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import type { RollConfig, RollExpressionResult } from "@skald/dice/roll-expression";
import { useRollSessionStore } from "../stores/roll-session-store";
import { useRollPanelStore } from "@skald/sheet-sdk/modules/rolls/ui/stores/roll-panel-store";
import { buildLuckSpendRoll, entryPostRollState } from "@skald/sheet-sdk/modules/rolls/domain/post-roll";
import { isFollowUpAlreadyPosted } from "@skald/sheet-sdk/modules/rolls/domain/roll-follow-ups";
import { useDiceRollerStore, selectIsRollerReady } from "@skald/sheet-sdk/modules/rolls/ui/stores/dice-roller-store";
import { useSystemOptional } from "@skald/sheet-sdk/components/providers/system-provider";
import { evaluatePostRollActions, findPostRollActions, type SpendOption } from "@skald/dice";
import { nanoid } from "nanoid";
import { diceDispatchManager } from "@skald/sheet-sdk/modules/rolls/ui/roll-sink";
import { useExecuteRoll } from "./use-execute-roll";
import type {
  DiceRollerCallback,
  ExecuteRollOptions,
  RollContextValue,
  RollFollowUpRequest,
  RollFollowUpRolled,
  RollResultListener,
} from "../../domain/roll-context-types";

const RollContext = React.createContext<RollContextValue | null>(null);

export { simpleRollNotation, evaluateWithDSLRules } from "../../domain/roll-result-format";
export type {
  DiceRollerCallback,
  ExecuteRollOptions,
  FixedDie,
  RollContextValue,
  RollDelivered,
  RollDelivery,
  RollFollowUpRequest,
  RollFollowUpRolled,
  RollImproveTarget,
  RollResultEvent,
  RollResultListener,
} from "../../domain/roll-context-types";

interface RollProviderProps {
  children: React.ReactNode;
  characterId?: string;
  characterName?: string;
  /**
   * 桌主（GM）從隊友的角色卡擲骰：訊息以 GM 自己的名義送出、記下那張卡的角色
   * （資料庫 130 只讓桌主這樣做），聊天會顯示「GM（角色）」
   */
  onBehalf?: boolean;
  /** @deprecated 使用 global dice roller store 代替 */
  onDiceRoll?: DiceRollerCallback;
}

export function RollProvider({
  children,
  characterId,
  characterName,
  onBehalf,
  onDiceRoll,
}: RollProviderProps) {
  const { sendDiceRoll, currentUserId, currentUserName, currentTableId } =
    useRollSessionStore();
  const t = useTranslations("roll");
  // We're in session if the session has user info and table ID set
  // Note: We don't require isConnected because that's for realtime subscription,
  // but we can still send messages to DB without the channel being ready
  const isInSession = !!currentUserId && !!currentTableId;

  // Global dice roller store
  const globalRoll = useDiceRollerStore((state) => state.roll);
  const isRollerReady = useDiceRollerStore(selectIsRollerReady);

  // Get system DSL rules if available
  const system = useSystemOptional();
  const rollRules = system?.dsl?.rollRules;

  const listenersRef = React.useRef(new Set<RollResultListener>());
  const onRollResult = React.useCallback((listener: RollResultListener) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  const executeRollInternal = useExecuteRoll({
    globalRoll,
    isRollerReady,
    onDiceRoll,
    isInSession,
    currentUserId,
    currentUserName,
    characterId,
    characterName,
    onBehalf,
    sendDiceRoll,
    t,
    rollRules,
    system,
    listenersRef,
  });

  const executeRoll = React.useCallback(
    async (
      config: RollConfig,
      context: Record<string, number>,
      fieldLabel?: string,
      argOverrides?: Record<string, number>,
      options?: ExecuteRollOptions,
    ): Promise<RollExpressionResult | null> => {
      const outcome = await executeRollInternal(
        config,
        context,
        fieldLabel,
        argOverrides,
        options,
      );
      return outcome?.result ?? null;
    },
    [executeRollInternal],
  );

  const executeMacroTrigger = React.useCallback(
    (
      config: RollConfig,
      context: Record<string, number>,
      fieldLabel?: string,
      argOverrides?: Record<string, number>,
      options?: ExecuteRollOptions,
    ) => executeRollInternal(config, context, fieldLabel, argOverrides, options),
    [executeRollInternal],
  );

  const pushRoll = React.useCallback(
    async (entryId: string): Promise<boolean> => {
      const panel = useRollPanelStore.getState();
      const entry = panel.results.find((item) => item.id === entryId);
      if (!entry?.replay) return false;
      const decision = evaluatePostRollActions(
        findPostRollActions(rollRules, entry.ruleId),
        entryPostRollState(entry, undefined),
      ).push;
      if (!decision?.available) return false;

      // 在第一個 await（3D 動畫、送出）之前就標記：動畫期間連點不會推第二次
      panel.patchEntry(entryId, { wasPushed: true });
      const { config, context, fieldLabel, argOverrides } = entry.replay;
      let outcome: Awaited<ReturnType<typeof executeRollInternal>> = null;
      try {
        outcome = await executeRollInternal(config, context, fieldLabel, argOverrides, {
          visibility: entry.visibility,
          rollKey: entry.rollKey,
          pushOf: entry.id,
          // 孤注一擲重擲同一個檢定：同樣的難度
          difficulty: entry.difficulty,
        });
      } finally {
        // 資料庫說已經推過了：按鈕要維持消失，不能還原成可以再按
        if (!outcome?.result && !outcome?.followUpAlreadyPosted) {
          useRollPanelStore.getState().patchEntry(entryId, { wasPushed: false });
        }
      }
      return !!outcome?.result;
    },
    [executeRollInternal, rollRules],
  );

  const announceLuckSpend = React.useCallback(
    async (entryId: string, option: SpendOption): Promise<boolean | "already-posted"> => {
      const panel = useRollPanelStore.getState();
      const entry = panel.results.find((item) => item.id === entryId);
      if (!entry) return false;
      // 只認規則現在還會開出來的那個選項：連點或過期的按鈕不會花第二次
      const offered = evaluatePostRollActions(
        findPostRollActions(rollRules, entry.ruleId),
        entryPostRollState(entry, { value: Number.POSITIVE_INFINITY, writable: true }),
      ).spend?.options.some(
        (candidate) => candidate.level === option.level && candidate.cost === option.cost,
      );
      if (!offered) return false;

      if (isInSession && currentUserId && currentUserName) {
        const payload = buildLuckSpendRoll({
          id: nanoid(),
          timestamp: new Date(),
          original: entry,
          option,
          who: {
            rollerId: currentUserId,
            rollerName: currentUserName,
            characterId,
            characterName,
          },
        });
        const dispatched = await diceDispatchManager.dispatch(payload);
        if (!dispatched.success) {
          if (isFollowUpAlreadyPosted(dispatched)) {
            // 別的分頁已經接續過了：再送一樣會被擋，也不能再扣幸運，按鈕收起來
            toast.error(t("luckAlreadyDone"));
            panel.patchEntry(entryId, { luckAlreadyPosted: true });
            return "already-posted";
          }
          if (!(await sendDiceRoll(payload))) return false;
        }
      }
      useRollPanelStore.getState().applyLuckSpend(entryId, option);
      return true;
    },
    [
      rollRules,
      isInSession,
      currentUserId,
      currentUserName,
      characterId,
      characterName,
      sendDiceRoll,
      t,
    ],
  );

  const rollFollowUp = React.useCallback(
    async (entryId: string, request: RollFollowUpRequest): Promise<RollFollowUpRolled | null> => {
      const root = useRollPanelStore.getState().results.find((item) => item.id === entryId);
      if (!root) return null;
      const outcome = await executeRollInternal(
        { expression: request.expression, target: "session" },
        request.context ?? {},
        request.label,
        undefined,
        // 後續擲骰一律沿用原本那一擲的對象（暗骰的後續仍只有擲骰者與 GM 看得到）
        {
          visibility: root.visibility,
          followUpOf: root.id,
          fixedDice: request.fixedDice,
          ...(request.deliver && { deliver: request.deliver }),
        },
      );
      const entry = outcome?.entry;
      if (!outcome?.result || !entry) return null;
      const faces = entry.tensDice?.length
        ? [entry.selectedTens ?? 0, entry.selectedUnits ?? 0]
        : [...entry.rolls];
      return {
        id: entry.id,
        total: entry.total,
        faces,
        ...(entry.successLevel !== undefined && { successLevel: entry.successLevel }),
        ...(entry.targetValue !== undefined && { targetValue: entry.targetValue }),
        sentToChat: entry.sentToChat,
        ...(entry.messageId !== undefined && { messageId: entry.messageId }),
      };
    },
    [executeRollInternal],
  );

  const postFollowUpNote = React.useCallback(
    async (entryId: string, note: { label: string; value: number }): Promise<boolean> => {
      const root = useRollPanelStore.getState().results.find((item) => item.id === entryId);
      // 原本那一擲沒送到聊天（桌外、送出失敗）時，記錄它的後果的那一行也不送：沒人看過那一擲
      if (!root || !root.sentToChat || !isInSession || !currentUserId || !currentUserName) return false;
      const payload = {
        id: nanoid(),
        timestamp: new Date(),
        rollerId: currentUserId,
        rollerName: currentUserName,
        characterId,
        characterName,
        ...(onBehalf && characterId ? { onBehalf: true as const } : {}),
        visibility: root.visibility,
        type: "simple" as const,
        notation: "",
        rolls: [],
        total: note.value,
        label: note.label,
      };
      const dispatched = await diceDispatchManager.dispatch(payload);
      return dispatched.success || (await sendDiceRoll(payload));
    },
    [isInSession, currentUserId, currentUserName, characterId, characterName, onBehalf, sendDiceRoll],
  );

  const value = React.useMemo<RollContextValue>(
    () => ({
      executeRoll,
      executeMacroTrigger,
      pushRoll,
      announceLuckSpend,
      rollFollowUp,
      postFollowUpNote,
      onRollResult,
      isInSession,
      characterId,
      characterName,
      onBehalf: !!onBehalf,
    }),
    [
      executeRoll,
      executeMacroTrigger,
      pushRoll,
      announceLuckSpend,
      rollFollowUp,
      postFollowUpNote,
      onRollResult,
      isInSession,
      characterId,
      characterName,
      onBehalf,
    ],
  );

  return <RollContext.Provider value={value}>{children}</RollContext.Provider>;
}

export function useRoll(): RollContextValue {
  const context = React.useContext(RollContext);
  if (!context) {
    throw new Error("useRoll must be used within a RollProvider");
  }
  return context;
}

export function useRollOptional(): RollContextValue | null {
  return React.useContext(RollContext);
}
