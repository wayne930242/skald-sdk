"use client";

import * as React from "react";

/** 按住多久算長按 */
export const LONG_PRESS_MS = 500;
/** 手指移動超過這個距離就當作在捲動，取消長按 */
const MOVE_TOLERANCE_PX = 10;

/**
 * 長按（觸控、筆或滑鼠左鍵按住 500 ms）呼叫 `onLongPress`。
 *
 * - 移動超過 10px、放開、離開元素或瀏覽器接手手勢（pointercancel，例如開始捲動）都會取消。
 * - 長按觸發後放開時瀏覽器仍會送一個 click：`consumeLongPress()` 在 click 裡回 true，呼叫端
 *   據此不擲骰。
 * - Android 在長按時會先送 contextmenu：`takeOverPress()` 讓那次按壓同樣算長按，避免放開時又擲。
 */
export function useLongPress(onLongPress: () => void, enabled: boolean) {
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const startRef = React.useRef<{ x: number; y: number } | null>(null);
  const firedRef = React.useRef(false);
  const callbackRef = React.useRef(onLongPress);

  React.useEffect(() => {
    callbackRef.current = onLongPress;
  }, [onLongPress]);

  const cancel = React.useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    startRef.current = null;
  }, []);

  React.useEffect(() => cancel, [cancel]);

  const onPointerDown = React.useCallback(
    (event: React.PointerEvent) => {
      firedRef.current = false;
      cancel();
      // 右鍵交給 contextmenu
      if (!enabled || event.button !== 0) return;
      startRef.current = { x: event.clientX, y: event.clientY };
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        startRef.current = null;
        firedRef.current = true;
        callbackRef.current();
      }, LONG_PRESS_MS);
    },
    [cancel, enabled],
  );

  const onPointerMove = React.useCallback(
    (event: React.PointerEvent) => {
      const start = startRef.current;
      if (!start) return;
      const moved = Math.hypot(event.clientX - start.x, event.clientY - start.y);
      if (moved > MOVE_TOLERANCE_PX) cancel();
    },
    [cancel],
  );

  /** click 開頭呼叫：剛才那一下是長按就回 true（並清掉記號） */
  const consumeLongPress = React.useCallback(() => {
    const fired = firedRef.current;
    firedRef.current = false;
    return fired;
  }, []);

  /** 按壓進行中被別的方式（contextmenu）接手：取消計時，並把這次按壓記為長按 */
  const takeOverPress = React.useCallback(() => {
    if (!timerRef.current) return;
    cancel();
    firedRef.current = true;
  }, [cancel]);

  return {
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: cancel,
      onPointerCancel: cancel,
      onPointerLeave: cancel,
    },
    consumeLongPress,
    takeOverPress,
  };
}
