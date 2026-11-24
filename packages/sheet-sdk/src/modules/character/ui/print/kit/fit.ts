"use client";

import { useCallback, useLayoutEffect, useState, type RefObject } from "react";

/**
 * Measurement helpers for prints that fit their content to fixed pages. A System keeps its own
 * planner (CoC's skill columns, D&D's pager); these measure the rendered DOM it plans against.
 */

const NONE: readonly string[] = [];

/** The `data-fit-block` names inside `element` whose bottom runs past its visible bottom. */
function clippedBlocks(element: HTMLElement): string[] {
  const bottom = element.getBoundingClientRect().bottom + 0.5;
  return [...element.querySelectorAll<HTMLElement>("[data-fit-block]")]
    .filter((block) => block.getBoundingClientRect().bottom > bottom)
    .map((block) => block.dataset.fitBlock ?? "");
}

export interface FitState {
  /** Index into `steps`. */
  step: number;
  /** `steps[step]`, e.g. the type size in points. */
  value: number;
  /** Measured at this step: the print may report ready. */
  settled: boolean;
  /** Still overflowing at the last step: the content is clipped and the page should say so. */
  overflow: boolean;
  /** The `data-fit-block` blocks cut off at the last step, which a later page may print in full. */
  clipped: readonly string[];
}

/**
 * The step a box takes so its content fits: the next step whenever the rendered box overflows on
 * `axis` (measured before paint, again once the fonts are in), back to the first when `key`
 * changes. `ref` is the box that clips (its scroll size against its client size).
 */
export function useFitSteps<K>({
  key,
  ref,
  steps,
  axis = "y",
}: {
  key: K;
  ref: RefObject<HTMLElement | null>;
  steps: readonly number[];
  axis?: "x" | "y";
}): FitState {
  const initial = { key, step: 0, settled: false, overflow: false, clipped: NONE };
  const [state, setState] = useState(initial);
  const current = state.key === key ? state : initial;
  const measure = useCallback(() => {
    const element = ref.current;
    if (!element) return;
    const over = axis === "x" ? element.scrollWidth > element.clientWidth + 1 : element.scrollHeight > element.clientHeight + 1;
    if (over && current.step < steps.length - 1) {
      setState({ key, step: current.step + 1, settled: false, overflow: false, clipped: NONE });
      return;
    }
    const clipped = over ? clippedBlocks(element) : NONE;
    const same = current.settled && current.overflow === over && clipped.join() === current.clipped.join();
    if (!same) setState({ key, step: current.step, settled: true, overflow: over, clipped });
  }, [axis, current.clipped, current.overflow, current.settled, current.step, key, ref, steps.length]);
  useLayoutEffect(() => {
    // The rendered box is the external state here: an overflowing box takes the next step before
    // paint, so a fixed page never spills onto another sheet.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    measure();
    let live = true;
    void Promise.resolve(document.fonts?.ready).then(() => live && measure());
    return () => {
      live = false;
    };
  }, [measure]);
  return {
    step: current.step,
    value: steps[current.step],
    settled: current.settled,
    overflow: current.overflow,
    clipped: current.clipped,
  };
}

/**
 * Indexes of rows per page: rows stay whole, `gap` between them, a page holds `available`; a row
 * taller than a page gets a page of its own rather than being cut. All three in one unit: with
 * heights from `useMeasuredHeights` (CSS px), pass `ptToPx(pageBody(paper).height)` (less any
 * header), never the pt number itself.
 */
export function paginateByHeight(heights: readonly number[], available: number, gap: number): number[][] {
  const pages: number[][] = [];
  let used = 0;
  let page: number[] = [];
  heights.forEach((height, index) => {
    if (page.length && used + gap + height > available) {
      pages.push(page);
      page = [];
      used = 0;
    }
    used += (page.length ? gap : 0) + height;
    page.push(index);
  });
  if (page.length) pages.push(page);
  return pages;
}

/**
 * The rendered heights, in CSS px (`getBoundingClientRect`), of `ref`'s children, measured once
 * the fonts are in; null until then and again whenever `key` changes, so a pager never packs
 * against a stale probe.
 */
export function useMeasuredHeights(ref: RefObject<HTMLElement | null>, key: unknown): number[] | null {
  const [measured, setMeasured] = useState<{ key: unknown; heights: number[] } | null>(null);
  const current = measured && measured.key === key ? measured.heights : null;
  useLayoutEffect(() => {
    if (current) return;
    let live = true;
    void Promise.resolve(document.fonts?.ready).then(() => {
      const element = ref.current;
      if (!live || !element) return;
      setMeasured({ key, heights: [...element.children].map((child) => child.getBoundingClientRect().height) });
    });
    return () => {
      live = false;
    };
  }, [current, key, ref]);
  return current;
}
