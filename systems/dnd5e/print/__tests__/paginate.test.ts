import { describe, expect, it } from "vitest";
import {
  fitIdentity,
  packFlow,
  packProse,
  packTable,
  packTextRegion,
  paginate,
  sentencePieces,
  MAX_PIECE,
  type FlowSection,
  type PaginateInput,
} from "../paginate";

const unit = (h: number) => ({ h: [h, h] });

describe("rule H: a text region prints what fits in full and a summary line for the rest", () => {
  it("full entries while they fit, running from the box's left column into its right one", () => {
    const plan = packTextRegion([100, 100], [
      { id: "a", head: 10, parts: [40, 40, 30], summary: 10 },
      { id: "b", head: 10, parts: [200], summary: 10 },
      { id: "c", head: 10, parts: [20], summary: 10 },
    ]);
    expect(plan.summarized).toEqual(["b"]);
    expect(plan.frames).toEqual([
      [{ kind: "full", id: "a", from: 0, to: 2, cont: false }],
      [{ kind: "full", id: "a", from: 2, to: 3, cont: true }, { kind: "summary", id: "b" }, { kind: "full", id: "c", from: 0, to: 1, cont: false }],
    ]);
  });

  it("an early long entry becomes a summary so the shorter ones after it print in full", () => {
    const plan = packTextRegion([60], [
      { id: "long", head: 10, parts: [80], summary: 10 },
      { id: "short", head: 10, parts: [20], summary: 10 },
      { id: "short2", head: 10, parts: [10], summary: 10 },
    ]);
    expect(plan.summarized).toEqual(["long"]);
    expect(plan.frames[0].map((piece) => `${piece.kind}:${"id" in piece ? piece.id : ""}`)).toEqual(["summary:long", "full:short", "full:short2"]);
  });

  it("reserves the named pointer and counts wrapped summaries at their own heights", () => {
    const entries = [10, 25, 10, 10].map((summary, i) => ({ id: String(i), head: 10, parts: [100], summary }));
    expect(packTextRegion([45], entries, 15).frames[0]).toEqual([
      { kind: "summary", id: "0" }, { kind: "more", ids: ["1", "2", "3"] },
    ]);
  });

  it("when even the names do not fit: as many names as fit, then one line for the rest", () => {
    const entries = Array.from({ length: 8 }, (_, index) => ({ id: `e${index}`, head: 10, parts: [50], summary: 10 }));
    const plan = packTextRegion([40], entries);
    expect(plan.summarized).toEqual(entries.map((entry) => entry.id));
    expect(plan.frames[0]).toEqual([
      { kind: "summary", id: "e0" },
      { kind: "summary", id: "e1" },
      { kind: "summary", id: "e2" },
      { kind: "more", ids: ["e3", "e4", "e5", "e6", "e7"] },
    ]);
  });
});

describe("identity: 7pt, two lines, else 「身分（續）」 (LAYOUT.md §3, POR-F002)", () => {
  const line = { width: 100, room: 24, wrap: 10, line: 10 };
  it("the first size step the value fits on one line, with 2% spare", () => {
    expect(fitIdentity({ ...line, sizes: [90, 70] })).toBe(0);
    expect(fitIdentity({ ...line, sizes: [99, 80] })).toBe(1);
    expect(fitIdentity({ ...line, sizes: [140, 110, 90] })).toBe(2);
  });

  it("two lines at 7pt when they fit the line's height; else 續頁", () => {
    expect(fitIdentity({ ...line, sizes: [180, 150], wrap: 20 })).toBe("wrap");
    expect(fitIdentity({ ...line, sizes: [300, 250], wrap: 30 })).toBe("cont");
    // two lines that the line's height cannot hold
    expect(fitIdentity({ ...line, room: 15, sizes: [180, 150], wrap: 20 })).toBe("cont");
  });

  it("a line that continues gets 「身分（續）」 on 續頁, and its page", () => {
    const measure = (sizes: number[], wrap: number) => ({ width: 100, room: 24, sizes, wrap, line: 10 });
    const plan = paginate(input(
      { identity: [measure([50, 40], 10), measure([400, 300], 40), measure([180, 150], 20)] },
      { titles: { identity: [12] }, prose: { identity: [{ h: [10], bottoms: [[10]] }, { h: [30], bottoms: [[30]] }, { h: [20], bottoms: [[20]] }] } },
    ));
    expect(plan.identity).toEqual([0, "cont", "wrap"]);
    expect(plan.sections.identity).toBe(3);
    expect(plan.entries["identity:1"]).toBe(3);
    expect(plan.entries["identity:2"]).toBeUndefined();
    expect(plan.continuation.pages[0][0].items.map((item) => (item.kind === "block" ? item.block : item.kind))).toEqual(["title", "identity:1"]);
  });
});

