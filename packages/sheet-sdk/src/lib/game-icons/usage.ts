// lib/game-icons/usage.ts
//
// 判斷一份 schema 有沒有用到 game-icons 的圖示。
//
// 用途是列印時的 CC BY 標示：授權要求使用時標示來源，但沒用到就不必印，
// 否則每張角色卡都會多一行噪音。
//
// 這裡只走訪結構、比對字串，不碰圖示資料本身，可安全用於 client component。

import { GAME_ICON_PREFIX } from "@skald/sheet-sdk/lib/game-icons/prefix";

/**
 * 遞迴尋找任一 icon 屬性是否為 game: 開頭。
 *
 * 找 icon 屬性而非任意字串：schema 裡的說明文字若剛好含有 "game:" 不該算數。
 */
export function usesGameIcons(node: unknown): boolean {
  if (Array.isArray(node)) {
    return node.some(usesGameIcons);
  }

  if (node && typeof node === "object") {
    const record = node as Record<string, unknown>;
    if (
      typeof record.icon === "string" &&
      record.icon.startsWith(GAME_ICON_PREFIX)
    ) {
      return true;
    }
    return Object.values(record).some(usesGameIcons);
  }

  return false;
}
