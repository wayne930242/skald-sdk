/**
 * The pager of the D&D print (LAYOUT.md §1, §6): where everything goes, from measured heights only.
 * Pure: `use-paged-layout.ts` measures every entry, paragraph and row once in the browser, this
 * places them, so no layout runs inside the loops and the result is the same in every test.
 *
 * - Pages 1 and 2 are the official sheet's fixed boxes. A text region (class features, species
 *   traits, feats) prints each entry in full while it fits, running from one column of its box into
 *   the next, and a one-line summary for the rest (rule H); a row table prints its rows, then a
 *   marker row; prose cuts at a sentence end.
 * - What a box leaves out continues on 續頁 under the region's heading with 「（續）」, two columns a
 *   page. A non-caster's compact print starts it in page 2's left half. An entry that does not fit
 *   the foot of a column splits between paragraphs when a quarter of the column is left.
 * - The spellbook follows on its own pages: an index, then each level, whose heading says 「（續）」
 *   on the columns it goes on in.
 *
 * Heights are layout px. A capacity is the box's height less the one line it keeps spare.
 */

// ── text regions (rule H) ───────────────────────────────────────────────────────────────────

export interface EntryMeasure {
  id: string;
  /** The name line (with its top spacing). */
  head: number;
  /** The name line with 「（續）」, which an entry prints atop the next column it runs on into; else `head`. */
  again?: number;
  /** Each paragraph (with its top spacing). */
  parts: number[];
  /** The one-line summary. */
  summary: number;
}

export type TextPiece =
  | { kind: "full"; id: string; from: number; to: number; cont: boolean }
  | { kind: "summary"; id: string }
  /** Even the names did not fit: one line names how many more there are and where. */
  | { kind: "more"; ids: string[] };

export interface TextRegionPlan {
  frames: TextPiece[][];
  /** Entries printed as a summary line (or under 「more」): their full text continues. */
  summarized: string[];
}

const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);

/** Pours the entries into the frames in order, or null when they do not fit. */
function pour(frames: readonly number[], entries: readonly EntryMeasure[], full: readonly boolean[]): TextPiece[][] | null {
  const out: TextPiece[][] = frames.map(() => []);
  let index = 0;
  let used = 0;
  for (const [position, entry] of entries.entries()) {
    if (!full[position]) {
      while (used + entry.summary > frames[index]) {
        index += 1;
        used = 0;
        if (index >= frames.length) return null;
      }
      out[index].push({ kind: "summary", id: entry.id });
      used += entry.summary;
      continue;
    }
    let start = 0;
    for (;;) {
      const head = start > 0 ? entry.again ?? entry.head : entry.head;
      const need = head + sum(entry.parts.slice(start));
      if (used + need <= frames[index]) {
        out[index].push({ kind: "full", id: entry.id, from: start, to: entry.parts.length, cont: start > 0 });
        used += need;
        break;
      }
      // run on into the next column of the box: the name and as many paragraphs as fit here
      let end = start;
      let height = head;
      while (end < entry.parts.length && used + height + entry.parts[end] <= frames[index]) height += entry.parts[end++];
      if (end > start) {
        out[index].push({ kind: "full", id: entry.id, from: start, to: end, cont: start > 0 });
        start = end;
      }
      index += 1;
      used = 0;
      if (index >= frames.length) return null;
    }
  }
  return out;
}

/**
 * Rule H: entries in sheet order, each in full when it still fits with every later one as a
 * summary line, else a summary line itself; every entry shows at least by name.
 */
export function packTextRegion(frames: readonly number[], entries: readonly EntryMeasure[], moreHeight = entries[0]?.summary ?? 0): TextRegionPlan {
  const full = entries.map(() => false);
  for (let index = 0; index < entries.length; index += 1) {
    full[index] = true;
    if (!pour(frames, entries, full)) full[index] = false;
  }
  const placed = pour(frames, entries, full);
  if (placed) return { frames: placed, summarized: entries.filter((_, index) => !full[index]).map((entry) => entry.id) };
  // even the names do not fit: as many as fit, the last line says how many more and where
  const out: TextPiece[][] = frames.map(() => []);
  const last = frames.reduce((index, height, i) => height >= moreHeight ? i : index, -1);
  let next = 0;
  for (let i = 0; i <= last; i++) {
    let room = frames[i] - (i === last ? moreHeight : 0);
    while (next < entries.length && entries[next].summary <= room) {
      room -= entries[next].summary;
      out[i].push({ kind: "summary", id: entries[next++].id });
    }
  }
  if (last >= 0) out[last].push({ kind: "more", ids: entries.slice(next).map((entry) => entry.id) });
  return { frames: out, summarized: entries.map((entry) => entry.id) };
}

