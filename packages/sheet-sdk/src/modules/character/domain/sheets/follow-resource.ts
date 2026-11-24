// modules/character/domain/sheets/follow-resource.ts
//
// `resource.follow` 的跟隨規則（純函式，沒有副作用，也不碰 React）。
//
// 每個宣告了 `follow` 的資源帶一個「同步」狀態：目前值正停在 `follow` 指向的值
// （max 或 start）上，沒有人把它設成別的。跟隨只搬同步中的目前值，
// 玩家設過的值不動。
//
// 同步與否不從「目前值剛好等於舊的跟隨值」推斷。逐鍵輸入時跟隨值會經過中間值
// （CON 60 → 6 → 空白 → 5 → 55），玩家設的目前值可能剛好等於其中一個；
// 只要在那個中間值上評估過一次（停頓、失焦），推斷就會把它當成沒動過。
// 所以狀態明確記下來，只在目前值本身被設定時重新量，見 `followStep` 的判定表。
//
// 狀態只留在宿主的記憶體裡，不寫進角色資料。寫入只發生在本地編輯的那一端；
// 兩個分頁同時開著時，另一端等編輯端的寫入回來再重新量。
import type { ResourceField } from "@skald/types/schema";
import {
  clampResource,
  resolveResourceSource,
  resourceCurrentPath,
} from "./resource";

/** 某個時間點上，一個資源解析後的上限與起始值 */
export interface ResourceValues {
  max?: number;
  start?: number;
}

/** 各資源（以欄位 id 為鍵）的解析值 */
export type ResourceSnapshot = Record<string, ResourceValues>;

/** 一個資源的跟隨狀態 */
export interface FollowState {
  /** 上次看到的目前值；剛寫出去、還沒回到資料裡的跟隨值也記在這裡 */
  current: number | undefined;
  /** 上次看到的、`follow` 指向的值；解析不到有限數字時為 undefined */
  followed: number | undefined;
  /** 目前值停在跟隨值上，沒有人把它設成別的 */
  inSync: boolean;
}

/** 各資源（以欄位 id 為鍵）的跟隨狀態 */
export type FollowStates = Record<string, FollowState>;

/**
 * 這一輪評估的起因：
 * - `replace`：整份資料被取代（匯入、重設）
 * - `local`：這個宿主的本地編輯
 * - `remote`：別處來的資料變動（其他分頁、其他人）
 * - `derived`：資料沒變，衍生值因為別的原因變了（覆寫、範本）
 */
export type FollowCause = "replace" | "local" | "remote" | "derived";

export interface FollowStepInput {
  follow: ResourceField["follow"];
  /** 上一輪的狀態；第一次評估時為 undefined */
  previous: FollowState | undefined;
  /** 資料裡的目前值；從未設定時為 undefined */
  current: number | undefined;
  next: ResourceValues;
  cause: FollowCause;
}

