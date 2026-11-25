import { parseTags, splitRef, type TextToken } from "./tags";

/**
 * The 1–20 progression of a class, read from its features table (phase 2b §4.2). Built-in, Drive-pack
 * and homebrew classes alike carry one `table` block whose first three English column labels are
 * `Level`, `Proficiency Bonus`, `Class Features`; the other columns are read by their English label,
 * so one parser serves the corpus and the homebrew generator. Pure: no corpus import.
 */

/** A table cell the class columns hold: a number, a short text (`1d6`, `+2`, `10 ft.`), `—` read as 0. */
export type ProgressionValue = number | string;

/** A class-specific column (Rages, Eldritch Invocations, an author column) at one level. */
export interface ProgressionColumn {
  /** Column index in the table. */
  index: number;
  /** English column label. */
  label: string;
  value: ProgressionValue;
}

/** A link of the Class Features cell (`{@classFeature Name|Class||Level}`). */
export interface ProgressionFeature {
  ref: string;
  /** Display text of the tag. */
  name: string;
}

export interface LevelProgression {
  level: number;
  /** The Cantrips column, when the class has one. */
  cantrips?: number;
  /** The Prepared Spells column, when the class has one. */
  prepared?: number;
  /** Slots of spell levels 1–9 (columns `1`…`9`, missing levels 0), when the class has them. */
  slots?: number[];
  /** Pact Magic (`Spell Slots` + `Slot Level`), when the class has it. */
  pact?: { slots: number; level: number };
  /** Every other column after Class Features, in table order. */
  columns: ProgressionColumn[];
  /** The Class Features cell's links. */
  features: ProgressionFeature[];
}

export interface ClassProgression {
  /** Index 0 = level 1; as many levels as the table has rows (1–20). */
  levels: LevelProgression[];
  /** English labels of the class-specific columns, in table order. */
  columnLabels: string[];
}

/** Anything that carries a class's blocks: a corpus or pack entry, or a resolved reference. */
export type ClassBlocksSource =
  | readonly unknown[]
  | { entries?: readonly unknown[]; blocks?: ReadonlyArray<{ block: unknown }>; srdBlocks?: ReadonlyArray<{ block: unknown }> };

export const PROGRESSION_HEADER = ["Level", "Proficiency Bonus", "Class Features"] as const;
const CANTRIPS = "Cantrips";
const PREPARED = "Prepared Spells";
const PACT_SLOTS = "Spell Slots";
const PACT_LEVEL = "Slot Level";
const SLOT_LABELS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;
const NONE = /^[—–-]$/;