describe("row tables", () => {
  it("rows while they fit, then a marker row for the rest", () => {
    expect(packTable({ capacity: 100, head: 10, rows: [15, 15, 15, 15, 15, 15, 15], marker: 15, blank: 15 })).toEqual({ rows: 5, marker: true, blanks: 0 });
  });

  it("blank official rows fill what the rows leave", () => {
    expect(packTable({ capacity: 100, head: 10, rows: [15, 15, 15], marker: 15, blank: 15 })).toEqual({ rows: 3, marker: false, blanks: 3 });
    expect(packTable({ capacity: 100, head: 10, rows: [], marker: 15, blank: 15 })).toEqual({ rows: 0, marker: false, blanks: 6 });
  });
});

describe("prose", () => {
  it("whole paragraphs, then a cut at the last sentence that leaves room for the 「（續）」 line", () => {
    const plan = packProse({
      capacity: 100,
      marker: 12,
      paragraphs: [{ height: 40, bottoms: [20, 40] }, { height: 80, bottoms: [20, 40, 60, 80] }, { height: 20, bottoms: [20] }],
    });
    expect(plan).toEqual({ paragraphs: 1, cut: { pieces: 2 } });
    expect(packProse({ capacity: 100, marker: 12, paragraphs: [{ height: 40, bottoms: [40] }] })).toEqual({ paragraphs: 1, cut: null });
  });

  it("splits at sentence ends and keeps the closing punctuation", () => {
    expect(sentencePieces("第一句。第二句！Third one. Fourth")).toEqual(["第一句。", "第二句！", "Third one. ", "Fourth"]);
    expect(sentencePieces("「引號。」之後")).toEqual(["「引號。」", "之後"]);
  });

  it("breaks a run with no sentence end into pieces no longer than MAX_PIECE, at a soft break where there is one (POR-F006)", () => {
    // a pasted backstory with no stop: one piece would be taller than a whole column and print clipped
    const cjk = "他走過長長的山路，".repeat(400);
    const pieces = sentencePieces(cjk);
    expect(pieces.length).toBeGreaterThan(1);
    expect(pieces.join("")).toBe(cjk);
    for (const piece of pieces) expect(piece.length).toBeLessThanOrEqual(MAX_PIECE);
    // each break falls after a comma, so a piece that starts a column starts a phrase
    for (const piece of pieces.slice(0, -1)) expect(piece.endsWith("，")).toBe(true);

    const words = "and then the long road went on ".repeat(200).trim();
    const english = sentencePieces(words);
    expect(english.join("")).toBe(words);
    for (const piece of english) expect(piece.length).toBeLessThanOrEqual(MAX_PIECE);
    for (const piece of english.slice(0, -1)) expect(piece.endsWith(" ")).toBe(true);

    // nothing to break at: hard breaks, never inside a surrogate pair
    const solid = "龍".repeat(MAX_PIECE * 3 + 5) + "😀".repeat(MAX_PIECE);
    const hard = sentencePieces(solid);
    expect(hard.join("")).toBe(solid);
    for (const piece of hard) {
      expect(piece.length).toBeLessThanOrEqual(MAX_PIECE);
      expect(/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/.test(piece)).toBe(false);
    }
    // sentences under the limit are untouched
    expect(sentencePieces("短句。")).toEqual(["短句。"]);
  });
});

