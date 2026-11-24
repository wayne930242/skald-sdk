// lib/game-icons/client.ts
//
// game-icons 資料的瀏覽器端快取。
//
// 資料共 6.4 MB，不能進 client bundle——投稿者填的名稱是執行期才知道的，
// 靜態分析無法 tree-shake。圖示由宿主的 GameIconSource（host port
// gameIconSource）按需取回；這裡集中管理單一圖示的取用與全站共用的快取。
//
// 快取放在模組層級而非 React state：同一個圖示在一張角色卡上常出現多次，
// 選擇器又會反覆開關，逐個元件各存一份等於白抓。
"use client";

/** 宿主取回圖示的方式（Skald 走 /api/game-icons，預覽器讀本機 icons.json） */
export interface GameIconSource {
  /** 圖示的完整 SVG；名稱不存在或取不到時回傳 null */
  fetchIcon(name: string): Promise<string | null>;
}

/** 已取回的圖示本體（<svg> 內容，不含外層標籤） */
const cache = new Map<string, string>();
/** 進行中的請求，避免同名圖示同時發多個請求 */
const pending = new Map<string, Promise<string | null>>();

export function getCachedGameIcon(name: string): string | undefined {
  return cache.get(name);
}

/** 批次取回的圖示本體（已是 <svg> 內容）寫進共用快取 */
export function cacheGameIconBodies(bodies: Record<string, string>): void {
  for (const [name, body] of Object.entries(bodies)) cache.set(name, body);
}

/** 只取 <svg> 內容，外層由 GameIcon 自己畫，才能套 className */
function extractBody(svg: string): string {
  return svg.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
}

export async function loadGameIcon(name: string, source: GameIconSource): Promise<string | null> {
  const cached = cache.get(name);
  if (cached !== undefined) return cached;

  const inFlight = pending.get(name);
  if (inFlight) return inFlight;

  const request = source
    .fetchIcon(name)
    .then((svg) => {
      if (svg === null) return null;
      const body = extractBody(svg);
      cache.set(name, body);
      return body;
    })
    .catch((error: unknown) => {
      console.error(`Game icon source failed for "${name}"`, error);
      return null;
    })
    .finally(() => {
      pending.delete(name);
    });

  pending.set(name, request);
  return request;
}
