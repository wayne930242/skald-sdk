import { create } from "zustand";
import type { DiceRoll } from "@skald/dice";
import type { BoundRollSession, RollSessionTransport } from "@skald/sheet-sdk/modules/systems/ui/core-ports";
import { currentRollSessionTransport } from "./roll-session-transport";
import { useRollPanelStore } from "./roll-panel-store";

export type RollSessionSender = (roll: DiceRoll) => Promise<boolean>;

export type { BoundRollSession, RollSessionTransport };

interface RollSessionState {
  currentUserId: string | null;
  currentUserName: string | null;
  currentUserAvatarUrl: string | null;
  currentTableId: string | null;
  sendDiceRoll: RollSessionSender;
}

/** Legacy fallback when no registered Roll Sink successfully posts the roll. */
export const sendDiceRoll: RollSessionSender = async (roll) => {
  const {
    currentUserId,
    currentUserName,
    currentUserAvatarUrl,
    currentTableId,
  } = useRollSessionStore.getState();
  if (!currentUserId || !currentUserName || !currentTableId) {
    console.warn("[Chat] Cannot send dice roll - not connected", {
      hasUserId: !!currentUserId,
      hasUserName: !!currentUserName,
      hasTableId: !!currentTableId,
    });
    return false;
  }

  const transport = currentRollSessionTransport();
  if (!transport) {
    console.warn("[Chat] No roll session transport");
    return false;
  }

  return transport(roll, {
    currentUserId, currentUserName, currentUserAvatarUrl, currentTableId,
  });
};

const unbound = {
  currentUserId: null,
  currentUserName: null,
  currentUserAvatarUrl: null,
  currentTableId: null,
};

export const useRollSessionStore = create<RollSessionState>(() => ({
  ...unbound,
  sendDiceRoll,
}));

export function setRollSession(
  tableId: string,
  userId: string,
  userName: string,
  avatarUrl: string | undefined,
): void {
  useRollPanelStore.getState().bindTable(tableId);
  useRollSessionStore.setState({
    currentUserId: userId,
    currentUserName: userName,
    currentUserAvatarUrl: avatarUrl ?? null,
    currentTableId: tableId,
  });
}

export function clearRollSession(): void {
  useRollSessionStore.setState(unbound);
}
