// modules/rolls/domain/post-roll.ts
//
// 擲後動作（孤注一擲、花幸運）在 web 端用到的純函式：讀資源、把擲骰台的一筆結果轉成
// 規則輸入、組出要送進聊天的後續訊息。判定本身在 `@skald/dice`（evaluatePostRollActions）。
//
// 後續訊息一律是「新訊息」：原本那一則擲骰不會被改，可見性沿用原本的。
import type {
  DiceVisibility,
  PostRollState,
  SkillCheckRoll,
  SpendOption,
  SpendPostRollAction,
} from "@skald/dice";
import { getValueByPath } from "@skald/sheet-sdk/lib/condition-utils";
import type { RollPanelEntry } from "@skald/sheet-sdk/modules/rolls/domain/roll-panel";

function finiteNumberAt(data: Record<string, unknown>, path: string): number | undefined {
  const value = getValueByPath(data, path);
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/**
 * 資源（幸運）目前的值：先讀宣告的路徑，沒存過（新角色只顯示起始值）才讀備援路徑。
 * 存的是 0 就是 0，不退回備援。
 */
export function readResourceValue(
  data: Record<string, unknown>,
  rule: Pick<SpendPostRollAction, "resource" | "fallback">,
): number | undefined {
  return (
    finiteNumberAt(data, rule.resource) ??
    (rule.fallback ? finiteNumberAt(data, rule.fallback) : undefined)
  );
}

/** 擲骰台的一筆結果 → 規則輸入 */
export function entryPostRollState(
  entry: RollPanelEntry,
  resource: PostRollState["resource"],
): PostRollState {
  return {
    rollKey: entry.rollKey,
    successLevel: entry.successLevel ?? "",
    rolled: entry.total,
    targetValue: entry.targetValue,
    bonusDice: entry.bonusDice,
    pushed: entry.pushed === true,
    wasPushed: entry.wasPushed === true,
    luckSpent: entry.luckSpent ?? 0,
    ...(entry.difficulty && { difficulty: entry.difficulty }),
    resource,
  };
}

export interface FollowUpWho {
  rollerId: string;
  rollerName: string;
  characterId?: string;
  characterName?: string;
}

interface FollowUpBase {
  id: string;
  timestamp: Date;
  original: RollPanelEntry;
  who: FollowUpWho;
}

/** 後續訊息一律沿用原本的可見性（暗骰的後續仍只有擲骰者與 GM 看得到） */
function followUpBase({ id, timestamp, original, who }: FollowUpBase) {
  const visibility: DiceVisibility = original.visibility;
  return { id, timestamp, visibility, ...who };
}

/**
 * 花幸運：一則新訊息，記這一次花的點數（不是累計）與成功等級的變化。
 * `roll` 與骰子明細維持原本擲出的樣子，花掉的點數另外記。
 */
export function buildLuckSpendRoll(
  input: FollowUpBase & { option: SpendOption },
): SkillCheckRoll {
  const { original, option } = input;
  return {
    ...followUpBase(input),
    type: "skill_check",
    skillName: original.label,
    targetValue: original.targetValue ?? 0,
    roll: original.total,
    successLevel: option.level,
    previousSuccessLevel: original.successLevel,
    luckSpent: option.cost,
    bonusDice: original.bonusDice,
    unitsDice: original.unitsDice,
    tensDice: original.tensDice,
    selectedUnits: original.selectedUnits ?? original.total % 10,
    selectedTens: original.selectedTens ?? Math.floor(original.total / 10) * 10,
    followsRollId: original.id,
    ...(original.rollKey && { rollKey: original.rollKey }),
    ...(original.difficulty && { difficulty: original.difficulty }),
  };
}
