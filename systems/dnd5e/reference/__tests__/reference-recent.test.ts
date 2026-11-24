import { describe, expect, it } from "vitest";
import { parseReferenceHistory, recordReferenceVisit, toggleReferencePin } from "../recent";

const refs = Array.from({ length: 12 }, (_, i) => `spell:imaginary-${i}`);

describe("reference history", () => {
  it("gives broken JSON or unexpected shapes an empty history and permits new visits", () => {
    for (const raw of [null, "{", "[]", "null", '{"recent":42,"pinned":"spell:sun"}']) {
      const history = parseReferenceHistory(raw);
      expect(history).toEqual({ recent: [], pinned: [] });
      expect(recordReferenceVisit(history, refs[0]).recent).toEqual([refs[0]]);
    }
  });

  it("keeps the newest ten unique visits and moves a revisit to the front", () => {
    const history = refs.reduce(recordReferenceVisit, parseReferenceHistory(null));
    expect(history.recent).toEqual(refs.slice(2).reverse());
    expect(recordReferenceVisit(history, refs[9]).recent).toEqual([refs[9], ...history.recent.filter((ref) => ref !== refs[9])]);
  });

  it("caps and toggles pins independently from recent, and sanitizes persisted lists", () => {
    const history = parseReferenceHistory(JSON.stringify({ recent: [refs[0], refs[0], null, "unknown:bad"], pinned: [refs[0], ...refs] }));
    expect(history).toEqual({ recent: [refs[0]], pinned: refs.slice(0, 10) });
    const toggled = toggleReferencePin(toggleReferencePin(history, refs[0]), refs[10]);
    expect(toggled).toEqual({ recent: [refs[0]], pinned: [refs[10], ...refs.slice(1, 10)] });
    expect(toggleReferencePin(history, refs[11]).pinned).toEqual([refs[11], ...refs.slice(0, 9)]);
  });
});
