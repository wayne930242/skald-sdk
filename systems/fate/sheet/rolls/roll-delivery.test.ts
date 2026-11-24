import { describe, expect, it } from "vitest";
import { createFateRoll, defaultFateRollOptions, resolveFateRoll } from "../../domain/roll";
import {
  buildFateFollowUp,
  captureFateRootDelivery,
  classifyFateDispatch,
  fateDeliveryMode,
  type FateRootDelivery,
  type FateSinkReader,
} from "./roll-delivery";
import { FATE_ROLL_RULES_OFF } from "./roll-rules";

function sink(session: { tableId: string | null; userId: string | null; userName: string | null }, handlers: string[]): Pick<FateSinkReader, "session" | "handlerIds"> {
  return { session: () => session, handlerIds: () => handlers };
}
const bound = sink({ tableId: "t-1", userId: "u-1", userName: "洪偉" }, ["chat:t-1:u-1"]);
const root = { inSession: true, sentToChat: true, visibility: "all" as const, entryId: "e-1", characterId: "c-1", characterName: "沈青霜", onBehalf: false };

describe("root delivery", () => {
  it("follows only a posted roll to all or gm through a bound sink", () => {
    expect(captureFateRootDelivery(root, bound)).toMatchObject({ kind: "chat", audience: "all", binding: { tableId: "t-1", userId: "u-1", handlerId: "chat:t-1:u-1" } });
    expect(captureFateRootDelivery({ ...root, visibility: "gm" }, bound)).toMatchObject({ kind: "chat", audience: "gm" });
    expect(captureFateRootDelivery({ ...root, visibility: "self" }, bound)).toEqual({ kind: "unverified", reason: "privateAudience" });
    expect(captureFateRootDelivery({ ...root, visibility: "selected" }, bound)).toEqual({ kind: "unverified", reason: "privateAudience" });
    expect(captureFateRootDelivery({ ...root, sentToChat: false }, bound)).toEqual({ kind: "unverified", reason: "notPosted" });
    expect(captureFateRootDelivery({ ...root, inSession: false, sentToChat: false }, bound)).toEqual({ kind: "local" });
    expect(captureFateRootDelivery(root, sink({ tableId: "t-1", userId: "u-1", userName: "x" }, []))).toEqual({ kind: "unverified", reason: "noBinding" });
  });

  it("blocks a broader or rebound follow-up until the player keeps it local", () => {
    const chat = captureFateRootDelivery(root, bound) as Extract<FateRootDelivery, { kind: "chat" }>;
    const now = { characterId: "c-1", onBehalf: false };
    expect(fateDeliveryMode(chat, false, now, bound).mode).toBe("chat");
    const otherTable = sink({ tableId: "t-2", userId: "u-1", userName: "洪偉" }, ["chat:t-2:u-1"]);
    expect(fateDeliveryMode(chat, false, now, otherTable)).toEqual({ mode: "blocked", reason: "bindingChanged" });
    expect(fateDeliveryMode(chat, true, now, otherTable)).toEqual({ mode: "local" });
    expect(fateDeliveryMode(chat, false, { characterId: "c-2", onBehalf: false }, bound).mode).toBe("blocked");
    expect(fateDeliveryMode(chat, false, now, sink({ tableId: "t-1", userId: "u-1", userName: "洪偉" }, ["another-sink"])).mode).toBe("blocked");
  });
});

describe("follow-up message", () => {
  it("is a new simple roll with the actual faces, the root audience and no aspect text", () => {
    const made = createFateRoll(
      { rootRollId: "r", characterId: "c-1", skillId: "fight", rating: 4, faces: [1, 0, -1, 1], options: { ...defaultFateRollOptions(), opposition: 3 }, visibility: "gm" },
      FATE_ROLL_RULES_OFF,
    );
    if (!made.ok) throw new Error(made.reason);
    const chat = captureFateRootDelivery({ ...root, visibility: "gm", onBehalf: true }, bound) as Extract<FateRootDelivery, { kind: "chat" }>;
    const message = buildFateFollowUp({
      messageId: "m-1", timestamp: new Date(0), root: chat, userName: "洪偉", snapshot: made.snapshot,
      result: resolveFateRoll(made.snapshot, FATE_ROLL_RULES_OFF), label: "戰鬥・援引 +2・#abcd",
    });
    expect(message).toMatchObject({
      id: "m-1", type: "simple", visibility: "gm", rolls: [1, 0, -1, 1], total: 5, notation: "4dF+4",
      comparator: ">=", targetValue: 3, successLevel: "success", characterId: "c-1", onBehalf: true, rollerId: "u-1",
    });
    expect(message).not.toHaveProperty("followsRollId");
    expect(message).not.toHaveProperty("pushed");
  });

  it("classifies only a coded refusal or a missing sink as rejected", () => {
    expect(classifyFateDispatch({ success: true }, true)).toBe("posted");
    expect(classifyFateDispatch({ success: false, error: "rls", code: "42501" }, true)).toBe("rejected");
    expect(classifyFateDispatch({ success: false, error: "No dice handler available" }, false)).toBe("rejected");
    expect(classifyFateDispatch({ success: false, error: "Failed to fetch" }, true)).toBe("unknown");
  });
});
