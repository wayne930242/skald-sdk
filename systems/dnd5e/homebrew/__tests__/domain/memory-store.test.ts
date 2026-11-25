import { describe, expect, it } from "vitest";
import { homebrewPayloadBytes, HOMEBREW_LIMITS } from "../../domain/limits";
import type { HomebrewPayload } from "../../domain/types";
import { createMemoryHomebrewStore } from "../../testing/memory-store";

const payload = (text: string): HomebrewPayload => ({ entry: { kind: "feat", id: "x", name: "X", entries: [text] } });

async function value<T>(promise: Promise<{ ok: true; value: T } | { ok: false; error: string }>): Promise<T> {
  const result = await promise;
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

describe("the in-memory homebrew store", () => {
  it("writes only for an account", async () => {
    const store = createMemoryHomebrewStore({ owner: "guest" });
    expect(await store.owner()).toBe("guest");
    expect(await store.createPack({ packId: "a", name: "A" })).toEqual({ ok: false, error: "signIn" });
    expect(await store.defaultPack()).toEqual({ ok: false, error: "signIn" });
    expect(await store.listPacks()).toEqual({ ok: true, value: [] });
  });

  it("creates the default pack once, then keeps answering it", async () => {
    const store = createMemoryHomebrewStore({ defaultPackName: "Mine" });
    const first = await value(store.defaultPack());
    expect(first).toMatchObject({ packId: "my-homebrew", name: "Mine", position: 0, enabled: true, revision: 1 });
    expect((await value(store.defaultPack())).id).toBe(first.id);
    expect(await store.createPack({ packId: "my-homebrew", name: "Again" })).toEqual({ ok: false, error: "duplicatePackId" });
    expect(await store.createPack({ packId: "Bad Id", name: "x" })).toEqual({ ok: false, error: "invalid" });
  });

  it("owns revisions: payload changes bump the item and its pack, position alone does not", async () => {
    const store = createMemoryHomebrewStore();
    const pack = await value(store.createPack({ packId: "p", name: "P" }));
    const item = await value(store.saveItem(pack.id, { kind: "feat", key: "x", payload: payload("one") }));
    expect(item).toMatchObject({ revision: 1, bytes: homebrewPayloadBytes(payload("one")) });
    const [afterInsert] = await value(store.listPacks());
    expect(afterInsert.revision).toBe(2);
    const same = await value(store.saveItem(pack.id, { id: item.id, kind: "feat", key: "x", payload: payload("one"), expectedRevision: 1 }));
    expect(same.revision).toBe(1);
    const changed = await value(store.saveItem(pack.id, { id: item.id, kind: "feat", key: "x", payload: payload("two"), expectedRevision: 1 }));
    expect(changed.revision).toBe(2);
    expect(await store.saveItem(pack.id, { id: item.id, kind: "feat", key: "x", payload: payload("three"), expectedRevision: 1 }))
      .toEqual({ ok: false, error: "conflict" });
    expect((await value(store.updatePack(pack.id, { position: 4 }))).revision).toBe(3);
    expect((await value(store.updatePack(pack.id, { enabled: false }))).revision).toBe(4);
  });

  it("refuses a repeated key, an unknown kind, an oversized row and a missing pack", async () => {
    const store = createMemoryHomebrewStore();
    const pack = await value(store.createPack({ packId: "p", name: "P" }));
    await value(store.saveItem(pack.id, { kind: "feat", key: "x", payload: payload("a") }));
    expect(await store.saveItem(pack.id, { kind: "feat", key: "x", payload: payload("b") })).toEqual({ ok: false, error: "duplicateKey" });
    expect(await store.saveItem(pack.id, { kind: "monster" as never, key: "y", payload: payload("b") })).toEqual({ ok: false, error: "invalid" });
    expect(await store.saveItem(pack.id, { kind: "feat", key: "big", payload: payload("x".repeat(HOMEBREW_LIMITS.itemBytes)) }))
      .toEqual({ ok: false, error: "invalid" });
    expect(await store.saveItem("nope", { kind: "feat", key: "z", payload: payload("c") })).toEqual({ ok: false, error: "notFound" });
    expect(await store.deleteItem("nope")).toEqual({ ok: false, error: "notFound" });
  });

  it("reports the committed prefix when a batch reaches the item limit", async () => {
    const store = createMemoryHomebrewStore({ limits: { items: 1 } });
    const pack = await value(store.createPack({ packId: "p", name: "P" }));
    const writes = ["a", "b", "c"].map(key => ({ kind: "feat" as const, key, payload: payload(key) }));
    expect(await store.saveItems(pack.id, { writes, deletes: [] })).toMatchObject({ error: "limitItems", detail: "1" });
    expect((await value(store.listItems(pack.id))).map(row => row.key)).toEqual(["a"]);
  });

  it("notifies once per batch, not once per row", async () => {
    let writes = 0;
    const store = createMemoryHomebrewStore({ onWrite: () => void (writes += 1) });
    const pack = await value(store.createPack({ packId: "p", name: "P" }));
    const old = await value(store.saveItem(pack.id, { kind: "feat", key: "old", payload: payload("old") }));
    writes = 0;
    const rows = ["a", "b", "c"].map(key => ({ kind: "feat" as const, key, payload: payload(key) }));
    expect((await store.saveItems(pack.id, { writes: rows, deletes: [old.id] })).ok).toBe(true);
    expect(writes).toBe(1);
  });

  it("holds the item, byte and pack limits of an account", async () => {
    const store = createMemoryHomebrewStore({ limits: { items: 2, bytes: 400, packs: 2 } });
    const pack = await value(store.createPack({ packId: "p", name: "P" }));
    await value(store.saveItem(pack.id, { kind: "feat", key: "a", payload: payload("a") }));
    const b = await value(store.saveItem(pack.id, { kind: "feat", key: "b", payload: payload("b") }));
    expect(await store.saveItem(pack.id, { kind: "feat", key: "c", payload: payload("c") })).toEqual({ ok: false, error: "limitItems" });
    expect(await store.saveItem(pack.id, { id: b.id, kind: "feat", key: "b", payload: payload("b".repeat(400)) })).toEqual({ ok: false, error: "limitBytes" });
    // An update that stays under the cap is fine.
    expect((await store.saveItem(pack.id, { id: b.id, kind: "feat", key: "b", payload: payload("bb") })).ok).toBe(true);
    await value(store.createPack({ packId: "q", name: "Q" }));
    expect(await store.createPack({ packId: "r", name: "R" })).toEqual({ ok: false, error: "limitPacks" });
    expect(await value(store.usage())).toEqual({ items: 2, bytes: homebrewPayloadBytes(payload("a")) + homebrewPayloadBytes(payload("bb")), packs: 2 });
  });

  it("imports all or nothing, and replaces an own pack's rows", async () => {
    let writes = 0;
    const store = createMemoryHomebrewStore({ limits: { items: 3 }, onWrite: () => void (writes += 1) });
    const manifest = { packId: "lantern-table", name: "Lantern", notice: "", packVersion: "1.0.0" };
    const rows = [
      { kind: "feat" as const, key: "a", payload: payload("a") },
      { kind: "overlay" as const, key: "spell:light", payload: { overlay: { en: { entries: ["warm"] } } } },
    ];
    const pack = await value(store.importPack({ manifest, items: rows }));
    expect((await value(store.listItems(pack.id))).map((row) => `${row.kind}:${row.key}`)).toEqual(["feat:a", "overlay:spell:light"]);
    expect(writes).toBe(1);

    const tooMany = [...rows, { kind: "feat" as const, key: "b", payload: payload("b") }, { kind: "feat" as const, key: "c", payload: payload("c") }];
    expect(await store.importPack({ manifest: { ...manifest, packId: "other" }, items: tooMany })).toEqual({ ok: false, error: "limitItems" });
    expect(await store.importPack({ manifest: { ...manifest, packId: "other" }, items: [rows[0], rows[0]] }))
      .toMatchObject({ ok: false, error: "duplicateKey" });
    expect(await store.importPack({ manifest, items: rows })).toEqual({ ok: false, error: "duplicatePackId" });
    expect((await value(store.listPacks())).length).toBe(1);

    const replaced = await value(store.importPack({ manifest: { ...manifest, name: "Lantern 2" }, items: [rows[1]], replace: pack.id }));
    expect(replaced).toMatchObject({ id: pack.id, name: "Lantern 2", revision: pack.revision + 1 });
    expect((await value(store.listItems(pack.id))).map((row) => row.key)).toEqual(["spell:light"]);
    expect(await store.importPack({ manifest, items: [], replace: "someone-elses" })).toEqual({ ok: false, error: "notFound" });

    await value(store.deletePack(pack.id));
    expect(await value(store.usage())).toEqual({ items: 0, bytes: 0, packs: 0 });
  });

  it("measures payloads as jsonb text", () => {
    expect(homebrewPayloadBytes({})).toBe(2);
    expect(homebrewPayloadBytes({ a: 1 })).toBe('{"a": 1}'.length);
    expect(homebrewPayloadBytes({ a: [1, "x"], b: null })).toBe('{"a": [1, "x"], "b": null}'.length);
    expect(homebrewPayloadBytes({ name: "燈" })).toBe('{"name": ""}'.length + 3);
  });
});
