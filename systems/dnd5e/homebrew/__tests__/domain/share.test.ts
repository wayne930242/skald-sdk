import { describe, expect, it } from "vitest";
import {
  checkShareLimits,
  isShareableKind,
  refreshShare,
  shareClosure,
  sharedStatus,
  TABLE_HOMEBREW_LIMITS,
} from "../../domain/share";
import type { HomebrewItemKind, HomebrewItemRecord, HomebrewPayload } from "../../domain/types";

const PACK = "pack-a";
const OTHER_PACK = "pack-b";

function row(id: string, kind: HomebrewItemKind, key: string, payload: Partial<HomebrewPayload> = {}, pack = PACK): HomebrewItemRecord {
  return {
    id,
    packUuid: pack,
    kind,
    key,
    payload: { entry: { kind: kind as never, id: key, name: key, source: "homebrew", entries: [] }, ...payload } as HomebrewPayload,
    revision: 1,
    bytes: 100,
    updatedAt: "2026-11-27T00:00:00Z",
  };
}

const entry = (kind: string, id: string, extra: Record<string, unknown> = {}) =>
  ({ entry: { kind, id, name: id, source: "homebrew", entries: [], ...extra } }) as unknown as Partial<HomebrewPayload>;

describe("shareClosure", () => {
  it("takes a class's features from its own pack", () => {
    const rows = [
      row("c", "class", "lamp"),
      row("f1", "classFeature", "lamp/flare-l1"),
      row("f2", "classFeature", "lamp/glow-l2"),
      row("fx", "classFeature", "lamp/flare-l1", {}, OTHER_PACK),
      row("other", "classFeature", "lampx/flare-l1"),
    ];
    const closure = shareClosure(rows, ["c"]);
    expect(closure.ids).toEqual(["c", "f1", "f2"]);
    expect(closure.added).toEqual([
      { id: "f1", by: "c", reason: "classFeature" },
      { id: "f2", by: "c", reason: "classFeature" },
    ]);
  });

  it("takes a subclass's features and its homebrew parent class with that class's features", () => {
    const rows = [
      row("s", "subclass", "lamp/keeper", entry("subclass", "lamp/keeper", { meta: { parent: "lamp" } })),
      row("sf", "subclassFeature", "lamp/keeper/wick-l3"),
      row("c", "class", "lamp"),
      row("cf", "classFeature", "lamp/flare-l1"),
    ];
    const closure = shareClosure(rows, ["s"]);
    expect(closure.ids).toEqual(["s", "sf", "c", "cf"]);
    expect(closure.added.map((a) => [a.id, a.by, a.reason])).toEqual([
      ["sf", "s", "subclassFeature"],
      ["c", "s", "parentClass"],
      ["cf", "c", "classFeature"],
    ]);
  });

  it("adds nothing for a subclass of a built-in class", () => {
    const rows = [row("s", "subclass", "fighter/keeper", entry("subclass", "fighter/keeper", { meta: { parent: "fighter" } }))];
    expect(shareClosure(rows, ["s"]).ids).toEqual(["s"]);
  });

  it("takes a background's homebrew origin feat, not a built-in one", () => {
    const rows = [
      row("b", "background", "lamplighter", entry("background", "lamplighter", { meta: { originFeat: { ref: "feat:wick" } } })),
      row("b2", "background", "sage", entry("background", "sage", { meta: { originFeat: { ref: "feat:alert" } } })),
      row("w", "feat", "wick"),
    ];
    expect(shareClosure(rows, ["b"]).added).toEqual([{ id: "w", by: "b", reason: "originFeat" }]);
    expect(shareClosure(rows, ["b2"]).ids).toEqual(["b2"]);
  });

  it("keeps the picked order, counts an id once and refuses unknown, overlay and wizard ids", () => {
    const rows = [row("a", "spell", "a"), row("o", "overlay", "spell:light"), row("w", "wizard", "feats/x"), row("c", "class", "c"), row("cf", "classFeature", "c/x")];
    const closure = shareClosure(rows, ["a", "cf", "c", "a", "ghost", "o", "w"]);
    expect(closure.ids).toEqual(["a", "cf", "c"]);
    expect(closure.added).toEqual([]);
    expect(closure.refused).toEqual(["ghost", "o", "w"]);
    expect(isShareableKind("spell")).toBe(true);
    expect(isShareableKind("overlay")).toBe(false);
  });

  it("names two rows of one kind and key, as the server refuses the later one", () => {
    const rows = [
      row("a", "spell", "ember"),
      row("b", "spell", "ember", {}, OTHER_PACK),
      row("sub", "subclass", "lamp/keeper", entry("subclass", "lamp/keeper", { meta: { parent: "lamp" } }), OTHER_PACK),
      row("cA", "class", "lamp"),
      row("cB", "class", "lamp", {}, OTHER_PACK),
    ];
    expect(shareClosure(rows, ["a", "b"]).duplicates).toEqual([{ first: "a", second: "b" }]);
    // The subclass brings its own pack's class, which repeats the class ticked from another pack.
    expect(shareClosure(rows, ["cA", "sub"]).duplicates).toEqual([{ first: "cA", second: "cB" }]);
    expect(shareClosure(rows, ["a", "cA"]).duplicates).toEqual([]);
  });

  it("warns about text tags and subclass spells naming homebrew left out", () => {
    const rows = [
      row("f", "feat", "wick", entry("feat", "wick", { entries: ["Cast {@spell Ember Lance} or {@race Lampkin|homebrew}."] })),
      row("sp", "spell", "ember-lance", entry("spell", "ember-lance", { name: "Ember Lance" })),
      row("r", "species", "lampkin"),
      row("s", "subclass", "fighter/keeper", entry("subclass", "fighter/keeper", { meta: { parent: "fighter", spells: [{ level: 3, refs: ["spell:glow", "spell:light"] }] } })),
      row("g", "spell", "glow"),
    ];
    expect(shareClosure(rows, ["f", "s"]).links).toEqual([
      { from: "f", to: "sp" },
      { from: "f", to: "r" },
      { from: "s", to: "g" },
    ]);
    expect(shareClosure(rows, ["f", "sp", "r"]).links).toEqual([]);
  });
});

