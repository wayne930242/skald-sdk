/**
 * Where a Fate roll's invokes may be announced. The root roll goes out through the shared
 * `RollContext.executeRoll`; a completed invoke is a NEW `SimpleDiceRoll` through the public roll
 * sink, sent only to the root's exact audience and only while the same table, user and sink that
 * took the root are still bound. Anything this module cannot verify stays on the sheet: it never
 * picks a broader audience, never edits the original card and never resends.
 */
import type { DiceVisibility, SimpleDiceRoll } from "@skald/dice";
import { diceDispatchManager, type DiceDispatchResult } from "@skald/sheet-sdk/modules/rolls/ui/roll-sink";
import { useRollSessionStore } from "@skald/sheet-sdk/modules/rolls/ui/stores/roll-session-store";
import { sumFateFaces, type FateOutcome, type FateRollResult, type FateRollSnapshot } from "../../domain/roll";

/** The table, user and sink a message went out through. */
export interface FateSinkBinding {
  tableId: string;
  userId: string;
  /** The first available sink at roll time: the one `diceDispatchManager.dispatch` used. */
  handlerId: string;
}

export type FateChatAudience = "all" | "gm";

export type FateRootDelivery =
  /** Posted to this audience through this binding: follow-ups may go to the same audience. */
  | { kind: "chat"; entryId: string; audience: FateChatAudience; binding: FateSinkBinding; characterId?: string; characterName?: string; onBehalf: boolean }
  /** Rolled outside a table: nothing was sent and nothing will be. */
  | { kind: "local" }
  /** In a table but not provably posted to a supported audience: local use only after the player says so. */
  | { kind: "unverified"; reason: FateUnverifiedReason }
  /**
   * Posted by an active table's roll RPC (plan-r2 T3): its invokes go through the table, which keeps
   * the faces, the payment and the follow-up together. `revision` is the server's roll revision.
   */
  | { kind: "table"; messageId: string; audience: FateChatAudience; tableId: string; revision: number };

export type FateUnverifiedReason = "privateAudience" | "notPosted" | "noBinding" | "bindingChanged";

/** What the transport looks like right now; tests may pass their own. */
export interface FateSinkReader {
  session(): { tableId: string | null; userId: string | null; userName: string | null };
  handlerIds(): string[];
  dispatch(roll: SimpleDiceRoll): Promise<DiceDispatchResult>;
}

export const liveFateSink: FateSinkReader = {
  session: () => {
    const { currentTableId, currentUserId, currentUserName } = useRollSessionStore.getState();
    return { tableId: currentTableId, userId: currentUserId, userName: currentUserName };
  },
  handlerIds: () => diceDispatchManager.getAvailableHandlerIds(),
  dispatch: (roll) => diceDispatchManager.dispatch(roll),
};

export interface FateRootCapture {
  inSession: boolean;
  sentToChat: boolean;
  visibility: DiceVisibility;
  entryId: string;
  characterId?: string;
  characterName?: string;
  onBehalf: boolean;
}

/** Read right after the root roll returned: only a posted roll to `all`/`gm` with a bound sink is followable. */
export function captureFateRootDelivery(root: FateRootCapture, sink: Pick<FateSinkReader, "session" | "handlerIds">): FateRootDelivery {
  if (!root.inSession && !root.sentToChat) return { kind: "local" };
  if (!root.sentToChat) return { kind: "unverified", reason: "notPosted" };
  if (root.visibility !== "all" && root.visibility !== "gm") return { kind: "unverified", reason: "privateAudience" };
  const session = sink.session();
  const handlerId = sink.handlerIds()[0];
  if (!session.tableId || !session.userId || !handlerId) return { kind: "unverified", reason: "noBinding" };
  return {
    kind: "chat",
    entryId: root.entryId,
    audience: root.visibility,
    binding: { tableId: session.tableId, userId: session.userId, handlerId },
    ...(root.characterId ? { characterId: root.characterId } : {}),
    ...(root.characterName ? { characterName: root.characterName } : {}),
    onBehalf: root.onBehalf,
  };
}