describe("continuation flow", () => {
  const frames = (page: number) => [{ page, capacity: 100, width: 0 }, { page, capacity: 100, width: 0 }];

  it("a section title stays with its first block; an entry splits between paragraphs when a quarter of the column is left", () => {
    const sections: FlowSection[] = [
      { id: "s1", title: unit(10), again: unit(10), blocks: [{ id: "x", head: unit(10), parts: [unit(30), unit(30)], splittable: true }] },
      { id: "s2", title: unit(10), again: unit(10), blocks: [{ id: "y", head: unit(10), parts: [unit(20), unit(20), unit(20)], splittable: true }] },
    ];
    const plan = packFlow(sections, [], frames, 3);
    // s1 uses 80 of column 1; s2's title and y's head and first paragraph do not fit in the 20 left
    expect(plan.columns.map((column) => column.items.map((item) => (item.kind === "block" ? `${item.block}[${item.from},${item.to})${item.cont ? "+" : ""}` : `${item.kind}:${item.section}`)))).toEqual([
      ["title:s1", "x[0,2)"],
      ["title:s2", "y[0,3)"],
    ]);
    expect(plan.sectionPage).toEqual({ s1: 3, s2: 3 });

    const split = packFlow(
      [{ id: "s1", title: unit(10), again: unit(10), blocks: [{ id: "x", head: unit(10), parts: [unit(40), unit(40), unit(40)], splittable: true }] }],
      [],
      frames,
      3,
    );
    expect(split.columns.map((column) => column.items.map((item) => (item.kind === "block" ? `${item.block}[${item.from},${item.to})${item.cont ? "+" : ""}` : `${item.kind}${item.kind === "title" && item.again ? "+" : ""}`)))).toEqual([
      ["title", "x[0,2)"],
      ["title+", "x[2,3)+"],
    ]);
  });

  it("with less than a quarter of the column left, the entry moves whole to the next column", () => {
    const plan = packFlow(
      [
        { id: "s1", title: unit(10), again: unit(10), blocks: [{ id: "a", head: unit(10), parts: [unit(60)], splittable: true }] },
        { id: "s2", title: unit(10), again: unit(10), blocks: [{ id: "b", head: unit(5), parts: [unit(5)], splittable: true }, { id: "c", head: unit(10), parts: [unit(20), unit(20)], splittable: true }] },
      ],
      [],
      frames,
      3,
    );
    // column 1 has 100 − 80 − 20 = 0 left before c; c moves whole
    expect(plan.columns[1].items.map((item) => (item.kind === "block" ? `${item.block}[${item.from},${item.to})` : `${item.kind}${item.kind === "title" && item.again ? "+" : ""}`))).toEqual(["title+", "c[0,2)"]);
    expect(plan.blockPage).toEqual({ a: 3, b: 3, c: 3 });
  });

  it("a title never stays alone at the foot of a column: it goes with its first block", () => {
    const plan = packFlow(
      [
        { id: "s0", title: unit(10), again: unit(10), blocks: [{ id: "a", head: unit(10), parts: [unit(50)], splittable: true }] },
        { id: "s1", title: unit(10), again: unit(10), blocks: [{ id: "b", head: unit(10), parts: [unit(10), unit(10), unit(10)], splittable: true }] },
      ],
      [],
      (page) => [{ page, capacity: 100, width: 0 }, { page, capacity: 100, width: 0 }],
      3,
    );
    // 30 left: the title and b's first paragraph would fit, but b would not split with under a quarter left
    expect(plan.columns.map((column) => column.items.map((item) => item.kind === "block" ? item.block : `${item.kind}:${item.section}`))).toEqual([
      ["title:s0", "a"],
      ["title:s1", "b"],
    ]);
  });

  it("a block that goes on at a column top counts its new first line and its 「名稱（續）」 head (POR-F005)", () => {
    // a prose paragraph split by the flow: the piece it goes on with starts a new line, with the
    // paragraph's top padding again
    const prose = packFlow(
      [{ id: "s", title: unit(10), again: unit(10), blocks: [{ id: "p", parts: [unit(40), unit(40), unit(40)], splittable: true, resume: unit(8) }] }],
      [],
      frames,
      3,
    );
    expect(prose.columns[1].items.map((item) => (item.kind === "block" ? `${item.from},${item.to}` : item.kind))).toEqual(["title", "2,3"]);
    expect(prose.columns[1].used).toBe(10 + 8 + 40);

    // an entry that goes on prints its longer 「名稱（續）」 head: the height counted is that one
    const entry = packFlow(
      [{ id: "s", title: unit(10), again: unit(10), blocks: [{ id: "e", head: unit(10), headAgain: unit(22), parts: [unit(40), unit(40), unit(40)], splittable: true }] }],
      [],
      frames,
      3,
    );
    expect(entry.columns[1].used).toBe(10 + 22 + 40);

    // a paragraph cut on page 1 or 2 goes on from its cut with the same new line
    const cut = packFlow(
      [{ id: "s", title: unit(10), again: unit(10), blocks: [{ id: "p", parts: [unit(40), unit(40), unit(40)], splittable: true, start: 1, resume: unit(8) }] }],
      [],
      frames,
      3,
    );
    expect(cut.columns[0].used).toBe(10 + 8 + 40 + 40);
  });

  it("rule H counts the 「名稱（續）」 head of an entry that runs on into the box's next column (POR-F005)", () => {
    const entries = [{ id: "a", head: 10, again: 30, parts: [40, 40], summary: 10 }];
    // its plain head would fit it (10 + 40 | 10 + 40); the 「（續）」 head does not (30 + 40 > 55)
    expect(packTextRegion([55, 55], entries).summarized).toEqual(["a"]);
    expect(packTextRegion([55, 75], entries).summarized).toEqual([]);
  });

  it("rows repeat the table head on every column", () => {
    const plan = packFlow(
      [{ id: "t", title: unit(10), again: unit(10), tableHead: unit(10), blocks: Array.from({ length: 10 }, (_, index) => ({ id: `r${index}`, parts: [unit(15)], splittable: false })) }],
      [],
      frames,
      3,
    );
    expect(plan.columns.map((column) => column.items.map((item) => item.kind))).toEqual([
      ["title", "tableHead", "block", "block", "block", "block", "block"],
      ["title", "tableHead", "block", "block", "block", "block", "block"],
    ]);
  });
});