// ── identity (page 1's top box) ──────────────────────────────────────────────────────────────

export interface IdentityMeasure {
  /** The width the value has on its line. */
  width: number;
  /** The line's height: what two wrapped lines may take. */
  room: number;
  /** The value's width on one line at each font size step (the first is the sheet's own). */
  sizes: number[];
  /** Its height wrapped at the line's width at 7pt, and one such line's. */
  wrap: number;
  line: number;
}

/** A size step (0 the sheet's own), two lines at 7pt, or 7pt with its whole text on 續頁. */
export type IdentityFit = number | "wrap" | "cont";

/**
 * LAYOUT.md §3, 身分: shrink to 7pt, then wrap onto two lines; what still does not fit prints in
 * full under 「身分（續）」 with the page on its line. Each step keeps 2% of the width spare: the PDF
 * renderer's fonts may set a line a little wider than the browser that measured it.
 */
export function fitIdentity({ width, room, sizes, wrap, line }: IdentityMeasure): IdentityFit {
  const spare = width * 0.98;
  const step = sizes.findIndex((size) => size <= spare);
  if (step >= 0) return step;
  const smallest = sizes[sizes.length - 1] ?? Infinity;
  if (wrap <= Math.min(room, 2 * line) + 0.5 && smallest <= 2 * spare) return "wrap";
  return "cont";
}

// ── row tables ──────────────────────────────────────────────────────────────────────────────

export interface TableMeasure {
  capacity: number;
  head: number;
  rows: number[];
  marker: number;
  blank: number;
}

export interface TablePlan {
  /** The first `rows` rows print in the box. */
  rows: number;
  /** A named pointer for the remaining rows after them. */
  marker: boolean;
  /** Official blank rows under them. */
  blanks: number;
}

export function packTable({ capacity, head, rows, marker, blank }: TableMeasure): TablePlan {
  let used = head;
  let count = 0;
  while (count < rows.length && used + rows[count] <= capacity) used += rows[count++];
  if (count === rows.length) return { rows: count, marker: false, blanks: blank > 0 ? Math.max(0, Math.floor((capacity - used) / blank)) : 0 };
  while (count > 0 && used + marker > capacity) used -= rows[--count];
  return { rows: count, marker: true, blanks: 0 };
}

// ── prose ───────────────────────────────────────────────────────────────────────────────────

export interface ProseMeasure {
  capacity: number;
  /** The line a named continuation pointer may need. */
  marker: number;
  /** Each paragraph's height and the bottom of each of its pieces (sentences, list items). */
  paragraphs: Array<{ height: number; bottoms: number[] }>;
}

export interface ProsePlan {
  /** Paragraphs printed whole. */
  paragraphs: number;
  /** The next paragraph prints its first `pieces` pieces and a named continuation pointer; the rest continues. */
  cut: { pieces: number } | null;
}

export function packProse({ capacity, marker, paragraphs }: ProseMeasure): ProsePlan {
  let used = 0;
  for (const [index, paragraph] of paragraphs.entries()) {
    if (used + paragraph.height <= capacity) {
      used += paragraph.height;
      continue;
    }
    // a label with no words (工具 without tools) has nothing to continue: when no paragraph with
    // words follows, nothing is cut, and the frame prints no a named continuation pointer pointing at no section
    if (!paragraphs.slice(index).some((rest) => rest.bottoms.length > 0)) return { paragraphs: index, cut: null };
    const room = capacity - used - marker;
    return { paragraphs: index, cut: { pieces: paragraph.bottoms.filter((bottom) => bottom <= room).length } };
  }
  return { paragraphs: paragraphs.length, cut: null };
}

const STOPS = new Set(["。", "！", "？", "；", "!", "?", "."]);
const CLOSERS = new Set(["」", "』", "）", ")", "”", "’", "\"", "'"]);

