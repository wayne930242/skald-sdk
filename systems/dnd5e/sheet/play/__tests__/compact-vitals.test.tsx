import { act } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { loadDndHarness, mountDnd, type DndHarness } from "./dnd-harness";

/** UAT M11 (phone hit dice stacked per die), m24 (opaque bar, vitals condensed once scrolled), m15 (header). */

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), warning: vi.fn(), dismiss: vi.fn() }) }));

let harness: DndHarness;
beforeAll(async () => {
  harness = await loadDndHarness();
});

const observers: Array<(entries: Array<Partial<IntersectionObserverEntry>>) => void> = [];
afterEach(() => {
  observers.length = 0;
  vi.unstubAllGlobals();
});

const WIZARD_ROW = { id: "class_w", classId: "wizard", ref: "class:wizard", origin: "srd", name: "Wizard", subclass: "", level: 1, hitDie: 6, hitDiceSpent: 0, spellAbility: "int" };

describe("the phone's vitals", () => {
  it("stacks a multiclass character's hit dice one pool per line inside the tile (M11)", async () => {
    await mountDnd(harness, { width: 390, locale: "en", extra: { level: 4, hitDieFaces: 10, hitDiceSpent: 1, className: "Fighter", multiclass: [WIZARD_ROW] } });
    const tile = document.querySelector('[data-play-stat="hit-dice"]') as HTMLElement;
    const lines = [...tile.querySelectorAll(".whitespace-nowrap")].map((line) => line.textContent);
    expect(lines).toEqual(["d10 2/3", "d6 1/1"]);
    expect(tile.textContent).not.toContain("·");
  });

  it("keeps a single-class tile as before", async () => {
    await mountDnd(harness, { width: 390, locale: "en", extra: { level: 3, hitDieFaces: 10 } });
    const tile = document.querySelector('[data-play-stat="hit-dice"]') as HTMLElement;
    expect(tile).toHaveTextContent("3/3");
  });

  it("an opaque bar whose vitals keep one row once the page scrolls past it (m24)", async () => {
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(callback: (entries: Array<Partial<IntersectionObserverEntry>>) => void) {
          observers.push(callback);
        }
        observe() {}
        disconnect() {}
      },
    );
    await mountDnd(harness, { width: 390, locale: "en" });
    const vitals = document.querySelector("[data-play-vitals]") as HTMLElement;
    const bar = vitals.parentElement as HTMLElement;
    expect(bar).toHaveClass("bg-background");
    expect(bar.className).not.toMatch(/backdrop-blur|bg-background\//);
    const more = document.querySelector("[data-play-vitals-more]") as HTMLElement;
    expect(more).not.toHaveClass("hidden");
    await act(async () => observers.at(-1)?.([{ isIntersecting: false, boundingClientRect: { top: -40 } as DOMRect, rootBounds: { top: 0 } as DOMRect }]));
    expect(more).toHaveClass("hidden");
    expect(vitals).toHaveAttribute("data-condensed", "true");
    await act(async () => observers.at(-1)?.([{ isIntersecting: true, boundingClientRect: { top: 20 } as DOMRect, rootBounds: { top: 0 } as DOMRect }]));
    expect(more).not.toHaveClass("hidden");
  });

  it("the header strip shows the class line and level above the tabs (m15)", async () => {
    await mountDnd(harness, { width: 390, locale: "en", extra: { level: 4, className: "Fighter", multiclass: [WIZARD_ROW] } });
    const header = document.querySelector("[data-play-header]") as HTMLElement;
    expect(header).toHaveTextContent("Fighter 3 / Wizard 1 · Level 4");
    expect(header.querySelector("[data-play-level-up]")).toBeNull(); // the harness has no level-up helper
  });
});
