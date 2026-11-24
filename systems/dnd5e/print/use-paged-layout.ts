"use client";

import { useLayoutEffect, useRef, useState } from "react";
import type { PrintContent } from "./content";
import {
  paginate,
  SECTIONS,
  type DocumentPlan,
  type IdentityMeasure,
  type PaginateInput,
  type ProseId,
  type ProseMeasure,
  type TableMeasure,
  type TextRegionId,
} from "./paginate";

/**
 * The DOM side of the pager: reads the measuring layer once (every entry, paragraph, sentence and
 * row, at its frame's width), hands the heights to `paginate`, and keeps the plan until the
 * content, paper or locale change. Heights come from `getBoundingClientRect` divided by the
 * layer's own scale, so a zoomed preview measures in layout px; no layout runs inside the
 * pager's loops.
 */

type Measure = (element: Element | null | undefined) => number;

function scaleOf(root: HTMLElement): number {
  const width = root.getBoundingClientRect().width;
  return root.offsetWidth > 0 && width > 0 ? width / root.offsetWidth : 1;
}

function frameIn(root: ParentNode, id: string): HTMLElement | null {
  return root.querySelector<HTMLElement>(`[data-print-frame="${id}"]`);
}

/** A frame's height for content: its box less padding and one line kept spare. */
function capacity(frame: HTMLElement | null, h: Measure): number {
  if (!frame) return 0;
  const style = getComputedStyle(frame);
  const inner = h(frame) - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
  return Math.max(0, inner - h(frame.querySelector('[data-m="line"]')));
}

function entryOf(element: Element | null, h: Measure): { head: number; again: number; parts: number[] } {
  if (!element) return { head: 0, again: 0, parts: [] };
  return {
    head: h(element.querySelector(":scope > [data-m-head]")),
    again: h(element.querySelector(":scope > [data-m-again]")),
    parts: [...element.querySelectorAll(":scope > [data-m-part]")].map((part) => h(part)),
  };
}

function proseOf(paragraph: Element | null, h: Measure, scale: number): { height: number; bottoms: number[] } {
  if (!paragraph) return { height: 0, bottoms: [] };
  const top = paragraph.getBoundingClientRect().top;
  return {
    height: h(paragraph),
    bottoms: [...paragraph.querySelectorAll("[data-piece]")].map((piece) => (piece.getBoundingClientRect().bottom - top) / scale),
  };
}

function tableOf(table: Element | null, h: Measure): { head: number; rows: number[]; marker: number; blank: number } {
  return {
    head: h(table?.querySelector(":scope > thead")),
    rows: [...(table?.querySelectorAll(":scope > tbody > tr[data-m-row]") ?? [])].map((row) => h(row)),
    marker: h(table?.querySelector('[data-m="marker"]')),
    blank: h(table?.querySelector('[data-m="blank"]')),
  };
}

/** A paragraph's top padding, in layout px (a computed style is not scaled). */
function paddingTopOf(element: Element | null | undefined): number {
  return element ? parseFloat(getComputedStyle(element).paddingTop) || 0 : 0;
}

/** An identity line of page 1: its value's width and height, and the probes the value holds. */
function identityOf(line: Element | null, h: Measure, scale: number): IdentityMeasure {
  const width = (element: Element | null | undefined) => (element ? element.getBoundingClientRect().width / scale : 0);
  const value = line?.querySelector(":scope > .dnd-print-value, :scope > .dnd-print-name-value") ?? null;
  return {
    width: width(value),
    room: line ? (line as HTMLElement).clientHeight : 0,
    sizes: [...(value?.querySelectorAll('[data-m^="size:"]') ?? [])].map((probe) => width(probe)),
    wrap: h(value?.querySelector('[data-m="wrap"]')),
    line: h(value?.querySelector('[data-m="wrap-line"]')),
  };
}

const CORE_PROSE: Record<ProseId, string> = { status: "status", training: "training", appearance: "appearance", backstory: "backstory", languages: "languages" };

