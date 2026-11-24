import type { HandoutCardData } from "./types";

function str(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/**
 * Parse the `dice_data` of a `handout` chat message. Accepts the release shape
 * (`issue_handout`: audience, revealMode, hiddenCount, issuedAt, revokedAt?)
 * and the older pushed-handout shape, which carries only the page's title and
 * type and is returned with `legacy: true`. `null` when there is no page id.
 *
 * `visibleToMemberIds` is the message's own column; it names the recipients of
 * a `selected` card and is ignored for an `all` card.
 */
export function parseHandoutCardData(
  raw: unknown,
  visibleToMemberIds?: readonly string[] | null,
): HandoutCardData | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;

  const pageId = str(data.pageId);
  if (!pageId) return null;

  const issuedAt = str(data.issuedAt);
  const legacy = issuedAt === undefined && data.audience === undefined;
  const audience = data.audience === "selected" ? "selected" : "all";
  const hiddenCount =
    typeof data.hiddenCount === "number" && Number.isFinite(data.hiddenCount) && data.hiddenCount > 0
      ? Math.floor(data.hiddenCount)
      : 0;

  const card: HandoutCardData = {
    pageId,
    pageTitle: str(data.pageTitle) ?? "",
    pageType: str(data.pageType) ?? "",
    summary: str(data.summary) ?? "",
    audience,
    revealMode: data.revealMode === "staged" ? "staged" : "whole",
    hiddenCount,
    recipientIds: audience === "selected" ? [...(visibleToMemberIds ?? [])] : [],
    legacy,
  };
  if (issuedAt !== undefined) card.issuedAt = issuedAt;
  const revokedAt = str(data.revokedAt);
  if (revokedAt !== undefined) card.revokedAt = revokedAt;
  const thumbnailUrl = str(data.thumbnailUrl);
  if (thumbnailUrl !== undefined) card.thumbnailUrl = thumbnailUrl;
  return card;
}
