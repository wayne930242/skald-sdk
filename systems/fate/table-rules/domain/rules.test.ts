import { describe, expect, it } from "vitest";
import fixtures from "./rule-fixtures.json";
import {
  bookDeferredCredits,
  compelOutcome,
  fateWalletSeed,
  gmScenePool,
  hostileInvokePayee,
  sessionStartBalance,
} from "./rules";

describe("Fate table rules", () => {
  it.each(fixtures.resources)("seeds a wallet like the server: $name", ({ data, fatePoints, refresh }) => {
    expect(fateWalletSeed(data)).toEqual({ fatePoints, refresh });
  });

  // Its parity with the pgTAP test is checked privately (infrastructure/rule-fixtures-parity.test.ts).

  it("tops a wallet up to the refresh at a play session start, never down", () => {
    expect(sessionStartBalance(1, 3)).toBe(3);
    expect(sessionStartBalance(5, 2)).toBe(5);
    expect(sessionStartBalance(3, 3)).toBe(3);
  });

  it("accepts a compel for +1 and refuses one only with a point to pay", () => {
    expect(compelOutcome(0, true)).toEqual({ ok: true, value: { available: 1, delta: 1 } });
    expect(compelOutcome(2, false)).toEqual({ ok: true, value: { available: 1, delta: -1 } });
    expect(compelOutcome(0, false)).toEqual({ ok: false, code: "insufficient" });
  });

  it("sizes the GM pool by the confirmed roster and added NPC credits", () => {
    expect(gmScenePool(0)).toBe(0);
    expect(gmScenePool(3)).toBe(3);
    expect(gmScenePool(3, 1)).toBe(4);
  });

  it("books PC credits into wallets and keeps NPC credits for a later pool", () => {
    expect(bookDeferredCredits([
      { characterId: "b", beneficiaryKind: "pc" },
      { characterId: "villain", beneficiaryKind: "npc" },
      { characterId: "b", beneficiaryKind: "pc" },
      { characterId: "a", beneficiaryKind: "pc" },
    ])).toEqual({ wallets: { a: 1, b: 2 }, npcCredits: ["villain"] });
  });

  it("owes a hostile invoke's point only to another character's own aspect", () => {
    expect(hostileInvokePayee({ kind: "character", characterId: "b" }, "a", true)).toBe("b");
    expect(hostileInvokePayee({ kind: "character", characterId: "a" }, null, true)).toBe("a");
    expect(hostileInvokePayee({ kind: "character", characterId: "a" }, "a", true)).toBeNull();
    expect(hostileInvokePayee({ kind: "scene" }, "a", true)).toBeNull();
    expect(hostileInvokePayee({ kind: "character", characterId: "b" }, "a", false)).toBeNull();
  });
});