/** Every height the pager needs, read from the measuring layer. */
export function measureLayout(root: HTMLElement, content: PrintContent, p2Continues: boolean): PaginateInput {
  const scale = scaleOf(root);
  const h: Measure = (element) => (element ? element.getBoundingClientRect().height / scale : 0);
  const frame = (id: string) => frameIn(root, id);
  const inFrame = (id: string, selector: string) => frame(id)?.querySelector(selector) ?? null;

  const text = (id: TextRegionId, frames: string[]) => ({
    frames: frames.map((name) => capacity(frame(name), h)),
    moreHeight: h(inFrame(frames[0], ".dnd-print-more")),
    entries: content.text[id].map((entry) => ({
      id: entry.id,
      ...entryOf(inFrame(frames[0], `[data-m="entry:${entry.id}"]`), h),
      summary: h(inFrame(frames[0], `[data-m="sum:${entry.id}"]`)),
    })),
  });
  const table = (id: string): TableMeasure => {
    const measured = tableOf(inFrame(id, '[data-m="table"]'), h);
    return { capacity: capacity(frame(id), h), ...measured };
  };
  const prose = (id: ProseId): ProseMeasure => {
    const name = CORE_PROSE[id];
    return {
      capacity: capacity(frame(name), h),
      marker: h(inFrame(name, '[data-m="marker"]')),
      paragraphs: content.prose[id].map((_, index) => proseOf(inFrame(name, `[data-m="prose:${id}:${index}"]`), h, scale)),
    };
  };

  // 續頁 candidates: index 0 the 續頁 column, index 1 page 2's left half
  const contFrames = [frame("measure:cont"), ...(p2Continues ? [frame("p2:0")] : [])];
  const perWidth = <T,>(read: (scope: HTMLElement | null) => T): T[] => contFrames.map((scope) => read(scope));
  const entryIds = [...content.text.features, ...content.text.speciesTraits, ...content.text.feats, ...content.items, ...content.attackTexts].map((entry) => entry.id);
  const entries = Object.fromEntries(entryIds.map((id) => {
    const measured = perWidth((scope) => entryOf(scope?.querySelector(`[data-m="entry:${id}"]`) ?? null, h));
    return [id, { head: measured.map((m) => m.head), again: measured.map((m) => m.again), parts: measured[0].parts.map((_, part) => measured.map((m) => m.parts[part] ?? m.parts[m.parts.length - 1] ?? 0)) }];
  }));
  const contTables = Object.fromEntries((["attacks", "spells", "equipment"] as const).map((id) => {
    const measured = perWidth((scope) => tableOf(scope?.querySelector(`[data-m="table:${id}"]`) ?? null, h));
    return [id, { head: measured.map((m) => m.head), rows: measured[0].rows.map((_, row) => measured.map((m) => m.rows[row] ?? 0)) }];
  }));
  const contProse = Object.fromEntries((["identity", "status", "training", "appearance", "backstory", "languages", "notes"] as const).map((id) => [
    id,
    content.prose[id].map((_, index) => {
      const measured = perWidth((scope) => proseOf(scope?.querySelector(`[data-m="prose:${id}:${index}"]`) ?? null, h, scale));
      return { h: measured.map((m) => m.height), bottoms: measured.map((m) => m.bottoms) };
    }),
  ]));

  const book = frame("measure:book");
  const indexTable = book?.querySelector('[data-m="table:index"]') ?? null;
  const index = tableOf(indexTable, h);
  const spellbook: PaginateInput["spellbook"] = book && content.spellbook.length > 0
    ? {
      capacity: capacity(book, h),
      columns: 2,
      indexTitle: h(book.querySelector('[data-m="index-title"]')),
      indexHead: index.head,
      indexRows: content.index.map((row, position) => ({ id: row.id, h: index.rows[position] ?? 0 })),
      levels: content.spellbook.map((level) => ({
        level: level.level,
        title: h(book.querySelector(`[data-m="title:level:${level.level}"]`)),
        again: h(book.querySelector(`[data-m="again:level:${level.level}"]`)),
        spells: level.spells.map((spell) => ({ id: spell.id, ...entryOf(book.querySelector(`[data-m="spell:${spell.id}"]`), h) })),
      })),
    }
    : null;

  return {
    core: {
      identity: content.identity.map((_, index) => identityOf(root.querySelector(`[data-m="ident:${index}"]`), h, scale)),
      text: {
        features: text("features", ["features:0", "features:1"]),
        speciesTraits: text("speciesTraits", ["speciesTraits"]),
        feats: text("feats", ["feats"]),
      },
      tables: {
        attacks: table("attacks"),
        spells: p2Continues ? null : table("spells"),
        equipment: table("equipment"),
      },
      prose: {
        status: prose("status"),
        training: prose("training"),
        appearance: prose("appearance"),
        backstory: prose("backstory"),
        languages: prose("languages"),
      },
    },
    cont: {
      p2: p2Continues ? [capacity(frame("p2:0"), h), capacity(frame("p2:1"), h)] : null,
      capacity: capacity(frame("measure:cont"), h),
      columns: 2,
      line: perWidth((scope) => h(scope?.querySelector('[data-m="line"]')) + paddingTopOf(scope?.querySelector(".dnd-print-para"))),
      titles: Object.fromEntries(SECTIONS.map((id) => [id, perWidth((scope) => h(scope?.querySelector(`[data-m="title:${id}"]`)))])),
      entries,
      tables: contTables,
      prose: contProse,
      extra: {
        items: content.items.map((entry) => entry.id),
        attackTexts: content.attackTexts.map((entry) => entry.id),
        notes: content.prose.notes.length > 0,
      },
    },
    spellbook,
  };
}

/**
 * Lays the pages out for `key` (the content, paper and locale): while there is no plan for it the
 * caller renders the measuring layer into `ref`; once the fonts are in, this measures it and
 * keeps the plan. A web font that finishes loading later lays the pages out again.
 */
export function usePagedLayout(key: unknown, enabled: boolean, measure: (root: HTMLElement) => PaginateInput) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<{ key: unknown; plan: DocumentPlan; ms: number } | null>(null);
  const [fontEpoch, setFontEpoch] = useState(0);
  const current = state && state.key === key && state.ms >= 0 ? state : null;

  useLayoutEffect(() => {
    if (!enabled || current) return;
    let live = true;
    const run = () => {
      const root = ref.current;
      if (!live || !root) return;
      const started = performance.now();
      const plan = paginate(measure(root));
      // The measured layer is the external state here: the plan is set before paint, so the
      // preview never shows (or prints) the measuring layer.
      setState({ key, plan, ms: performance.now() - started });
    };
    const root = ref.current;
    // reading the layout starts the loads of the web fonts the measured text needs
    void root?.offsetHeight;
    const fonts = typeof document !== "undefined" ? document.fonts : undefined;
    if (!fonts || fonts.status === "loaded") run();
    else void fonts.ready.then(run);
    return () => {
      live = false;
    };
  }, [enabled, current, key, measure, fontEpoch]);

  useLayoutEffect(() => {
    const fonts = typeof document !== "undefined" ? document.fonts : undefined;
    if (!fonts) return;
    const again = () => {
      setState(null);
      setFontEpoch((epoch) => epoch + 1);
    };
    fonts.addEventListener("loadingdone", again);
    return () => fonts.removeEventListener("loadingdone", again);
  }, []);

  return { ref, plan: current?.plan ?? null, ms: current?.ms ?? null };
}
