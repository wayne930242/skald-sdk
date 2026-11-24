// modules/character/ui/renderer/primitives/field-grids.ts
//
// 角色卡上重複出現的欄位排版骨架。
//
// 「標籤 + 數值」這個兩欄結構同時被護甲與資產清單使用，先前各寫各的，
// 數值欄一邊是 40% 一邊是 45%，兩個值都沒有依據。

/**
 * 「標籤 + 數值」兩欄（螢幕）。
 *
 * 標籤欄可以一路收縮到 0 並靠 truncate 截斷；數值欄保底 4.5rem——放得下
 * 三位數加單位——最多吃掉四成寬度，避免長標籤把數值擠成兩行。
 */
export const LABEL_VALUE_GRID_WEB =
  "grid-cols-[minmax(0,1fr)_minmax(4.5rem,40%)]";

/**
 * 「標籤 + 數值」兩欄（列印）。
 *
 * 紙上改用固定 68px，同一張表的每一列才會對齊；比例欄寬會隨標籤長度浮動。
 */
export const LABEL_VALUE_GRID_PRINT = "grid-cols-[1fr_68px]";
