import { describe, expect, it } from "vitest";
import { applyPackTextFills, importedSheetData, packTextFills, stripPackText } from "./pack-text";

const exported = {
  name: "A",
  feats: [
    { id: "f1", name: "Whittler", ref: "feat:whittler", origin: "pack", text: "Craft faster." },
    { id: "f2", name: "Alert", origin: "srd", text: "x" },
  ],
  notes: "mine",
};

describe("stripPackText (D9, migration 165's strip_pack_text)", () => {
  it("drops only the text of pack rows, keeping ref, name and origin", () => {
    expect(stripPackText(exported)).toEqual({
      name: "A",
      feats: [
        { id: "f1", name: "Whittler", ref: "feat:whittler", origin: "pack" },
        { id: "f2", name: "Alert", origin: "srd", text: "x" },
      ],
      notes: "mine",
    });
  });
});

describe("importedSheetData (D9S-R2-F001)", () => {
  it("strips pack text from a JSON import into a table copy", () => {
    expect(importedSheetData(exported, { inTable: true })).toEqual(stripPackText(exported));
  });

  it("imports a vault sheet's file verbatim", () => {
    expect(importedSheetData(exported, { inTable: false })).toBe(exported);
  });
});

describe("packTextFills / applyPackTextFills (save-as-new device snapshot)", () => {
  const saved = {
    hp: 4,
    feats: [
      { id: "f1", name: "Whittler", ref: "feat:whittler", origin: "pack" },
      { id: "f2", name: "Alert", origin: "srd", text: "x" },
      { id: "f3", name: "Kept", ref: "feat:kept", origin: "pack", text: "already" },
    ],
  };
  const snapshot = {
    hp: 4,
    feats: [
      { id: "f1", name: "Whittler", ref: "feat:whittler", origin: "pack", text: "Craft faster." },
      { id: "f2", name: "Alert", origin: "srd", text: "x" },
      { id: "f3", name: "Kept", ref: "feat:kept", origin: "pack", text: "device text" },
    ],
  };

  it("lists only pack rows the snapshot gave text that had none", () => {
    expect(packTextFills(saved, snapshot)).toEqual([
      { list: "feats", index: 0, id: "f1", ref: "feat:whittler", name: "Whittler", text: "Craft faster." },
    ]);
  });

  it("puts the text on the matching pack row only, leaving every other row and field as is", () => {
    expect(applyPackTextFills(saved, packTextFills(saved, snapshot))).toEqual({
      ...saved,
      feats: [snapshot.feats[0], saved.feats[1], saved.feats[2]],
    });
  });

  it("matches by row id when the row moved, and never writes a custom row or a row with text", () => {
    const moved = { feats: [saved.feats[2], saved.feats[1], saved.feats[0]] };
    const fills = [
      { list: "feats", index: 0, id: "f1", ref: "feat:whittler", name: "Whittler", text: "T" },
      { list: "feats", index: 1, id: "f2", ref: "feat:x", name: "Alert", text: "nope" },
      { list: "feats", index: 0, id: "f3", ref: "feat:kept", name: "Kept", text: "nope" },
    ];
    expect(applyPackTextFills(moved, fills)).toEqual({
      feats: [saved.feats[2], saved.feats[1], { ...saved.feats[0], text: "T" }],
    });
  });

  it("skips a fill whose row was renamed or removed since", () => {
    const renamed = { feats: [{ id: "f1", name: "Mine", ref: "feat:whittler", origin: "pack" }] };
    expect(applyPackTextFills(renamed, [{ list: "feats", index: 0, id: "f1", ref: "feat:whittler", name: "Whittler", text: "T" }]))
      .toEqual(renamed);
    expect(applyPackTextFills({}, [{ list: "feats", index: 0, ref: "feat:whittler", name: "Whittler", text: "T" }])).toEqual({});
  });
});
