"use client";

import * as React from "react";
import { toast } from "sonner";
import type { useTranslations } from "next-intl";
import type { RollConfig, RollExpressionResult } from "@skald/dice/roll-expression";
import { executeExpressionWithMacros, type MacroWrite } from "@skald/dice";
import { FormulaEvaluationError } from "@skald/dice/formula";
import type { RollSessionSender } from "../stores/roll-session-store";
import { useRollPanelStore } from "@skald/sheet-sdk/modules/rolls/ui/stores/roll-panel-store";
import { buildRollPanelEntry, type RollImproveState } from "@skald/sheet-sdk/modules/rolls/domain/roll-panel";
import { isFollowUpAlreadyPosted } from "@skald/sheet-sdk/modules/rolls/domain/roll-follow-ups";
import type { useDiceRollerStore } from "@skald/sheet-sdk/modules/rolls/ui/stores/dice-roller-store";
import type { DiceBoxResult } from "@skald/sheet-sdk/modules/rolls/domain/dice-box-result";
import type { DiceVisibility, SuccessLevel } from "@skald/dice";
import type { useSystemOptional } from "@skald/sheet-sdk/components/providers/system-provider";
import {
  judgePercentileCheck,
  findPostRollActions,
  resolveRollRuleId,
  decideAutoImprove,
} from "@skald/dice";
import type { RollRulesDefinition } from "@skald/dice";
import type { SkillCheckRoll, SimpleDiceRoll } from "@skald/dice";
import { nanoid } from "nanoid";
import { buildRollExpression } from "@skald/sheet-sdk/modules/rolls/domain/build-roll-expression";
import { DiceResultDisplay } from "@skald/sheet-sdk/modules/rolls/ui/dice/dice-result-display";
import { diceDispatchManager } from "@skald/sheet-sdk/modules/rolls/ui/roll-sink";
import { normalizeDiceBoxRoll } from "@skald/sheet-sdk/modules/rolls/domain/dice-box-result";
import { comparisonExtras, gradesFromTotal, refreshRollComparison, usesOptedInTotalGrades } from "@skald/sheet-sdk/modules/rolls/domain/simple-roll-extras";
import type { DiceRollerCallback, ExecuteRollOptions, FixedDie, RollResultListener } from "../../domain/roll-context-types";
import type { RollPanelEntry } from "@skald/sheet-sdk/modules/rolls/domain/roll-panel";
import {
  evaluateWithDSLRules,
  extractDiceNotation,
  extractSuccessLevelId,
  simpleRollNotation,
  skillCheckFaces,
  tensOfRoll,
  toToastDiceRoll,
} from "../../domain/roll-result-format";

/**
 * A random source that lands each die on the next given face, in order (`rollSingleDie` maps
 * [0, 1) to a face: `floor(r * sides) + 1`, or `floor(r * 3) - 1` for Fudge dice). Past the
 * given faces it throws: a result-only roll that asks for more dice than it names is a bug.
 */
function fixedFaces(dice: readonly FixedDie[]): () => number {
  let index = 0;
  return () => {
    const die = dice[index++];
    if (!die) throw new RangeError("A result-only roll rolled more dice than it gave faces for");
    return die.sides === "F" ? (die.face + 1.5) / 3 : (die.face - 0.5) / die.sides;
  };
}

interface ExecuteRollScope {
  globalRoll: ReturnType<typeof useDiceRollerStore.getState>["roll"];
  isRollerReady: boolean;
  onDiceRoll?: DiceRollerCallback;
  isInSession: boolean;
  currentUserId: string | null;
  currentUserName: string | null;
  characterId?: string;
  characterName?: string;
  onBehalf?: boolean;
  sendDiceRoll: RollSessionSender;
  t: ReturnType<typeof useTranslations<"roll">>;
  rollRules: RollRulesDefinition | undefined;
  system: ReturnType<typeof useSystemOptional>;
  listenersRef: React.RefObject<Set<RollResultListener>>;
}

