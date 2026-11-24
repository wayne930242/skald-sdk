import type { CorpusParts } from "./load-corpus";
import { splitRef, type DndKind } from "./tags";
import type { BookViewState } from "./view-state";

interface BookLocation extends Pick<BookViewState, "book" | "anchor"> { chapter: string }

const CHAPTER_BY_KIND: Record<Exclude<DndKind, "chapter">, string> = {
  spell: "spells",
  class: "classes", subclass: "classes", classFeature: "classes", subclassFeature: "classes", optionalFeature: "classes",
  species: "character-origins", lineage: "character-origins", background: "character-origins", language: "character-origins",
  feat: "feats",
  baseItem: "equipment", item: "equipment", itemGroup: "equipment", itemProperty: "equipment", itemMastery: "equipment",
  action: "playing-the-game", skill: "playing-the-game",
  condition: "rules-glossary", status: "rules-glossary", rule: "rules-glossary", table: "gameplay-toolbox",
  creature: "monsters",
};

export const RULES_GLOSSARY_REF = "chapter:srd/rules-glossary";

/** Locate a resolved entry in the reader. Ordinary entries link to a chapter, not a page or backlink. */
export function bookLocationFor(parts: CorpusParts, ref: string, magicItem = false): BookLocation | null {
  const parsed = splitRef(ref);
  if (!parsed) return null;
  const { kind, id } = parsed;
  const [book] = id.split("/");
  if (kind === "chapter" && (book === "xphb" || book === "xdmg")) {
    const chapter = `chapter:${id.split("/").slice(0, 2).join("/")}`;
    return { book, chapter, anchor: ref === chapter ? null : ref };
  }

  const chapterId = kind === "chapter" ? id.split("/").slice(0, 2).join("/")
    : `srd/${kind === "item" && magicItem ? "magic-items" : CHAPTER_BY_KIND[kind]}`;
  const part = parts.chapter[chapterId];
  if (!part || (kind === "chapter" && parts.chapter[id] !== part)) return null;
  const chapter = `chapter:${chapterId}`;
  return { book: "srd", chapter, anchor: kind === "chapter" && ref !== chapter ? ref : null };
}
