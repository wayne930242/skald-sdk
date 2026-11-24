// modules/character/ui/renderer/primitives/game-icon.tsx
//
// game-icons.net 的圖示（4133 個，CC BY 3.0）。
//
// 資料共 6.7 MB，不能進 client bundle——投稿者填的名稱是執行期才知道的，
// 靜態分析無法 tree-shake。改由宿主的 gameIconSource（Skald 是
// /api/game-icons/[name]）按需供應，只取真正用到的那幾個。
//
// 內嵌 SVG 而非 <img>：角色卡的圖示要跟著文字色變（fill 已是 currentColor），
// 而且列印時 DOM 裡必須是真的 SVG。用 CSS mask 雖然不必抓資料，但列印的
// 背景色行為不可靠。
"use client";

import * as React from "react";

import { cn } from "@skald/sheet-sdk/lib/utils";
import { getCachedGameIcon, loadGameIcon } from "@skald/sheet-sdk/lib/game-icons/client";
import { useHostPort } from "@skald/sheet-sdk/modules/systems/ui/host-ports";
import { corePorts } from "@skald/sheet-sdk/modules/systems/ui/core-ports";

interface GameIconProps {
  /** 不含 game: 前綴的圖示名稱 */
  name: string;
  className?: string;
}

export function GameIcon({ name, className }: GameIconProps) {
  const source = useHostPort(corePorts.gameIconSource);
  const [body, setBody] = React.useState<string | null>(
    () => getCachedGameIcon(name) ?? null,
  );
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    const cached = getCachedGameIcon(name);
    if (cached !== undefined) {
      setBody(cached);
      setFailed(false);
      return;
    }

    setBody(null);
    setFailed(false);
    if (!source) return;
    void loadGameIcon(name, source).then((result) => {
      if (!active) return;
      if (result === null) setFailed(true);
      else setBody(result);
    });

    return () => {
      active = false;
    };
  }, [name, source]);

  if (!source && body === null) {
    // 宿主沒有圖示來源（本機預覽器未註冊）：看得見的佔位，不是靜默留白
    return (
      <span
        className={cn("text-muted-foreground", className)}
        title={`game icon unavailable: ${name}`}
        aria-label={`game icon unavailable: ${name}`}
        data-game-icon-unavailable
      >
        ?
      </span>
    );
  }

  if (failed) {
    // 名稱錯了要看得見。靜默留白會讓投稿者以為圖示不支援而反覆嘗試。
    return (
      <span
        className={cn("text-destructive", className)}
        title={`unknown game icon: ${name}`}
        aria-label={`unknown game icon: ${name}`}
      >
        ?
      </span>
    );
  }

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 512 512"
      className={className}
      aria-hidden="true"
      // body 來自本站 API、內容產自 game-icons repo 的靜態檔，非使用者輸入
      dangerouslySetInnerHTML={{ __html: body ?? "" }}
    />
  );
}
