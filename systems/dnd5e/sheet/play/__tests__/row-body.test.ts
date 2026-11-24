import { describe, expect, it } from "vitest";
import schemaJson from "@skald/system-dnd5e/data/dnd5e-2024/schema.json";
import { SNAPSHOT_MAX_CHARS } from "../../../reference/entries-to-text";
import { PLAYER_TEXT_LISTS, PLAYER_TEXT_MAX_CHARS, capPlayerText, rowBodyText, textEditSave, textEditStart } from "../row-body";

const srd = "Corpus text in the viewer's locale.";

describe("rowBodyText (plan-uat2 §3.4, read by print)", () => {
  it("shows the player's own text first, over an SRD row's corpus text", () => {
    expect(rowBodyText({ origin: "srd", ref: "spell:light", text: "", playerText: "My light." }, srd)).toBe("My light.");
  });

  it("shows the player's own text over a pack row's snapshot", () => {
    expect(rowBodyText({ origin: "pack", ref: "feat:x", text: "Pack words.", playerText: "Mine." }, srd)).toBe("Mine.");
  });

  it("shows a pack row's snapshot, never the corpus", () => {
    expect(rowBodyText({ origin: "pack", ref: "feat:x", text: "Pack words." }, srd)).toBe("Pack words.");
    expect(rowBodyText({ origin: "pack", ref: "feat:x", text: "" }, srd)).toBe("");
  });

  it("shows a custom row's own text", () => {
    expect(rowBodyText({ origin: "custom", text: "Homebrew." }, srd)).toBe("Homebrew.");
  });

  it("shows an SRD row's live corpus text; a blank player text does not hide it", () => {
    expect(rowBodyText({ origin: "srd", ref: "spell:light", text: "" }, srd)).toBe(srd);
    expect(rowBodyText({ origin: "srd", ref: "spell:light", text: "", playerText: "  \n" }, srd)).toBe(srd);
    expect(rowBodyText({ origin: "srd", ref: "spell:light", text: "" }, null)).toBe("");
  });
});

describe("the text editor's start (plan-uat2 §3.4)", () => {
  it("prefills an SRD row with the resolved corpus text, so the player can trim it", () => {
    expect(textEditStart({ origin: "srd", ref: "spell:light", text: "" }, srd)).toEqual({ field: "playerText", value: srd, beside: "" });
  });

  it("starts a pack row empty, with the pack text shown beside it: pack text is never copied", () => {
    expect(textEditStart({ origin: "pack", ref: "feat:x", text: "Pack words." }, srd)).toEqual({ field: "playerText", value: "", beside: "Pack words." });
  });

  it("resumes the player's own text where there is one", () => {
    expect(textEditStart({ origin: "pack", text: "Pack words.", playerText: "Mine." }, srd).value).toBe("Mine.");
  });

  it("edits a custom row's own text in place", () => {
    expect(textEditStart({ origin: "custom", text: "Homebrew." }, null)).toEqual({ field: "text", value: "Homebrew.", beside: "" });
  });
});

describe("the text editor's save (plan-uat2 §3.4)", () => {
  it("writes nothing for an SRD row saved as it opened: the corpus text is not copied into playerText", () => {
    const start = textEditStart({ origin: "srd", ref: "spell:light", text: "" }, srd);
    expect(textEditSave(start, srd)).toBeNull();
    expect(textEditSave(start, "Trimmed.")).toEqual({ field: "playerText", value: "Trimmed." });
  });

  it("writes nothing for a long corpus text left as it was, though the editor capped it", () => {
    const long = "y".repeat(9000);
    const start = textEditStart({ origin: "srd", ref: "spell:light", text: "" }, long);
    expect(textEditSave(start, capPlayerText(long))).toBeNull();
  });

  it("writes a custom row's changed text to its own text", () => {
    expect(textEditSave(textEditStart({ origin: "custom", text: "Old." }, null), "New.")).toEqual({ field: "text", value: "New." });
  });
});

describe("the player text cap", () => {
  it("caps at 8,000 characters, the pack row snapshot cap", () => {
    expect(PLAYER_TEXT_MAX_CHARS).toBe(SNAPSHOT_MAX_CHARS);
    expect(capPlayerText("x".repeat(9000))).toHaveLength(8000);
    expect(capPlayerText("short")).toBe("short");
  });
});

describe("the playerText row field", () => {
  const fields = (schemaJson as { fields: Record<string, { rowTemplate?: { children: Array<Record<string, unknown>> } }> }).fields;
  it.each([...PLAYER_TEXT_LISTS])("%s rows carry a hidden, empty-by-default playerText", (list) => {
    const child = fields[list].rowTemplate!.children.find((field) => field.id === "playerText");
    expect(child).toMatchObject({ type: "text", multiline: true, hidden: true, defaultValue: "" });
  });
});