/** A paragraph's sentences, each with its closing punctuation and the space after it. */
export function sentencePieces(paragraph: string): string[] {
  const pieces: string[] = [];
  let start = 0;
  for (let index = 0; index < paragraph.length; index += 1) {
    const char = paragraph[index];
    if (!STOPS.has(char)) continue;
    // an ASCII period ends a sentence only before a space or the end (not in 1.5 or e.g.)
    if (char === "." && index + 1 < paragraph.length && !/\s/.test(paragraph[index + 1])) continue;
    let end = index + 1;
    while (end < paragraph.length && (STOPS.has(paragraph[end]) || CLOSERS.has(paragraph[end]))) end += 1;
    while (end < paragraph.length && /\s/.test(paragraph[end])) end += 1;
    pieces.push(paragraph.slice(start, end));
    start = end;
    index = end - 1;
  }
  if (start < paragraph.length) pieces.push(paragraph.slice(start));
  return pieces;
}

// ── column flow (續頁 and the spellbook) ────────────────────────────────────────────────────

/** A height for each width class: 0 the 續頁 column, 1 page 2's left half. */
export interface FlowUnit {
  h: readonly number[];
}

export interface FlowBlock {
  id: string;
  /** The name line. */
  head?: FlowUnit;
  /** The name line with 「（續）」, printed atop the column the block goes on in; else `head`. */
  headAgain?: FlowUnit;
  /**
   * What a block that goes on from a part after its first adds atop that part: a prose paragraph
   * starts its piece on a new line, with the paragraph's top padding again.
   */
  resume?: FlowUnit;
  parts: FlowUnit[];
  splittable: boolean;
  /** The first part to place: a paragraph cut on page 1 or 2 goes on from here. */
  start?: number;
}

export interface FlowSection {
  id: string;
  title: FlowUnit;
  /** Printed atop each later column the section goes on in. */
  again: FlowUnit | null;
  /** A table's head, repeated atop each column. */
  tableHead?: FlowUnit;
  blocks: FlowBlock[];
}

export interface FlowFrame {
  page: number;
  capacity: number;
  width: number;
}

export type FlowItem =
  | { kind: "title"; section: string; again: boolean }
  | { kind: "tableHead"; section: string }
  | { kind: "block"; section: string; block: string; from: number; to: number; cont: boolean };

export interface FlowColumn {
  frame: FlowFrame;
  items: FlowItem[];
  used: number;
}

export interface FlowPlan {
  columns: FlowColumn[];
  sectionPage: Record<string, number>;
  blockPage: Record<string, number>;
}

/** A column is not split near its foot unless less than this share of it is left. */
const SPLIT_ROOM = 0.25;

/**
 * Pours the sections into `first` (page 2's left half), then into new pages of `pageFrames(page)`
 * from page `startPage` on. A title stays with its first block; a block that does not fit splits
 * between parts when a quarter of the column is left (or when it is taller than a column).
 */
