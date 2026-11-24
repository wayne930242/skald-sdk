import { describe, expect, it } from "vitest";
import defaultData from "@skald/system-dnd5e/data/dnd5e-2024/default-data.json";
import spells from "@skald/system-dnd5e/data/dnd5e-2024/game/spells.json";
import { dndPrintOverrides } from "@skald/sheet-sdk/testing/fixtures/dnd-print/characters";
import { MAX_PART, buildPrintContent } from "../content";
import { MAX_PIECE } from "../paginate";
import type { PrintLabels } from "../print-labels";
import { buildDndPrintModel } from "../print-model";
import type { PrintText } from "../print-text";

const labels: PrintLabels = {
  print: (key) => key,
  sheet: () => "",
  list: (items) => items.join("、"),
  stats: { school: () => null, duration: (key) => key },
};

const text = (body: string): PrintText => ({ status: "ok", body, higher: "", meta: null });

/** One paragraph with sentence ends, far longer than a print column holds (a homebrew feature pasted as one block). */
const LONG_FEATURE = "這個特性的說明寫成一整段，從頭到尾沒有換行，一句接著一句地講下去。".repeat(80);
/** A pasted backstory with no sentence end at all. */
const LONG_BACKSTORY = "他沿著河岸往北走了很多天，".repeat(300);

function content() {
  const model = buildDndPrintModel({
    values: { ...defaultData, ...dndPrintOverrides("wizard"), backstory: LONG_BACKSTORY },
    blanks: false,
    nameOf: (row) => String(row.name ?? ""),
    gameData: { spells } as Record<string, unknown>,
  });
  const feature = model.lists.features[0].line.key;
  const spell = model.spells.find((entry) => entry.level > 0)!.key;
  const texts = new Map<string, PrintText>([[feature, text(LONG_FEATURE)], [spell, text(`${LONG_FEATURE}\n短的第二段。`)]]);
  return { built: buildPrintContent({ model, texts, cantrips: new Map(), labels, lineOf: () => ({ castingTime: "", range: "" }) }), feature, spell };
}

describe("D&D print content: no part taller than a column (POR-F006)", () => {
  it("cuts an over-long entry paragraph into parts at sentence ends, each marked as going on from the one before", () => {
    const { built, feature } = content();
    const entry = built.text.features.find((candidate) => candidate.id === feature)!;
    expect(entry.paragraphs.length).toBeGreaterThan(1);
    for (const part of entry.paragraphs) expect(part.length).toBeLessThanOrEqual(MAX_PART);
    expect(entry.paragraphs.join("")).toBe(LONG_FEATURE);
    for (const part of entry.paragraphs.slice(0, -1)) expect(part.endsWith("。")).toBe(true);
    // the first part starts the paragraph; the rest go on in it
    expect(entry.joined).toEqual(entry.paragraphs.map((_, index) => index > 0));
    // the summary line still opens with the text's first words
    expect(entry.teaser).toBe(LONG_FEATURE.slice(0, 160));
  });

  it("a spell's over-long paragraph too; its next paragraph starts anew", () => {
    const { built, spell } = content();
    const entry = built.spellbook.flatMap((level) => level.spells).find((candidate) => candidate.id === spell)!;
    for (const part of entry.paragraphs) expect(part.length).toBeLessThanOrEqual(MAX_PART);
    expect(entry.paragraphs.at(-1)).toBe("短的第二段。");
    expect(entry.joined.at(-1)).toBe(false);
    expect(entry.joined[0]).toBe(false);
    expect(entry.paragraphs.slice(0, -1).join("")).toBe(LONG_FEATURE);
  });

  it("a backstory with no sentence end prints in pieces short enough to continue across columns", () => {
    const { built } = content();
    const [paragraph] = built.prose.backstory;
    expect(paragraph.pieces.join("")).toBe(LONG_BACKSTORY);
    for (const piece of paragraph.pieces) expect(piece.length).toBeLessThanOrEqual(MAX_PIECE);
  });
});
