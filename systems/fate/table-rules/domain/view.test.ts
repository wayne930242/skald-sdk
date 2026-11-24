import { describe, expect, it } from "vitest";
import { parseFateScenePreview, parseFateSettledSnapshot, parseFateTableView } from "./view";

const scene = {
  id: "scene-1", ordinal: 1, title: "碼頭", status: "open", playSessionId: "ps-1", revision: 1,
  openedAt: "2026-11-22T18:22:18Z", roster: ["c-a", "c-b"],
  zones: [{ id: "z-1", name: "Dock", revision: 1 }],
  aspects: [{ id: "fire", kind: "situation", scope: "zone", zoneId: "z-1", characterId: null, text: "On fire", revision: 1 }],
  grants: [{
    id: "g-1", aspect: { kind: "scene", sceneAspectId: "fire" }, holder: { kind: "character", characterId: "c-a" },
    remaining: 1, isBoost: false, revision: 1, canUse: true,
  }, {
    id: "g-2", aspect: { kind: "character", characterId: "c-b", aspectId: "b-hc" }, holder: { kind: "hidden" },
    remaining: 2, isBoost: false, revision: 3, canUse: false,
  }],
};

const playerView = {
  pluginId: "fate-condensed", protocolVersion: 1,
  activation: { status: "active", revision: 1, protocolVersion: 1, pluginId: "fate-condensed" },
  revision: 7,
  playSession: { id: "ps-1", ordinal: 1, startedAt: "2026-11-22T18:22:18Z" },
  scene,
  wallets: [{ characterId: "c-a", name: "阿蓮", available: 3, revision: 4, canOperate: true, refreshedPlaySessionId: "ps-1" }],
  offers: [{
    id: "o-1", sceneId: "scene-1", targetCharacterId: "c-a", targetUserId: "u-a",
    aspect: { kind: "character", characterId: "c-a", aspectId: "a-tr" }, trouble: "Pay up", status: "pending",
    revision: 1, terminalOperationId: null, createdAt: "2026-11-22T18:22:18Z",
  }],
  ledger: [{
    id: 3, kind: "compel_accept", sceneId: "scene-1", playSessionId: "ps-1",
    from: { kind: "supply", characterId: null }, to: { kind: "wallet", characterId: "c-a" },
    amount: 1, reason: "", createdAt: "2026-11-22T18:22:18Z",
  }],
};

const gmView = {
  ...playerView,
  gmOnly: {
    gmRevision: 2,
    pool: { sceneId: "scene-1", base: 2, npcCredits: 1, available: 3, revision: 5 },
    secretAspects: [{ id: "trap", kind: "situation", scope: "scene", zoneId: null, characterId: null, text: "Trapdoor", revision: 1 }],
    secretGrants: [{
      id: "g-s", aspect: { kind: "scene", sceneAspectId: "trap" }, holder: { kind: "gm" },
      remaining: 1, isBoost: false, revision: 1, canUse: true,
    }],
    pendingCredits: [{ id: "d-1", characterId: "c-b", beneficiaryKind: "pc" }],
    npcCredits: [],
  },
};

describe("fate_table_view projection", () => {
  it("gives a player the kit's SecretProjection without any gmOnly part", () => {
    const view = parseFateTableView(playerView);
    expect(view.scene?.aspects).toEqual({ public: [scene.aspects[0]] });
    expect(view.scene?.grants.gmOnly).toBeUndefined();
    expect("gm" in view).toBe(false);
    expect(view.activation).toEqual({ status: "active", revision: 1, protocolVersion: 1 });
  });

  it("maps wallets to TableResources", () => {
    expect(parseFateTableView(playerView).wallets).toEqual([{
      id: "c-a", unit: "fatePoint", canView: true, canOperate: true, revision: 4, value: 3,
      characterId: "c-a", name: "阿蓮", refreshedPlaySessionId: "ps-1",
    }]);
  });

  it("adds the GM runner's secrets and pool", () => {
    const view = parseFateTableView(gmView);
    expect(view.scene?.aspects.gmOnly?.map((aspect) => aspect.text)).toEqual(["Trapdoor"]);
    expect(view.scene?.grants.gmOnly?.map((grant) => grant.id)).toEqual(["g-s"]);
    expect(view.gm?.pool).toMatchObject({ value: 3, base: 2, npcCredits: 1, unit: "fatePoint" });
    expect(view.gm?.pendingCredits).toEqual([{ id: "d-1", characterId: "c-b", beneficiaryKind: "pc" }]);
  });

  it("reads a table that was never activated", () => {
    expect(parseFateTableView({
      activation: { status: "inactive", revision: 0 }, revision: 0, playSession: null, scene: null,
      wallets: [], offers: [], ledger: [],
    })).toMatchObject({ activation: { status: "inactive", revision: 0 }, scene: null });
  });

  it("refuses a malformed view instead of showing spendable points", () => {
    expect(() => parseFateTableView({ ...playerView, wallets: [{ ...playerView.wallets[0], available: -1 }] })).toThrow();
    expect(() => parseFateTableView({ ...playerView, scene: { ...scene, grants: [{ ...scene.grants[0], holder: { kind: "x" } }] } })).toThrow();
    expect(() => parseFateTableView(null)).toThrow();
  });

  it("parses both scene previews", () => {
    expect(parseFateScenePreview({ token: "t", details: {
      change: "open", playSessionId: "ps-1", nextOrdinal: 2, npcCredits: [{ creditId: "d", characterId: "v", name: "Villain" }],
      candidates: [{ characterId: "c-a", name: "A", userId: "u-a", selectedByDefault: true, enrolled: true, fatePoints: 2 }],
    } }).details).toMatchObject({ change: "open", nextOrdinal: 2 });
    expect(parseFateScenePreview({ token: "t", details: {
      change: "close", sceneId: "scene-1", ordinal: 1, activeGrants: 2, activeBoosts: 0, poolAvailable: 2,
      pendingOffers: [{ offerId: "o", targetCharacterId: "c-b" }],
      pendingCredits: [{ creditId: "d", characterId: "c-b", beneficiaryKind: "pc" }],
    } }).details).toMatchObject({ change: "close", pendingOffers: [{ offerId: "o" }] });
  });

  it("carries out the booked balance only", () => {
    expect(parseFateSettledSnapshot({
      characterId: "c-a", fatePoints: 2, walletRevision: 9, tableRevision: 12,
      activation: { status: "inactive", revision: 2 }, tableDeleted: true,
    })).toEqual({
      characterId: "c-a", fatePoints: 2, walletRevision: 9, tableRevision: 12,
      activation: { status: "inactive", revision: 2 }, tableDeleted: true,
    });
  });
});