interface TableBlock {
  type: "table";
  colLabels: unknown[];
  rows: unknown[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function label(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isProgressionTable(block: unknown): block is TableBlock {
  if (!isRecord(block) || block.type !== "table" || !Array.isArray(block.colLabels) || !Array.isArray(block.rows)) return false;
  return PROGRESSION_HEADER.every((name, index) => label((block.colLabels as unknown[])[index]).toLowerCase() === name.toLowerCase());
}

/** The first progression table in `blocks`, searching nested `entries` depth first. */
export function findProgressionTable(blocks: readonly unknown[]): TableBlock | null {
  for (const block of blocks) {
    if (isProgressionTable(block)) return block;
    if (isRecord(block) && Array.isArray(block.entries)) {
      const nested = findProgressionTable(block.entries);
      if (nested) return nested;
    }
  }
  return null;
}

function isBlockList(source: ClassBlocksSource): source is readonly unknown[] {
  return Array.isArray(source);
}

function blocksOf(source: ClassBlocksSource): readonly unknown[] {
  if (isBlockList(source)) return source;
  if (Array.isArray(source.entries)) return source.entries;
  // A resolved reference: the SRD version when a pack overlay replaced the wording, else the shown blocks.
  const layered = source.srdBlocks ?? source.blocks;
  return Array.isArray(layered) ? layered.map((item) => (isRecord(item) ? item.block : undefined)) : [];
}

/** A cell as a number: `—` and empty are 0, `+2` is 2; null when the cell is text (`1d6`). */
function cellNumber(cell: unknown): number | null {
  if (typeof cell === "number" && Number.isFinite(cell)) return cell;
  const text = cellText(cell);
  if (!text || NONE.test(text)) return 0;
  return /^[+]?\d+$/.test(text) ? Number(text.replace("+", "")) : null;
}

/** A cell's display text: tags resolved to their text, nested cells (`{type: "cell"}`) unwrapped. */
function cellText(cell: unknown): string {
  if (typeof cell === "number") return String(cell);
  if (typeof cell === "string") return tokensText(parseTags(cell)).trim();
  if (isRecord(cell)) {
    if (typeof cell.entry === "string") return cellText(cell.entry);
    if (isRecord(cell.roll) && typeof cell.roll.exact === "number") return String(cell.roll.exact);
  }
  return "";
}

function tokensText(tokens: TextToken[]): string {
  return tokens.map((token) => (token.type === "styled" ? tokensText(token.children) : token.text)).join("");
}

/** A class column keeps its text (`+2`, `1d6`) unless it is a bare number; `—` is 0. */
function columnValue(cell: unknown): ProgressionValue {
  if (typeof cell === "number" && Number.isFinite(cell)) return cell;
  const text = cellText(cell);
  if (!text || NONE.test(text)) return 0;
  return /^\d+$/.test(text) ? Number(text) : text;
}

function featureLinks(cell: unknown): ProgressionFeature[] {
  if (typeof cell !== "string") return [];
  const out: ProgressionFeature[] = [];
  const walk = (tokens: TextToken[]) => {
    for (const token of tokens) {
      if (token.type === "styled") walk(token.children);
      else if (token.type === "link") {
        const ref = token.refs.find((candidate) => splitRef(candidate)?.kind === "classFeature");
        if (ref) out.push({ ref, name: token.text });
      }
    }
  };
  walk(parseTags(cell));
  return out;
}

function rowCells(row: unknown): unknown[] | null {
  if (Array.isArray(row)) return row;
  if (isRecord(row) && Array.isArray(row.row)) return row.row;
  return null;
}

/**
 * The class's progression, or null when its blocks hold no progression table. Rows are taken in
 * table order; a row's level is its Level cell (else its position).
 */
export function progressionOf(source: ClassBlocksSource): ClassProgression | null {
  const table = findProgressionTable(blocksOf(source));
  if (!table) return null;
  const labels = table.colLabels.map(label);
  const find = (name: string) => labels.findIndex((value, index) => index >= PROGRESSION_HEADER.length && value === name);
  const cantrips = find(CANTRIPS);
  const prepared = find(PREPARED);
  const pactSlots = find(PACT_SLOTS);
  const pactLevel = find(PACT_LEVEL);
  const slotColumns = SLOT_LABELS.map(find);
  const hasSlots = slotColumns.some((index) => index >= 0);
  const casting = new Set([cantrips, prepared, pactSlots, pactLevel, ...slotColumns].filter((index) => index >= 0));
  const other = labels
    .map((value, index) => ({ value, index }))
    .filter(({ index }) => index >= PROGRESSION_HEADER.length && !casting.has(index));
  const levels: LevelProgression[] = [];
  table.rows.forEach((row, position) => {
    const cells = rowCells(row);
    if (!cells) return;
    const level = cellNumber(cells[0]) || position + 1;
    const out: LevelProgression = {
      level,
      columns: other.map(({ value, index }) => ({ index, label: value, value: columnValue(cells[index]) })),
      features: featureLinks(cells[2]),
    };
    if (cantrips >= 0) out.cantrips = cellNumber(cells[cantrips]) ?? 0;
    if (prepared >= 0) out.prepared = cellNumber(cells[prepared]) ?? 0;
    if (hasSlots) out.slots = slotColumns.map((index) => (index >= 0 ? cellNumber(cells[index]) ?? 0 : 0));
    if (pactSlots >= 0 && pactLevel >= 0) {
      out.pact = { slots: cellNumber(cells[pactSlots]) ?? 0, level: cellNumber(cells[pactLevel]) ?? 0 };
    }
    levels.push(out);
  });
  levels.sort((a, b) => a.level - b.level);
  return { levels, columnLabels: other.map(({ value }) => value) };
}

/** One level of a progression, or undefined when the table has no such row. */
export function progressionAt(progression: ClassProgression | null | undefined, level: number): LevelProgression | undefined {
  return progression?.levels.find((row) => row.level === level);
}