function input(over: Partial<PaginateInput["core"]> = {}, cont: Partial<PaginateInput["cont"]> = {}, spellbook: PaginateInput["spellbook"] = null): PaginateInput {
  const empty = { capacity: 100, marker: 10, paragraphs: [] };
  return {
    core: {
      identity: [],
      text: {
        features: { frames: [100, 100], entries: [] },
        speciesTraits: { frames: [100], entries: [] },
        feats: { frames: [100], entries: [] },
      },
      tables: {
        attacks: { capacity: 100, head: 10, rows: [], marker: 15, blank: 15 },
        spells: null,
        equipment: { capacity: 100, head: 10, rows: [], marker: 15, blank: 15 },
      },
      prose: { status: empty, training: empty, appearance: empty, backstory: empty, languages: empty },
      ...over,
    },
    cont: {
      p2: null,
      capacity: 200,
      columns: 2,
      line: [10, 10],
      titles: {},
      entries: {},
      tables: {},
      prose: {},
      extra: { items: [], attackTexts: [], notes: false },
      ...cont,
    },
    spellbook,
  };
}

describe("paginate: core pages, continuation pages and page numbers", () => {
  it("a sheet whose regions hold everything prints two pages", () => {
    const plan = paginate(input());
    expect(plan.pages).toBe(2);
    expect(plan.continuation.pages).toEqual([]);
  });

  it("a summarized entry continues on page 3 under its region's （續） heading, and the summary names that page", () => {
    const plan = paginate(input(
      { text: { features: { frames: [50, 50], entries: [{ id: "features:0", head: 10, parts: [300], summary: 10 }] }, speciesTraits: { frames: [100], entries: [] }, feats: { frames: [100], entries: [] } } },
      { titles: { features: [12, 12] }, entries: { "features:0": { head: [10, 10], parts: [[150]] } } },
    ));
    expect(plan.text.features.summarized).toEqual(["features:0"]);
    expect(plan.pages).toBe(3);
    expect(plan.sections.features).toBe(3);
    expect(plan.entries["features:0"]).toBe(3);
    expect(plan.continuation.pages[0][0].items.map((item) => item.kind)).toEqual(["title", "block"]);
  });

  it("a non-caster's compact print fills page 2's left half first, then page 3", () => {
    const entries = Array.from({ length: 6 }, (_, index) => ({ id: `features:${index}`, head: 10, parts: [300], summary: 10 }));
    const plan = paginate(input(
      { text: { features: { frames: [100], entries }, speciesTraits: { frames: [100], entries: [] }, feats: { frames: [100], entries: [] } } },
      {
        p2: [100, 100],
        titles: { features: [12, 12] },
        entries: Object.fromEntries(entries.map((entry) => [entry.id, { head: [10, 10], parts: [[80, 60]] }])),
      },
    ));
    expect(plan.continuation.p2?.map((column) => column.frame.page)).toEqual([2, 2]);
    expect(plan.entries["features:0"]).toBe(2);
    expect(plan.entries["features:2"]).toBe(3);
    expect(plan.pages).toBe(3);
  });

  it("table rows past the box continue with a marker naming the page; prose cut at a sentence continues too", () => {
    const plan = paginate(input(
      {
        tables: {
          attacks: { capacity: 100, head: 10, rows: Array(8).fill(15), marker: 15, blank: 15 },
          spells: null,
          equipment: { capacity: 100, head: 10, rows: [], marker: 15, blank: 15 },
        },
        prose: {
          status: { capacity: 100, marker: 10, paragraphs: [] },
          training: { capacity: 100, marker: 10, paragraphs: [] },
          appearance: { capacity: 100, marker: 10, paragraphs: [] },
          backstory: { capacity: 50, marker: 10, paragraphs: [{ height: 80, bottoms: [20, 40, 60, 80] }] },
          languages: { capacity: 100, marker: 10, paragraphs: [] },
        },
      },
      {
        titles: { attacks: [12], backstory: [12] },
        tables: { attacks: { head: [10], rows: Array.from({ length: 8 }, () => [15]) } },
        prose: { backstory: [{ h: [80], bottoms: [[20, 40, 60, 80]] }] },
      },
    ));
    expect(plan.tables.attacks).toEqual({ rows: 5, marker: true, blanks: 0 });
    expect(plan.prose.backstory).toEqual({ paragraphs: 0, cut: { pieces: 2 } });
    expect(plan.sections).toMatchObject({ attacks: 3, backstory: 3 });
    const items = plan.continuation.pages[0].flatMap((column) => column.items);
    expect(items.filter((item) => item.kind === "block" && item.section === "attacks")).toHaveLength(3);
    expect(items.find((item) => item.kind === "block" && item.section === "backstory")).toMatchObject({ from: 2, to: 4, cont: true });
  });

  it("a label-only paragraph that does not fit cuts nothing: no 「（續）」 marker without a continued section (POR-F003)", () => {
    const training = (paragraphs: Array<{ height: number; bottoms: number[] }>) => ({ capacity: 30, marker: 10, paragraphs });
    const prose = (over: PaginateInput["core"]["prose"]["training"]) => ({
      status: { capacity: 100, marker: 10, paragraphs: [] },
      training: over,
      appearance: { capacity: 100, marker: 10, paragraphs: [] },
      backstory: { capacity: 100, marker: 10, paragraphs: [] },
      languages: { capacity: 100, marker: 10, paragraphs: [] },
    });
    // 武器 fits; 工具 (no tools: a label only) does not, and nothing follows it
    const alone = paginate(input(
      { prose: prose(training([{ height: 20, bottoms: [20] }, { height: 20, bottoms: [] }])) },
      { titles: { training: [12] }, prose: { training: [{ h: [20], bottoms: [[20]] }, { h: [20], bottoms: [[]] }] } },
    ));
    expect(alone.prose.training.cut).toBeNull();
    expect(alone.sections.training).toBeUndefined();
    expect(alone.pages).toBe(2);

    // a paragraph with words after it: the label prints with the marker, the words continue
    const before = paginate(input(
      { prose: prose(training([{ height: 20, bottoms: [20] }, { height: 20, bottoms: [] }, { height: 20, bottoms: [20] }])) },
      { titles: { training: [12] }, prose: { training: [{ h: [20], bottoms: [[20]] }, { h: [20], bottoms: [[]] }, { h: [20], bottoms: [[20]] }] } },
    ));
    expect(before.prose.training.cut).not.toBeNull();
    expect(before.sections.training).toBe(3);
  });

  it("the spellbook follows the continuation; a level heading says （續） only where the level goes on", () => {
    const spell = (id: string) => ({ id, head: 10, parts: [30] });
    const plan = paginate(input({}, {}, {
      capacity: 100,
      columns: 2,
      indexTitle: 10,
      indexHead: 10,
      indexRows: [{ id: "s1", h: 10 }, { id: "s2", h: 10 }, { id: "s3", h: 10 }, { id: "s4", h: 10 }],
      levels: [
        { level: 1, title: 10, again: 10, spells: [spell("s1"), spell("s2"), spell("s3")] },
        { level: 2, title: 10, again: 10, spells: [spell("s4")] },
      ],
    }));
    const columns = plan.spellbook!.pages.flat();
    const titles = columns.flatMap((column) => column.items.filter((item) => item.kind === "title").map((item) => `${item.section}${item.kind === "title" && item.again ? "+" : ""}`));
    expect(titles).toEqual(["index", "level:1", "level:1+", "level:2"]);
    expect(plan.spellbook!.pages[0][0].frame.page).toBe(3);
    expect(plan.entries).toMatchObject({ s1: 3, s2: 3, s3: 4, s4: 4 });
    expect(plan.pages).toBe(4);
  });
});
