// Shared avatar resolution helpers used by both apps/web (message send path)
// and apps/bot (Discord embed construction defensive guard).

import type { SpeakMode } from "./types";

/** True only for values Discord's embed API (and <img src>) can actually load. */
export function isPublicHttpUrl(url: string | null | undefined): boolean {
  return typeof url === "string" && /^https?:\/\//.test(url);
}

export interface ResolveAvatarUrlInput {
  /** The active character's `data.portrait`, if this message is tied to a character. */
  characterPortrait?: string | null;
  /** The sender's `table_members.avatar_url` for this table. */
  memberAvatarUrl?: string | null;
  /** The sender's account avatar (`profiles.avatar_url`). */
  senderAvatarUrl?: string | null;
  /** OOC messages skip the character/member priority and always use the account avatar. */
  speakMode?: SpeakMode;
}

/**
 * Priority: character portrait > table member avatar > account avatar > none.
 * Each candidate is validated with `isPublicHttpUrl` so a stale/invalid value
 * (e.g. leftover base64) falls through to the next candidate instead of
 * being returned as-is.
 */
export function resolveAvatarUrl({
  characterPortrait,
  memberAvatarUrl,
  senderAvatarUrl,
  speakMode,
}: ResolveAvatarUrlInput): string | undefined {
  if (speakMode === "ooc") {
    return isPublicHttpUrl(senderAvatarUrl) ? senderAvatarUrl! : undefined;
  }
  if (isPublicHttpUrl(characterPortrait)) return characterPortrait!;
  if (isPublicHttpUrl(memberAvatarUrl)) return memberAvatarUrl!;
  if (isPublicHttpUrl(senderAvatarUrl)) return senderAvatarUrl!;
  return undefined;
}
