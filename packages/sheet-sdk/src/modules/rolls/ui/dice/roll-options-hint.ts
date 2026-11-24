// modules/rolls/ui/dice/roll-options-hint.ts
//
// 角色卡上的擲骰鈕點一下就擲；獎懲骰與難度要長按（電腦按右鍵）才開選項視窗。
// 使用者在這個瀏覽器第一次擲骰後跳一次提示，之後不再出現。

import { toast } from "sonner";

export const ROLL_OPTIONS_HINT_KEY = "skald:roll-options-hint-seen";

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

/** 記下這個瀏覽器已經知道選項視窗（顯示過提示，或自己開過視窗） */
export function markRollOptionsHintSeen(): void {
  storage()?.setItem(ROLL_OPTIONS_HINT_KEY, "1");
}

/** 這個瀏覽器是否已經知道選項視窗 */
export function rollOptionsHintSeen(): boolean {
  const store = storage();
  return !store || store.getItem(ROLL_OPTIONS_HINT_KEY) !== null;
}

/** 第一次擲骰後顯示提示；顯示過就不再出現 */
export function showRollOptionsHintOnce(message: string): void {
  const store = storage();
  if (!store || store.getItem(ROLL_OPTIONS_HINT_KEY) !== null) return;
  store.setItem(ROLL_OPTIONS_HINT_KEY, "1");
  // 擲骰台在右下：提示放上方，不蓋住剛擲出的結果
  toast(message, { duration: 8000, position: "top-center", closeButton: true });
}