export function packFlow(
  sections: readonly FlowSection[],
  first: readonly FlowFrame[],
  pageFrames: (page: number) => FlowFrame[],
  startPage: number,
): FlowPlan {
  const columns: FlowColumn[] = [];
  const queue = [...first];
  let page = startPage;
  let column: FlowColumn | null = null;
  const sectionPage: Record<string, number> = {};
  const blockPage: Record<string, number> = {};

  const open = () => {
    if (queue.length === 0) queue.push(...pageFrames(page++));
    const frame = queue.shift()!;
    column = { frame, items: [], used: 0 };
    columns.push(column);
    return column;
  };
  const current = () => column ?? open();
  const height = (unit: FlowUnit | undefined | null, frame: FlowFrame) => (unit ? unit.h[frame.width] ?? unit.h[0] : 0);
  /** The block's top from part `from` on: its name line (with 「（續）」 after the first part) and a resumed line. */
  const topOf = (block: FlowBlock, from: number, frame: FlowFrame) =>
    from > 0 ? height(block.headAgain ?? block.head, frame) + height(block.resume, frame) : height(block.head, frame);
  const blockHeight = (block: FlowBlock, from: number, frame: FlowFrame) =>
    topOf(block, from, frame) + sum(block.parts.slice(from).map((part) => height(part, frame)));
  const push = (item: FlowItem, h: number) => {
    const target = current();
    target.items.push(item);
    target.used += h;
  };
  /** A new column within a section: its heading again and the table head. */
  const continueIn = (section: FlowSection) => {
    const target = open();
    if (section.again) push({ kind: "title", section: section.id, again: true }, height(section.again, target.frame));
    if (section.tableHead) push({ kind: "tableHead", section: section.id }, height(section.tableHead, target.frame));
    return target;
  };

  for (const section of sections) {
    let target = current();
    const firstBlock = section.blocks[0];
    /** The title starts here only if its first block does too: whole, or split as the block loop below would. */
    const startsIn = (column: FlowColumn) => {
      const frame = column.frame;
      const room = frame.capacity - column.used - height(section.title, frame) - height(section.tableHead, frame);
      if (!firstBlock) return room >= 0;
      const start = firstBlock.start ?? 0;
      if (blockHeight(firstBlock, start, frame) <= room) return true;
      const first = topOf(firstBlock, start, frame) + height(firstBlock.parts[start], frame);
      return firstBlock.splittable && first <= room && room >= frame.capacity * SPLIT_ROOM;
    };
    if (target.used > 0 && !startsIn(target)) target = open();
    push({ kind: "title", section: section.id, again: false }, height(section.title, target.frame));
    sectionPage[section.id] = target.frame.page;
    if (section.tableHead) push({ kind: "tableHead", section: section.id }, height(section.tableHead, target.frame));
    let fresh = false;

    const overhead = (frame: FlowFrame) => height(section.again, frame) + height(section.tableHead, frame);
    for (const block of section.blocks) {
      const start = block.start ?? 0;
      let from = start;
      for (;;) {
        target = current();
        const frame = target.frame;
        const need = blockHeight(block, from, frame);
        const room = frame.capacity - target.used;
        if (from === start) blockPage[block.id] = frame.page;
        if (need <= room) {
          push({ kind: "block", section: section.id, block: block.id, from, to: block.parts.length, cont: from > 0 }, need);
          fresh = false;
          break;
        }
        const tallerThanColumn = need > frame.capacity - overhead(frame);
        const mayBreak = block.splittable && (room >= frame.capacity * SPLIT_ROOM || tallerThanColumn || fresh);
        let end = from;
        let h = topOf(block, from, frame);
        if (mayBreak) {
          while (end < block.parts.length && h + height(block.parts[end], frame) <= room) h += height(block.parts[end++], frame);
        }
        if (end === from && fresh) {
          // one part taller than a whole column: it prints here, clipped, rather than never
          end = from + 1;
          h = topOf(block, from, frame) + height(block.parts[from], frame);
        }
        if (end > from) {
          push({ kind: "block", section: section.id, block: block.id, from, to: end, cont: from > 0 }, h);
          from = end;
          if (from >= block.parts.length) {
            fresh = false;
            break;
          }
        } else if (from === start) {
          delete blockPage[block.id];
        }
        continueIn(section);
        fresh = true;
      }
    }
  }
  return { columns, sectionPage, blockPage };
}

// ── the document ────────────────────────────────────────────────────────────────────────────

export const TEXT_REGIONS = ["features", "speciesTraits", "feats"] as const;
export type TextRegionId = (typeof TEXT_REGIONS)[number];
export const TABLES = ["attacks", "spells", "equipment"] as const;
export type TableId = (typeof TABLES)[number];
export const PROSE = ["status", "training", "appearance", "backstory", "languages"] as const;
export type ProseId = (typeof PROSE)[number];

/** 續頁 sections in the order of the regions on pages 1 and 2, then the item and attack texts and notes. */
export const SECTIONS = [
  "identity", "status", "training", "attacks", "features", "speciesTraits", "feats",
  "spells", "appearance", "backstory", "languages", "equipment", "items", "attackTexts", "notes",
] as const;
export type SectionId = (typeof SECTIONS)[number];

export interface PaginateInput {
  core: {
    /** Page 1's identity lines, in the content's order. */
    identity: IdentityMeasure[];
    text: Record<TextRegionId, { frames: number[]; entries: EntryMeasure[]; moreHeight?: number }>;
    /** `spells` is null where page 2's left half holds no spell table (a non-caster's compact print). */
    tables: { attacks: TableMeasure; spells: TableMeasure | null; equipment: TableMeasure };
    prose: Record<ProseId, ProseMeasure>;
  };
  /** Everything that may continue, measured at the 續頁 column width (and page 2's left half: index 1). */
  cont: {
    /** Page 2's left-half frames of a non-caster's compact print (width class 1), or null. */
    p2: number[] | null;
    capacity: number;
    columns: number;
    /**
     * Per width class, what a paragraph that goes on mid-way adds atop its piece: one line (the
     * piece starts a new one) and the paragraph's top padding.
     */
    line: number[];
    titles: Partial<Record<SectionId, number[]>>;
    /** By entry key: the name line (plain and with 「（續）」) per width, each paragraph's height per width. */
    entries: Record<string, { head: number[]; again?: number[]; parts: number[][] }>;
    tables: Partial<Record<TableId, { head: number[]; rows: number[][] }>>;
    /** By prose region (and `notes`): each paragraph's height and piece bottoms per width. */
    prose: Partial<Record<ProseId | "notes" | "identity", Array<{ h: number[]; bottoms: number[][] }>>>;
    /** Sections only 續頁 prints: the item texts and attack texts (entry keys), and the notes. */
    extra: { items: string[]; attackTexts: string[]; notes: boolean };
  };
  spellbook: {
    capacity: number;
    columns: number;
    indexTitle: number;
    indexHead: number;
    indexRows: Array<{ id: string; h: number }>;
    levels: Array<{ level: number; title: number; again: number; spells: Array<{ id: string; head: number; again?: number; parts: number[] }> }>;
  } | null;
}

