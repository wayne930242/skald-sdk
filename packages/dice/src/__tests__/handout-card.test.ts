import { describe, it, expect } from "vitest";
import { parseHandoutCardData } from "../handout-card";

describe("parseHandoutCardData", () => {
  it("reads the release shape written by issue_handout", () => {
    const card = parseHandoutCardData({
      type: "handout",
      pageId: "page-1",
      pageTitle: "倉庫管理員的便條",
      pageType: "letter",
      summary: "「週四晚上不要靠近三號倉庫。」",
      audience: "all",
      revealMode: "staged",
      hiddenCount: 2,
      issuedAt: "2026-10-26T01:00:00.000Z",
    });

    expect(card).toEqual({
      pageId: "page-1",
      pageTitle: "倉庫管理員的便條",
      pageType: "letter",
      summary: "「週四晚上不要靠近三號倉庫。」",
      audience: "all",
      revealMode: "staged",
      hiddenCount: 2,
      issuedAt: "2026-10-26T01:00:00.000Z",
      recipientIds: [],
      legacy: false,
    });
  });

  it("carries revokedAt and the recipients of a selected card", () => {
    const card = parseHandoutCardData(
      {
        type: "handout",
        pageId: "page-2",
        pageTitle: "第二封信",
        pageType: "letter",
        audience: "selected",
        revealMode: "whole",
        hiddenCount: 0,
        issuedAt: "2026-10-26T01:00:00.000Z",
        revokedAt: "2026-10-26T02:00:00.000Z",
      },
      ["user-a", "user-b"],
    );

    expect(card?.audience).toBe("selected");
    expect(card?.recipientIds).toEqual(["user-a", "user-b"]);
    expect(card?.revokedAt).toBe("2026-10-26T02:00:00.000Z");
    expect(card?.summary).toBe("");
    expect(card?.legacy).toBe(false);
  });

  it("reads the old pushed-handout shape as a legacy card for everyone", () => {
    const card = parseHandoutCardData({
      type: "handout",
      pageId: "page-3",
      pageTitle: "舊的講義",
      pageType: "doc",
      thumbnailUrl: "https://example.com/a.png",
    });

    expect(card).toMatchObject({
      pageId: "page-3",
      pageTitle: "舊的講義",
      pageType: "doc",
      thumbnailUrl: "https://example.com/a.png",
      audience: "all",
      revealMode: "whole",
      hiddenCount: 0,
      summary: "",
      recipientIds: [],
      legacy: true,
    });
    expect(card?.issuedAt).toBeUndefined();
    expect(card?.revokedAt).toBeUndefined();
  });

  it("does not trust recipients on an audience-all card or a malformed hiddenCount", () => {
    const card = parseHandoutCardData(
      {
        pageId: "page-4",
        pageTitle: "x",
        pageType: "doc",
        audience: "all",
        issuedAt: "2026-10-26T01:00:00.000Z",
        hiddenCount: -3,
      },
      ["user-a"],
    );

    expect(card?.recipientIds).toEqual([]);
    expect(card?.hiddenCount).toBe(0);
  });

  it("returns null when there is no page to point at", () => {
    expect(parseHandoutCardData(null)).toBeNull();
    expect(parseHandoutCardData("handout")).toBeNull();
    expect(parseHandoutCardData({ pageTitle: "no id" })).toBeNull();
    expect(parseHandoutCardData({ pageId: "", pageTitle: "empty id" })).toBeNull();
  });
});