export interface FollowStep {
  state: FollowState;
  /** 要寫回的目前值；不需要寫入時為 undefined */
  write: number | undefined;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * 單一資源走一步：回傳新的狀態，以及要寫回的目前值。
 *
 * 「量」＝同步與否取決於目前值是否等於跟隨值。
 *
 * | 條件                                 | 同步狀態               | 寫入                        |
 * |--------------------------------------|------------------------|-----------------------------|
 * | 沒有上一輪（掛載、啟用）或整份取代   | 量                     | 無                          |
 * | 目前值變了（玩家、遠端，誰設的都算） | 量                     | 無                          |
 * | 跟隨值沒變                           | 不變                   | 無                          |
 * | 跟隨值變了，本地編輯，同步中         | 不變（仍同步）         | 新跟隨值，限制在 0..新 max |
 * | 跟隨值變了，本地編輯，不同步         | 不變（經過目前值也一樣） | 無                          |
 * | 跟隨值變了，遠端變動                 | 只會變成不同步         | 無（編輯的那一端寫）        |
 * | 跟隨值變了，資料沒變（覆寫、範本）   | 不變                   | 無                          |
 *
 * 同步中而新的跟隨值不是有限數字（來源欄位清空到算不出來）時先不寫，狀態留著，
 * 等跟隨值回來再寫。資料沒變的那一輪沿用記下的目前值：資料裡的可能還是寫入前的舊值。
 *
 * 遠端把跟隨值移開時先當作不同步：編輯端若同步會自己寫入，寫入到了（目前值變了）再量；
 * 編輯端不寫代表那邊認定目前值是玩家設的。遠端的跟隨值經過目前值不會讓它變成同步。
 */
export function followStep(input: FollowStepInput): FollowStep {
  const { follow, previous, next, cause } = input;
  const candidate = follow ? next[follow] : undefined;
  const followed = isFiniteNumber(candidate) ? candidate : undefined;
  const current =
    previous && cause === "derived" ? previous.current : input.current;
  const keep = (inSync: boolean): FollowStep => ({
    state: { current, followed, inSync },
    write: undefined,
  });

  if (!previous || cause === "replace" || current !== previous.current) {
    return keep(current !== undefined && current === followed);
  }
  if (followed === previous.followed || cause === "derived") {
    return keep(previous.inSync);
  }
  if (cause === "remote") {
    return keep(previous.inSync && current === followed);
  }
  if (!previous.inSync || followed === undefined) return keep(previous.inSync);

  const value = clampResource(followed, next.max);
  return {
    state: { current: value, followed, inSync: true },
    write: value === current ? undefined : value,
  };
}

/** 新角色的目前值：起始值，沒有時取上限；兩者都沒有則 undefined */
export function initialResourceValue(values: ResourceValues): number | undefined {
  const initial = values.start ?? values.max;
  return isFiniteNumber(initial)
    ? clampResource(initial, values.max)
    : undefined;
}

/** 解析所有資源在目前衍生值下的上限與起始值 */
export function snapshotResources(
  fields: readonly ResourceField[],
  readDerived: (fieldId: string) => unknown,
): ResourceSnapshot {
  const snapshot: ResourceSnapshot = {};
  for (const field of fields) {
    snapshot[field.id] = {
      max: resolveResourceSource(field.max, readDerived),
      start: resolveResourceSource(field.start, readDerived),
    };
  }
  return snapshot;
}

/** 依點分路徑取數字；路徑不存在或不是有限數字時為 undefined */
function readNumberAtPath(
  data: Record<string, unknown>,
  path: string,
): number | undefined {
  let node: unknown = data;
  for (const part of path.split(".")) {
    if (node === null || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return isFiniteNumber(node) ? node : undefined;
}

export interface FollowUpdate {
  fieldId: string;
  /** 目前值的資料路徑 */
  path: string;
  value: number;
}

/**
 * 對所有宣告了 `follow` 的資源走一步：回傳新的狀態與需要寫回的目前值。
 * `previous` 為 undefined 時（第一次評估）只量出狀態，不產出任何更新。
 */
export function advanceFollow(args: {
  fields: readonly ResourceField[];
  previous: FollowStates | undefined;
  next: ResourceSnapshot;
  data: Record<string, unknown>;
  cause: FollowCause;
}): { states: FollowStates; updates: FollowUpdate[] } {
  const { fields, previous, next, data, cause } = args;
  const states: FollowStates = {};
  const updates: FollowUpdate[] = [];
  for (const field of fields) {
    if (!field.follow) continue;
    const path = resourceCurrentPath(field);
    const step = followStep({
      follow: field.follow,
      previous: previous?.[field.id],
      current: readNumberAtPath(data, path),
      next: next[field.id] ?? {},
      cause,
    });
    states[field.id] = step.state;
    if (step.write !== undefined) {
      updates.push({ fieldId: field.id, path, value: step.write });
    }
  }
  return { states, updates };
}
