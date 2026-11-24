import { describe, expect, it } from "vitest";
import { bookLocationFor } from "../chapter-map";
import { loadCorpusParts } from "../load-corpus";
import { DND_KINDS } from "../tags";

const parts = await loadCorpusParts();

describe("reference book locations", () => {
  it.each(DND_KINDS)("maps %s to an existing SRD chapter", (kind) => {
    const ref = kind === "chapter" ? "chapter:srd/playing-the-game" : `${kind}:imaginary`;
    const location = bookLocationFor(parts, ref);
    expect(location?.book).toBe("srd");
    const chapter = location?.chapter.slice("chapter:".length) ?? "";
    expect(Object.hasOwn(parts.chapter, chapter)).toBe(true);
    if (location?.anchor) {
      expect(parts.chapter[location.anchor.slice("chapter:".length)]).toBe(parts.chapter[chapter]);
    }
  });

  it("preserves a chapter section and distinguishes magic items from ordinary equipment", () => {
    const section = "chapter:srd/playing-the-game/combat";
    expect(bookLocationFor(parts, section)).toEqual({ book: "srd", chapter: "chapter:srd/playing-the-game", anchor: section });
    expect(bookLocationFor(parts, "item:dream-cup")?.chapter).toBe("chapter:srd/equipment");
    expect(bookLocationFor(parts, "item:dream-cup", true)?.chapter).toBe("chapter:srd/magic-items");
    expect(bookLocationFor(parts, "chapter:srd/playing-the-game/not-a-section")).toBeNull();
  });

  it("opens a resolved pack book chapter or section in its own book", () => {
    const section = "chapter:xphb/intro/dreams";
    expect(bookLocationFor(parts, section)).toEqual({ book: "xphb", chapter: "chapter:xphb/intro", anchor: section });
  });
});