export interface DocumentPlan {
  /** How each identity line prints, by its index in the content. */
  identity: IdentityFit[];
  text: Record<TextRegionId, TextRegionPlan>;
  tables: Record<TableId, TablePlan | null>;
  prose: Record<ProseId, ProsePlan>;
  continuation: {
    /** Page 2's left half, for a non-caster's compact print. */
    p2: FlowColumn[] | null;
    /** 續頁: the columns of each page. */
    pages: FlowColumn[][];
  };
  spellbook: { pages: FlowColumn[][] } | null;
  /** The page each continued section starts on. */
  sections: Partial<Record<SectionId, number>>;
  /** The page each continued entry (and each spell of the spellbook) starts on. */
  entries: Record<string, number>;
  pages: number;
}

const byPage = (columns: FlowColumn[]) => {
  const pages = new Map<number, FlowColumn[]>();
  for (const column of columns) pages.set(column.frame.page, [...(pages.get(column.frame.page) ?? []), column]);
  return [...pages.values()];
};

/**
 * The parts of a paragraph from its piece bottoms: each piece's share of the height. Where the
 * paragraph goes on mid-way (a cut on page 1 or 2, or a split by the flow), its block's `resume`
 * adds the new line that piece starts.
 */
function pieceParts(bottoms: number[][], width: number): number[] {
  const list = bottoms[width] ?? bottoms[0] ?? [];
  return list.map((bottom, index) => bottom - (index > 0 ? list[index - 1] : 0));
}

