import { describe, expect, it } from "vitest";
import { stripPackText } from "@skald/sheet-sdk/modules/character/pack-text";
import { PackTextIndex, packSnapshotBytes, snapshotPackRows } from "../../../content-pack/domain/overlay";
import { adoptHomebrewRows, asHomebrewRow, hasNewerHomebrew, stampOf, STAMP_FIELDS, type HomebrewStamp } from "../../domain/rows";

const stamp: HomebrewStamp = { pack: "pack-1", item: "item-1", rev: 3 };

describe("homebrew rows", () => {
  it("turns a picked pack row into a custom row with its text and a flat stamp", () => {
    const row = asHomebrewRow({ id: "f1", ref: "feat:lamplighter", name: "Lamplighter", origin: "pack" }, "Lights lamps.", stamp);
    expect(row).toEqual({
      id: "f1", ref: "feat:lamplighter", name: "Lamplighter", origin: "custom", text: "Lights lamps.",
      homebrewPack: "pack-1", homebrewItem: "item-1", homebrewRev: 3,
    });
    expect(STAMP_FIELDS).toEqual({ pack: "homebrewPack", item: "homebrewItem", rev: "homebrewRev" });
    expect(stampOf(row)).toEqual(stamp);
    // A table copy keeps a homebrew row's text (strip_pack_text drops only origin "pack").
    expect(stripPackText({ feats: [row] })).toEqual({ feats: [row] });
  });

  it("reads no stamp from a row without one or with a broken one", () => {
    expect(stampOf({ origin: "custom" })).toBeNull();
    expect(stampOf({ homebrewPack: "p", homebrewItem: "i", homebrewRev: 0 })).toBeNull();
    expect(stampOf({ homebrewPack: "p", homebrewItem: "", homebrewRev: 1 })).toBeNull();
    expect(stampOf({ homebrewPack: "p", homebrewItem: "i", homebrewRev: "2" })).toBeNull();
  });

  it("adopts only pack rows whose ref a homebrew pack supplies", () => {
    const data = {
      name: "Hero",
      feats: [
        { id: "a", ref: "feat:lamplighter", name: "Lamplighter", origin: "pack" },
        { id: "b", ref: "feat:lantern-watcher", name: "Lantern Watcher", origin: "pack", text: "Drive pack text." },
        { id: "c", ref: "feat:alert", name: "Alert", origin: "srd" },
      ],
      speciesTraits: [{ id: "species:mossfolk#soft-step", ref: "species:mossfolk", name: "Soft Step", origin: "pack" }],
    };
    const stamps = { "feat:lamplighter": stamp, "species:mossfolk": { pack: "pack-1", item: "item-2", rev: 1 } };
    const adopted = adoptHomebrewRows(data, stamps, (row) => `text of ${String(row.name)}`);
    expect(adopted.name).toBe("Hero");
    expect(adopted.feats).toEqual([
      asHomebrewRow(data.feats[0], "text of Lamplighter", stamp),
      data.feats[1],
      data.feats[2],
    ]);
    expect((adopted.speciesTraits as Array<Record<string, unknown>>)[0]).toMatchObject({ origin: "custom", text: "text of Soft Step", homebrewItem: "item-2" });
    // Then the table rule strips the Drive pack row's text and keeps the homebrew row's.
    const stripped = stripPackText(adopted).feats as Array<Record<string, unknown>>;
    expect(stripped[0].text).toBe("text of Lamplighter");
    expect(stripped[1]).not.toHaveProperty("text");
  });

  it("offers an update only for a later revision of the same item", () => {
    const row = asHomebrewRow({ ref: "spell:ember-lance", origin: "pack" }, "", stamp);
    expect(hasNewerHomebrew(row, { "spell:ember-lance": { ...stamp, rev: 4 } })).toBe(true);
    expect(hasNewerHomebrew(row, { "spell:ember-lance": stamp })).toBe(false);
    expect(hasNewerHomebrew(row, { "spell:ember-lance": { ...stamp, item: "other", rev: 9 } })).toBe(false);
    expect(hasNewerHomebrew(row, {})).toBe(false);
    expect(hasNewerHomebrew({ ref: "spell:ember-lance", origin: "custom" }, { "spell:ember-lance": { ...stamp, rev: 4 } })).toBe(false);
  });

  it("counts homebrew rows toward the 200 KB copied-text cap", () => {
    const homebrew = asHomebrewRow({ ref: "feat:x", name: "X", origin: "pack" }, "abc", stamp);
    const data = { feats: [homebrew, { ref: "feat:y", name: "Y", origin: "pack", text: "de" }, { name: "Z", origin: "custom", text: "ignored" }] };
    expect(packSnapshotBytes(data)).toBe(1 + 3 + 1 + 2);
    const index = new PackTextIndex({ entries: [], zhTW: {}, wizard: {} }, "en");
    expect(snapshotPackRows(data, index, new Set(["feats"]))).toEqual({ ok: true, data, bytes: 7 });
    const big = { feats: [asHomebrewRow({ ref: "feat:x", name: "X", origin: "pack" }, "x".repeat(205 * 1024), stamp)] };
    expect(snapshotPackRows(big, index, new Set(["feats"])).ok).toBe(false);
  });
});