export function useExecuteRoll({
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
}: ExecuteRollScope) {
  return React.useCallback(
    async (
      config: RollConfig,
      context: Record<string, number>,
      fieldLabel?: string,
      argOverrides?: Record<string, number>,
      options?: ExecuteRollOptions,
    ): Promise<{
      result: RollExpressionResult | null;
      writes: MacroWrite[];
      /** 這一擲是孤注一擲，而資料庫說同一個目標已經被推過了（別的分頁或 Discord）；沒有送出、沒有記錄 */
      followUpAlreadyPosted?: true;
      /** The roll desk's entry of this roll. */
      entry?: RollPanelEntry;
    } | null> => {
      // Determine target - default to "session" when in session, "local" otherwise
      const target = config.target ?? (isInSession ? "session" : "local");
      const expression = buildRollExpression(config.expression);
      // 桌外沒有聊天可送，對象沒有意義；桌內用擲骰台選的對象
      const visibility: DiceVisibility =
        options?.visibility ??
        (isInSession ? useRollPanelStore.getState().audience : "all");
      let sentToChat = false;
      let messageId: string | undefined;
      // 聊天訊息與擲骰台的結果共用同一個 id，後續訊息（孤注一擲、花幸運）靠它指回來
      const rollId = nanoid();
      const isPush = options?.pushOf !== undefined;
      // A delivery of the caller's own has no chat sink to fall back to: refuse before rolling
      if (options?.deliver && !(target === "session" && isInSession && currentUserId && currentUserName)) {
        throw new Error("A roll with its own delivery needs a table session");
      }

      // Execute roll to get result for comparison (needed for target value and
      // system detection). Resolves a macro reference ({{#name[args]}}) via
      // the shared interpreter if present, otherwise executes the expression
      // directly.
      let macroEval: ReturnType<typeof executeExpressionWithMacros>;
      try {
        macroEval = executeExpressionWithMacros(
          expression,
          system?.dsl?.rollMacros,
          context,
          {
            dslRollRules: rollRules,
            difficulty: options?.difficulty,
            ...(options?.fixedDice && { random: fixedFaces(options.fixedDice) }),
          },
          argOverrides,
        );
      } catch (error) {
        // A reference the sheet cannot resolve (an empty or free-text damage field) is
        // an invalid expression to the player, not an uncaught rejection.
        if (!(error instanceof FormulaEvaluationError)) throw error;
        macroEval = null;
      }
      if (!macroEval) {
        toast.error(t("error.title"), {
          description: t("error.invalidExpression"),
        });
        return null;
      }
      const result = macroEval.result;
      if (!result) {
        // Write-only macro (no `return`) — nothing to roll/display, but the
        // writes are surfaced to the caller (write-flush isn't built yet).
        return { result: null, writes: macroEval.writes };
      }

      // Extract dice notation for the 3D dice roller from the resolved
      // (post-{{ }}-substitution, post-macro) expression — the raw
      // `expression` variable above may still be an unresolved macro
      // reference like "{{#coc[@str]}}", which extractDiceNotation can't parse.
      const resolvedExpression = result.resolvedDiceExpr ?? expression;
      const notation = extractDiceNotation(resolvedExpression);
      const graded = gradesFromTotal(rollRules, resolvedExpression, notation);
      const totalOnlyGrade = graded?.allSurfaces && result.targetValue === undefined;
      const optedInComparison = result.targetValue !== undefined && usesOptedInTotalGrades(rollRules, resolvedExpression);
      const gradeTotal = () => evaluateWithDSLRules(result.rolled, 0, resolvedExpression, rollRules)?.id;
      if (totalOnlyGrade) result.successLevel = gradeTotal();

      // If 3D dice roller is ready, use its result instead of pre-computed values
      // This ensures the animation and chat message show the same result
      let diceBoxResults: DiceBoxResult[] | null = null;
      const hasCocBonusDice = !!result.bonusDice && result.bonusDice !== 0;
      // A result-only roll shows faces already rolled: no new dice to animate
      if (isRollerReady && !hasCocBonusDice && !options?.fixedDice) {
        diceBoxResults = await globalRoll(notation, {
          skillName: fieldLabel,
          targetValue: result.targetValue,
          // Don't pass successLevel yet - we'll recalculate after getting the actual roll
          characterId,
          characterName,
        });

        // Override result with actual 3D dice values
        if (diceBoxResults && diceBoxResults.length > 0) {
          const normalized = normalizeDiceBoxRoll(diceBoxResults);
          result.rolled = normalized.total;
          result.rolls = normalized.rolls;
          // The pre-computed tens/units dice belong to the discarded virtual roll and
          // would contradict the 3D total (chat card and roll desk both print them).
          // Bonus/penalty rolls never take this path, so there is one die of each.
          if (result.tensDice?.length) {
            const tens = tensOfRoll(result.rolled);
            const units = result.rolled % 10;
            result.tensDice = [tens];
            result.unitsDice = [units];
            result.selectedTens = tens;
            result.selectedUnits = units;
          }

          // Grade the actual dice and modifier after keep/drop, not the discarded virtual roll.
          if (totalOnlyGrade) result.successLevel = gradeTotal();
          if (optedInComparison) {
            refreshRollComparison(result);
          } else if (result.targetValue !== undefined) {
            // Check for DSL rules first
            if (rollRules) {
              const dslLevel = evaluateWithDSLRules(
                result.rolled,
                result.targetValue,
                result.resolvedDiceExpr ?? expression,
                rollRules,
                result.difficulty,
              );
              if (dslLevel) {
                result.successLevel = dslLevel.id as SuccessLevel;
              }
            }
            // Check for coc7 system prefix
            else if ((result.resolvedDiceExpr ?? expression).toLowerCase().startsWith("coc7:")) {
              const judged = judgePercentileCheck({
                rolled: result.rolled,
                value: result.targetValue,
                difficulty: result.difficulty,
              });
              if (judged) result.successLevel = judged.level as SuccessLevel;
            }
          }
        }
      } else if (onDiceRoll) {
        // Legacy: use onDiceRoll callback if provided (no 3D dice, just callback)
        await onDiceRoll(notation, {
          skillName: fieldLabel,
          targetValue: result.targetValue,
          successLevel: extractSuccessLevelId(result.successLevel),
        });
      } else {
        // No 3D dice available - enhance result with DSL success level if needed
        if (rollRules && result.targetValue !== undefined && !optedInComparison) {
          const dslLevel = evaluateWithDSLRules(
            result.rolled,
            result.targetValue,
            result.resolvedDiceExpr ?? expression,
            rollRules,
            result.difficulty,
          );
          if (dslLevel) {
            result.successLevel = dslLevel.id as SuccessLevel;
          }
        }
      }

      // Send result to appropriate destination
      // For session: build payload directly using pre-computed result (avoid double roll)
      // For toast fallback: use RollService (single execution path)
      if (target === "session" && isInSession && currentUserId && currentUserName) {
        // Build chat payload directly using the already-computed result
        // This ensures 3D dice and chat show the same result
        const basePayload = {
          id: rollId,
          timestamp: new Date(),
          rollerId: currentUserId,
          rollerName: currentUserName,
          characterId,
          characterName,
          ...(onBehalf && characterId ? { onBehalf: true as const } : {}),
          visibility,
        };

        let rollPayload: SkillCheckRoll | SimpleDiceRoll;

        if (result.successLevel && result.targetValue !== undefined) {
          // Skill check
          const successLevelId =
            typeof result.successLevel === "string"
              ? result.successLevel
              : result.successLevel.id;

          rollPayload = {
            ...basePayload,
            type: "skill_check" as const,
            skillName: fieldLabel ?? t("check"),
            targetValue: result.targetValue,
            roll: result.rolled,
            successLevel: successLevelId as SuccessLevel,
            ...(result.difficulty && { difficulty: result.difficulty }),
            bonusDice: result.bonusDice,
            unitsDice: result.unitsDice,
            tensDice: result.tensDice,
            selectedUnits: result.selectedUnits ?? result.rolled % 10,
            selectedTens: result.selectedTens ?? tensOfRoll(result.rolled),
            ...skillCheckFaces(result),
            ...(options?.rollKey && { rollKey: options.rollKey }),
            ...(options?.pushOf && { pushed: true as const, followsRollId: options.pushOf }),
          };
        } else {
          // Simple roll
          // Opted-in expressions retain their keep/drop notation and actual modifier in chat.
          const chatNotation = totalOnlyGrade ? notation : simpleRollNotation(
            resolvedExpression, result.rolls, result.rolled,
          );
          const comparison = comparisonExtras(result);
          const gradedLevel = totalOnlyGrade
            ? extractSuccessLevelId(result.successLevel)
            : gradesFromTotal(rollRules, resolvedExpression, chatNotation) && !graded?.allSurfaces
              ? gradeTotal()
              : undefined;

          rollPayload = {
            ...basePayload,
            type: "simple" as const,
            notation: chatNotation,
            rolls: result.rolls,
            total: result.rolled,
            ...(fieldLabel ? { label: fieldLabel } : {}),
            ...comparison,
            ...(gradedLevel ? { successLevel: gradedLevel as SuccessLevel } : {}),
          };
        }

        if (options?.deliver) {
          // The caller's delivery rejects for itself: never retried through the chat sink, and the
          // desk records nothing. Skipping the sink loses nothing: its only handler inserts the chat
          // row (use-session-chat-roll), and other clients' 3D dice (chat realtime INSERT) and
          // Discord (outbox trigger, migration 124) follow the row whoever wrote it.
          const delivered = await options.deliver(rollPayload);
          if (typeof delivered?.messageId !== "string" || delivered.messageId === "") {
            throw new Error("A roll delivery must return the chat message id");
          }
          messageId = delivered.messageId;
          sentToChat = true;
        } else {
          const dispatchResult = await diceDispatchManager.dispatch(rollPayload);
          if (dispatchResult.success) {
            sentToChat = true;
          } else if (isPush && isFollowUpAlreadyPosted(dispatchResult)) {
            // 同一個目標在別處推過了：再送一次一樣會被擋，擲骰台也不記這一擲
            toast.error(t("pushAlreadyDone"));
            return { result: null, writes: [], followUpAlreadyPosted: true };
          } else {
            console.error("[Roll] Failed to dispatch dice roll:", dispatchResult.error);
            // 只有真的寫進聊天才算「已送到聊天」
            sentToChat = await sendDiceRoll(rollPayload);
          }
        }
      } else if (
        !isRollerReady &&
        !onDiceRoll &&
        useRollPanelStore.getState().docks.length === 0
      ) {
        // No 3D dice, not in session and no roll panel to show the result: toast the
        // pre-computed result. With a panel mounted the toast would be a second layer
        // for the same roll, covering the panel's push button.
        // This avoids double roll that would occur if using rollService.roll()
        const title = fieldLabel
          ? t("toast.title", { label: fieldLabel })
          : t("toast.defaultTitle");
        const toastRoll = toToastDiceRoll(
          result,
          fieldLabel,
          currentUserId,
          currentUserName,
          characterId,
          characterName,
          t("check"),
          visibility,
          totalOnlyGrade ? extractSuccessLevelId(result.successLevel) : undefined,
        );

        toast(title, {
          description: <DiceResultDisplay roll={toastRoll} />,
        });
      }

      // 擲後動作：成長勾只在擲骰當下判定一次（之後花幸運把失敗轉成成功不會補勾）
      const ruleId = resolveRollRuleId(result.resolvedDiceExpr ?? expression, rollRules);
      const successLevelId = extractSuccessLevelId(result.successLevel);
      let improve: RollImproveState | undefined;
      const improveDecision = options?.improveTarget
        ? decideAutoImprove(findPostRollActions(rollRules, ruleId), {
            rollKey: options.rollKey,
            successLevel: successLevelId ?? "",
            bonusDice: result.bonusDice,
            pushed: isPush,
            visibility,
          })
        : "none";
      if (options?.improveTarget && successLevelId && improveDecision === "tick") {
        const target = options.improveTarget;
        target.mark();
        improve = {
          status: "ticked",
          undo: () => target.unmark(),
          isMounted: target.isMounted,
        };
      } else if (successLevelId && improveDecision === "withheld-blind") {
        // 暗骰不勾：隊友看得到角色卡，勾了等於洩漏成功；結果卡改提示自行勾選
        improve = { status: "withheld-blind" };
      }

      // 擲骰台：記下這筆結果
      const entry = buildRollPanelEntry({
        id: rollId,
        timestamp: Date.now(),
        label: fieldLabel ?? t("check"),
        result,
        visibility,
        sentToChat,
        messageId,
        ruleId,
        rollKey: options?.rollKey,
        characterId,
        pushed: isPush,
        followsId: options?.pushOf,
        // 只有帶目標值的檢定能孤注一擲，才需要留重擲用的輸入
        replay:
          result.targetValue !== undefined
            ? { config, context, fieldLabel, argOverrides }
            : undefined,
        improve,
      });
      // A plugin's follow-up is shown by the follow-up itself, under the entry it follows: the desk
      // keeps that entry as its latest result
      if (!options?.followUpOf) useRollPanelStore.getState().recordResult(entry);
      for (const listener of listenersRef.current) {
        listener({ entry, result, config, fieldLabel, visibility });
      }

      return { result, writes: macroEval.writes, entry };
    },
    [
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
    ],
  );
}