export function paginate(input: PaginateInput): DocumentPlan {
  const { core, cont } = input;
  const identity = core.identity.map(fitIdentity);
  const text = Object.fromEntries(TEXT_REGIONS.map((id) => [id, packTextRegion(core.text[id].frames, core.text[id].entries, core.text[id].moreHeight)])) as Record<TextRegionId, TextRegionPlan>;
  const tables = {
    attacks: packTable(core.tables.attacks),
    spells: core.tables.spells ? packTable(core.tables.spells) : null,
    equipment: packTable(core.tables.equipment),
  };
  const prose = Object.fromEntries(PROSE.map((id) => [id, packProse(core.prose[id])])) as Record<ProseId, ProsePlan>;

  const widths = cont.p2 ? 2 : 1;
  const unitOf = (values: readonly number[] | undefined): FlowUnit => ({ h: values && values.length > 0 ? values : [0] });
  const titleOf = (id: SectionId) => unitOf(cont.titles[id]);
  const entryBlock = (id: string): FlowBlock => {
    const measure = cont.entries[id];
    return {
      id,
      head: unitOf(measure?.head),
      ...(measure?.again ? { headAgain: unitOf(measure.again) } : {}),
      parts: (measure?.parts ?? []).map((part) => unitOf(part)),
      splittable: true,
    };
  };
  const sections: FlowSection[] = [];
  const entrySection = (id: SectionId, ids: string[]) => {
    if (ids.length > 0) sections.push({ id, title: titleOf(id), again: titleOf(id), blocks: ids.map(entryBlock) });
  };
  const proseSection = (id: ProseId | "notes" | "identity", plan: ProsePlan | null, only?: (index: number) => boolean) => {
    const paragraphs = cont.prose[id] ?? [];
    const first = plan ? plan.paragraphs : 0;
    const blocks: FlowBlock[] = [];
    for (let index = first; index < paragraphs.length; index += 1) {
      if (only && !only(index)) continue;
      const start = plan?.cut && index === first ? plan.cut.pieces : 0;
      const parts = Array.from({ length: widths }, (_, width) => pieceParts(paragraphs[index].bottoms, width));
      const count = parts[0].length;
      if (count <= start) continue;
      blocks.push({
        id: `${id}:${index}`,
        parts: Array.from({ length: count }, (_, part) => ({ h: parts.map((list) => list[part] ?? 0) })),
        resume: unitOf(cont.line),
        splittable: true,
        ...(start > 0 ? { start } : {}),
      });
    }
    if (blocks.length > 0) sections.push({ id: id as SectionId, title: titleOf(id as SectionId), again: titleOf(id as SectionId), blocks });
  };
  const tableSection = (id: TableId, plan: TablePlan | null) => {
    const measure = cont.tables[id];
    if (!plan || !plan.marker || !measure) return;
    sections.push({
      id,
      title: titleOf(id),
      again: titleOf(id),
      tableHead: unitOf(measure.head),
      blocks: measure.rows.slice(plan.rows).map((row, index) => ({ id: `${id}:row:${plan.rows + index}`, parts: [unitOf(row)], splittable: false })),
    });
  };

  for (const id of SECTIONS) {
    if (id === "identity") {
      proseSection("identity", null, (index) => identity[index] === "cont");
    } else if (id === "status" || id === "training" || id === "appearance" || id === "backstory" || id === "languages") {
      const plan = prose[id];
      if (plan.cut || plan.paragraphs < core.prose[id].paragraphs.length) proseSection(id, plan);
    } else if (id === "attacks" || id === "spells" || id === "equipment") {
      tableSection(id, tables[id]);
    } else if (id === "features" || id === "speciesTraits" || id === "feats") {
      entrySection(id, text[id].summarized);
    } else if (id === "items" || id === "attackTexts") {
      entrySection(id, cont.extra[id]);
    } else if (id === "notes" && cont.extra.notes) {
      proseSection("notes", null);
    }
  }

  const p2Frames: FlowFrame[] = (cont.p2 ?? []).map((capacity) => ({ page: 2, capacity, width: 1 }));
  const contFrames = (page: number) => Array.from({ length: cont.columns }, () => ({ page, capacity: cont.capacity, width: 0 }));
  const flow = sections.length > 0 || p2Frames.length > 0 ? packFlow(sections, p2Frames, contFrames, 3) : { columns: [], sectionPage: {}, blockPage: {} };
  // page 2's left-half frames print even when nothing continues (their ruled notes)
  const p2 = cont.p2 ? p2Frames.map((frame) => flow.columns.find((column) => column.frame === frame) ?? { frame, items: [], used: 0 }) : null;
  const contPages = byPage(flow.columns.filter((column) => column.frame.page > 2));
  let pages = 2 + contPages.length;

  const entries: Record<string, number> = { ...flow.blockPage };
  let spellbook: DocumentPlan["spellbook"] = null;
  const book = input.spellbook;
  if (book && book.levels.some((level) => level.spells.length > 0)) {
    const start = pages + 1;
    const bookSections: FlowSection[] = [
      {
        id: "index",
        title: { h: [book.indexTitle] },
        again: null,
        tableHead: { h: [book.indexHead] },
        blocks: book.indexRows.map((row) => ({ id: `index:${row.id}`, parts: [{ h: [row.h] }], splittable: false })),
      },
      ...book.levels.map((level) => ({
        id: `level:${level.level}`,
        title: { h: [level.title] },
        again: { h: [level.again] },
        blocks: level.spells.map((spell) => ({
          id: spell.id,
          head: { h: [spell.head] },
          ...(spell.again ? { headAgain: { h: [spell.again] } } : {}),
          parts: spell.parts.map((part) => ({ h: [part] })),
          splittable: true,
        })),
      })),
    ];
    const frames = (page: number) => Array.from({ length: book.columns }, () => ({ page, capacity: book.capacity, width: 0 }));
    const placed = packFlow(bookSections, [], frames, start);
    spellbook = { pages: byPage(placed.columns) };
    pages += spellbook.pages.length;
    for (const [id, page] of Object.entries(placed.blockPage)) if (!id.startsWith("index:")) entries[id] = page;
  }

  return {
    identity,
    text,
    tables,
    prose,
    continuation: { p2, pages: contPages },
    spellbook,
    sections: flow.sectionPage as Partial<Record<SectionId, number>>,
    entries,
    pages,
  };
}
