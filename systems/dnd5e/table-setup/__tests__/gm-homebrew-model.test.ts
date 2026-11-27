import { describe, expect, it } from "vitest";
import type { HomebrewItemKind, HomebrewItemRecord, HomebrewPayload } from "../../homebrew/domain/types";
import type { TableShare, TableShareItem, TableShareList } from "../../homebrew/table-share-port";
import { baselineOf, draftFromShare, isPickableKind, shareAction, viewShare, type ShareSnapshot } from "../gm-homebrew-model";

const ME = "viewer";
const OWNER = "owner";
const ASST = "asst";

function row(id: string, kind: HomebrewItemKind, key: string, extra: Record<string, unknown> = {}, revision = 1, bytes = 100): HomebrewItemRecord {
  return {
    id,
    packUuid: "pack",
    kind,
    key,
    payload: { entry: { kind, id: key, name: key, source: "homebrew", entries: [], ...extra } } as unknown as HomebrewPayload,
    revision,
    bytes,
    updatedAt: "2026-11-27T00:00:00Z",
  };
}

const copy = (source: string, revision = 1): TableShareItem => ({
  id: `copy-${source}`, kind: "spell", key: source, name: source, sourceItemId: source, sourcePackId: "pack", sourceRevision: revision,
});

function share(sharedBy: string, items: TableShareItem[], revision = 4, extra: Partial<TableShare> = {}): TableShare {
  return {
    sharedBy, revision, itemCount: items.length, payloadBytes: items.length * 100, createdAt: "2026-11-01", updatedAt: "2026-11-01",
    sharerName: sharedBy, isOwner: sharedBy === OWNER, items, ...extra,
  };
}

const list = (shares: TableShare[], viewerId = ME, ownerId: string | null = OWNER): TableShareList => ({ viewerId, ownerId, shares });

const rows = [
  row("spell", "spell", "ember"),
  row("sub", "subclass", "lamp/keeper", { meta: { parent: "lamp" } }),
  row("sf", "subclassFeature", "lamp/keeper/wick-l3"),
  row("class", "class", "lamp"),
  row("cf", "classFeature", "lamp/flare-l1"),
];

describe("the share picker's model", () => {
  it("ticks only entry kinds the viewer picks, never features or overlays", () => {
    expect(["spell", "class", "subclass", "lineage"].every((k) => isPickableKind(k as HomebrewItemKind))).toBe(true);
    expect(["classFeature", "subclassFeature", "overlay", "wizard"].some((k) => isPickableKind(k as HomebrewItemKind))).toBe(false);
  });

  it("starts from the share as read and sends nothing until the ticks change", () => {
    const snapshot: ShareSnapshot = { rows, list: list([share(ME, [copy("spell")], 7)]) };
    const draft = draftFromShare(snapshot);
    expect(draft).toEqual({ picked: ["spell"], refresh: false, removeDeleted: false });
    const baseline = baselineOf(snapshot);
    expect(shareAction(snapshot, draft, baseline, true)).toEqual({ kind: "none" });
    expect(shareAction(snapshot, { ...draft, picked: ["spell", "sub"] }, baseline, true)).toEqual({
      kind: "share", ids: ["spell", "sub", "sf", "class", "cf"], expectedRevision: 7,
    });
  });

  it("marks newer and deleted sources, and 「更新到桌上」 re-sends the live ones", () => {
    const snapshot: ShareSnapshot = {
      rows: [row("spell", "spell", "ember", {}, 3)],
      list: list([share(ME, [copy("spell", 1), copy("gone", 1)], 2)]),
    };
    const draft = draftFromShare(snapshot);
    const baseline = baselineOf(snapshot);
    const view = viewShare(snapshot, draft, baseline);
    expect([...view.status]).toEqual([["spell", "newer"], ["gone", "deleted"]]);
    expect(view.deleted.map((d) => d.sourceItemId)).toEqual(["gone"]);
    expect(view.hasNewer).toBe(true);
    expect(view.dirty).toBe(false);
    // Unchanged, the table's use is the share as it stands, the deleted copy included.
    expect(view.limits).toEqual({ items: 2, bytes: 200, over: null });
    expect(viewShare(snapshot, { ...draft, refresh: true }, baseline).limits).toEqual({ items: 1, bytes: 100, over: null });
    expect(shareAction(snapshot, { ...draft, refresh: true }, baseline, true)).toEqual({ kind: "share", ids: ["spell"], expectedRevision: 2 });
    expect(shareAction(snapshot, { ...draft, removeDeleted: true }, baseline, true)).toEqual({ kind: "share", ids: ["spell"], expectedRevision: 2 });
  });

  it("counts everyone else's share against the table's limits and refuses locally", () => {
    const big = [row("spell", "spell", "ember", {}, 1, 1_048_000)];
    const snapshot: ShareSnapshot = { rows: big, list: list([share(ASST, [copy("x")], 1, { itemCount: 299, payloadBytes: 1_000 })]) };
    const view = viewShare(snapshot, { picked: ["spell"], refresh: false, removeDeleted: false }, new Set());
    expect(view.limits).toEqual({ items: 300, bytes: 1_049_000, over: "bytes" });
    expect(shareAction(snapshot, { picked: ["spell"], refresh: false, removeDeleted: false }, new Set(), true)).toEqual({ kind: "blocked", over: "bytes" });
  });

  it("refuses locally a share with two rows of one kind and key, naming both", () => {
    const twins = [row("a", "spell", "ember"), { ...row("b", "spell", "ember"), packUuid: "other" }];
    const snapshot: ShareSnapshot = { rows: twins, list: list([]) };
    expect(shareAction(snapshot, { picked: ["a", "b"], refresh: false, removeDeleted: false }, new Set(), true)).toEqual({
      kind: "duplicate", first: "a", second: "b",
    });
  });

  it("on untick removes the viewer's own share, and the owner's removal takes everyone's", () => {
    const shares = [share(OWNER, [copy("a")]), share(ASST, [copy("b")])];
    const asOwner: ShareSnapshot = { rows: [], list: list(shares, OWNER) };
    expect(shareAction(asOwner, draftFromShare(asOwner), baselineOf(asOwner), false)).toEqual({ kind: "remove", sharers: [OWNER, ASST] });
    const asAssistant: ShareSnapshot = { rows: [], list: list(shares, ASST) };
    expect(shareAction(asAssistant, draftFromShare(asAssistant), baselineOf(asAssistant), false)).toEqual({ kind: "remove", sharers: [ASST] });
    const noShare: ShareSnapshot = { rows: [], list: list([share(OWNER, [copy("a")])], ASST) };
    expect(shareAction(noShare, draftFromShare(noShare), baselineOf(noShare), false)).toEqual({ kind: "none" });
  });
});
