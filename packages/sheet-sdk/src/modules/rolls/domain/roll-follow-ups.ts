// modules/rolls/domain/roll-follow-ups.ts
//
// A push or a Luck spend is its own chat message (its own row, its own visibility)
// that names the roll it follows. The chat draws it attached under that roll's card
// when the roll is among the loaded messages.
import type { ChatMessage } from "@skald/dice";
import { isFollowUp } from "./roll-card-model";

/** The unique index of migration 132: one push per roll, one Luck spend per starting level */
const FOLLOW_UP_ONCE_INDEX = "table_messages_roll_follow_up_once";

/**
 * Whether a failed send was the database refusing a follow-up that was already posted
 * (the same roll pushed from another tab or from Discord). Retrying cannot succeed, and
 * the roll was pushed, so the web says so instead of reporting a generic failure.
 */
export function isFollowUpAlreadyPosted(failure: { code?: string; error?: string }): boolean {
  return failure.code === "23505" && (failure.error ?? "").includes(FOLLOW_UP_ONCE_INDEX);
}

/** Follow-up message id → the message holding the roll it follows; only for originals that are loaded */
export function rollFollowTargets(messages: readonly ChatMessage[]): Map<string, ChatMessage> {
  const byRollId = new Map<string, ChatMessage>();
  for (const message of messages) {
    if (message.type === "dice_roll" && message.diceRoll) byRollId.set(message.diceRoll.id, message);
  }
  const targets = new Map<string, ChatMessage>();
  for (const message of messages) {
    const roll = message.diceRoll;
    if (message.type !== "dice_roll" || !roll || !isFollowUp(roll) || !roll.followsRollId) continue;
    const original = byRollId.get(roll.followsRollId);
    // followsRollId comes from the client: only attach under the sender's own roll
    if (original && original.id !== message.id && original.senderId === message.senderId) {
      targets.set(message.id, original);
    }
  }
  return targets;
}