/** The sheet the player is on now: a follow-up keeps the root's character attribution. */
export interface FateRollerNow {
  characterId?: string;
  onBehalf: boolean;
}

/** Checked when the picker opens and again immediately before the dispatch. */
export function verifyFateChatBinding(
  root: Extract<FateRootDelivery, { kind: "chat" }>, now: FateRollerNow, sink: Pick<FateSinkReader, "session" | "handlerIds">,
): { ok: true; userName: string } | { ok: false } {
  const session = sink.session();
  const sameBinding = session.tableId === root.binding.tableId && session.userId === root.binding.userId
    && sink.handlerIds()[0] === root.binding.handlerId;
  const sameSheet = now.characterId === root.characterId && now.onBehalf === root.onBehalf;
  return sameBinding && sameSheet && session.userName ? { ok: true, userName: session.userName } : { ok: false };
}

export type FateDeliveryMode =
  | { mode: "chat"; root: Extract<FateRootDelivery, { kind: "chat" }> }
  /** An active table's roll: invokes only through the table (never local, never the sink). */
  | { mode: "table"; root: Extract<FateRootDelivery, { kind: "table" }> }
  | { mode: "local" }
  /** Needs the player's explicit "on this sheet only" before any invoke, free or paid. */
  | { mode: "blocked"; reason: FateUnverifiedReason };

export function fateDeliveryMode(
  root: FateRootDelivery, localAck: boolean, now: FateRollerNow, sink: Pick<FateSinkReader, "session" | "handlerIds">,
): FateDeliveryMode {
  if (root.kind === "local") return { mode: "local" };
  if (root.kind === "table") return { mode: "table", root };
  if (root.kind === "chat" && verifyFateChatBinding(root, now, sink).ok) return { mode: "chat", root };
  if (localAck) return { mode: "local" };
  return { mode: "blocked", reason: root.kind === "unverified" ? root.reason : "bindingChanged" };
}

const SUCCESS_LEVEL: Record<FateOutcome, string> = { fail: "failure", tie: "tie", success: "success", style: "success-with-style" };

/**
 * The follow-up message for a completed invoke: actual faces and total, the root's audience and
 * attribution, a generic translated label with the root's short tag. No aspect text, no
 * `followsRollId`, no push or Luck fields: it is a plain new roll message.
 */
export function buildFateFollowUp(input: {
  messageId: string;
  timestamp: Date;
  root: Extract<FateRootDelivery, { kind: "chat" }>;
  userName: string;
  snapshot: FateRollSnapshot;
  result: FateRollResult;
  label: string;
}): SimpleDiceRoll {
  const { root, snapshot, result } = input;
  const modifier = result.total - sumFateFaces(snapshot.faces);
  return {
    id: input.messageId,
    timestamp: input.timestamp,
    rollerId: root.binding.userId,
    rollerName: input.userName,
    ...(root.characterId ? { characterId: root.characterId } : {}),
    ...(root.characterName ? { characterName: root.characterName } : {}),
    ...(root.onBehalf && root.characterId ? { onBehalf: true as const } : {}),
    visibility: root.audience,
    type: "simple",
    notation: `4dF${modifier < 0 ? "-" : "+"}${Math.abs(modifier)}`,
    rolls: [...snapshot.faces],
    total: result.total,
    label: input.label,
    comparator: ">=",
    targetValue: snapshot.opposition,
    successLevel: SUCCESS_LEVEL[result.outcome],
  };
}

/**
 * Posted, definitely refused (the database answered with a code, or there was no sink), or
 * unknown (it threw without saying: it may have landed). Only "rejected" may be reversed.
 */
// The host useSendDiceRoll retries once after AbortError without a dedupe key:
// a coded error on retry can still mean the first attempt was delivered. The host owns that fix.
export function classifyFateDispatch(result: DiceDispatchResult, hadHandler: boolean): "posted" | "rejected" | "unknown" {
  if (result.success) return "posted";
  if (!hadHandler || result.code) return "rejected";
  return "unknown";
}