describe("checkShareLimits", () => {
  const bytes = (n: number) => ({ bytes: n });

  it("adds the other sharers and stops at the table's limits", () => {
    expect(checkShareLimits([bytes(10), bytes(20)], [{ items: 3, bytes: 5 }])).toEqual({ items: 5, bytes: 35, over: null });
    const full = Array.from({ length: 100 }, () => bytes(1));
    expect(checkShareLimits(full, [{ items: 200, bytes: 0 }]).over).toBeNull();
    expect(checkShareLimits([...full, bytes(1)], [{ items: 200, bytes: 0 }]).over).toBe("items");
    expect(checkShareLimits([bytes(TABLE_HOMEBREW_LIMITS.bytes - 4)], [{ items: 1, bytes: 4 }]).over).toBeNull();
    expect(checkShareLimits([bytes(TABLE_HOMEBREW_LIMITS.bytes - 3)], [{ items: 1, bytes: 4 }]).over).toBe("bytes");
  });

  it("mirrors the server's 300 rows and 1 MiB", () => {
    expect(TABLE_HOMEBREW_LIMITS).toEqual({ items: 300, bytes: 1_048_576 });
  });
});

describe("sharedStatus and refreshShare", () => {
  const sources = [
    { id: "a", revision: 2 },
    { id: "b", revision: 1 },
  ];

  it("marks a newer source and a deleted one", () => {
    expect(sharedStatus({ sourceItemId: "a", sourceRevision: 1 }, sources)).toBe("newer");
    expect(sharedStatus({ sourceItemId: "b", sourceRevision: 1 }, sources)).toBe("current");
    expect(sharedStatus({ sourceItemId: "gone", sourceRevision: 1 }, sources)).toBe("deleted");
  });

  it("re-selects every live source and drops the deleted ones", () => {
    const shared = [
      { sourceItemId: "a", sourceRevision: 1 },
      { sourceItemId: "gone", sourceRevision: 4 },
      { sourceItemId: "b", sourceRevision: 1 },
    ];
    expect(refreshShare(shared, sources)).toEqual({ ids: ["a", "b"], dropped: [{ sourceItemId: "gone", sourceRevision: 4 }] });
  });
});
