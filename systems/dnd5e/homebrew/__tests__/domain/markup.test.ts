import { describe, expect, it } from "vitest";
import { parseMarkup, printMarkup } from "../../domain/markup";

describe("homebrew markup", () => {
  it("reads paragraphs, sections and lists", () => {
    const text = "First line\nsame paragraph.\n\nSecond {@spell Fireball}.\n\n## Quick Flame\n\nInside.\n- one\n- two\n\n## Empty";
    expect(parseMarkup(text)).toEqual([
      "First line same paragraph.",
      "Second {@spell Fireball}.",
      { type: "entries", name: "Quick Flame", entries: ["Inside.", { type: "list", items: ["one", "two"] }] },
      { type: "entries", name: "Empty", entries: [] },
    ]);
  });

  it("prints the canonical text back exactly", () => {
    const canonical = [
      "Intro {@condition Prone}.",
      "- a\n- b",
      "## One\n\nText.\n\n- x\n-\n- - dashed",
      "## Two",
    ].join("\n\n");
    expect(printMarkup(parseMarkup(canonical))).toEqual({ text: canonical, lossless: true });
  });

  it("normalizes line endings, blank runs and spaces", () => {
    const messy = "  Intro  \r\n\r\n\r\n\r\n## One  \r\nText.\r\n-   item  \r\n";
    const printed = printMarkup(parseMarkup(messy));
    expect(printed).toEqual({ text: "Intro\n\n## One\n\nText.\n\n- item", lossless: true });
    expect(parseMarkup(printed.text)).toEqual(parseMarkup(messy));
  });

  it("is empty for blank text", () => {
    expect(parseMarkup(" \n\n ")).toEqual([]);
    expect(printMarkup([])).toEqual({ text: "", lossless: true });
  });

  it("marks blocks it cannot write as lossy and still prints their text", () => {
    const table = { type: "table", colLabels: ["d4", "Effect"], rows: [["1", "Sparks"]] };
    const result = printMarkup(["Before.", table]);
    expect(result.lossless).toBe(false);
    expect(result.text.startsWith("Before.")).toBe(true);
    expect(printMarkup([{ type: "list", style: "list-hang", items: ["a"] }]).lossless).toBe(false);
    expect(printMarkup([{ type: "entries", name: "A", entries: [{ type: "entries", name: "B", entries: [] }] }]).lossless).toBe(false);
    expect(printMarkup(["two\nlines"]).lossless).toBe(false);
    expect(printMarkup(["- looks like a list"]).lossless).toBe(false);
    // A loose paragraph after a section would join that section when read back.
    expect(printMarkup([{ type: "entries", name: "A", entries: [] }, "after"]).lossless).toBe(false);
  });
});
