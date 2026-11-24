/**
 * 5etools inline tags (`{@spell Fireball|XPHB}`) parsed into tokens, per design §1.6.
 * Pure: no React, so entries-to-text and entries-renderer share one reading.
 */

export type DndKind =
  | "spell" | "class" | "classFeature" | "subclass" | "subclassFeature" | "species" | "lineage"
  | "background" | "feat" | "optionalFeature" | "baseItem" | "item" | "itemGroup" | "itemProperty"
  | "itemMastery" | "language" | "condition" | "status" | "skill" | "rule" | "action"
  | "creature" | "table" | "chapter";

export const DND_KINDS: readonly DndKind[] = [
  "spell", "class", "classFeature", "subclass", "subclassFeature", "species", "lineage", "background",
  "feat", "optionalFeature", "baseItem", "item", "itemGroup", "itemProperty", "itemMastery", "language",
  "condition", "status", "skill", "rule", "action", "creature", "table", "chapter",
];

export type TagLabel =
  | "hit" | "attack" | "save" | "saveFail" | "saveSuccess" | "trigger" | "response" | "recharge"
  // Stat block labels (T2b C3), localized by the reference views' lazy labels; English elsewhere.
  | "spellAttack" | "saveFailNth" | "saveFailBy" | "saveSuccessOrFail" | "hitOrMiss";

/** The labels tier A names (`reference.tag.*`); the others live in the lazy reference catalog. */
export const TIER_A_TAG_LABELS: ReadonlySet<TagLabel> = new Set(["hit", "attack", "save", "saveFail", "saveSuccess", "trigger", "response", "recharge"]);

export type TagStyle = "bold" | "italic" | "underline" | "strike" | "note" | "sup" | "sub" | "code" | "highlight";

export type TextToken =
  | { type: "text"; text: string }
  | { type: "styled"; style: TagStyle; children: TextToken[] }
  /** Inline rules text (`DC 15`, `+5`, `50%`, dice) and out-of-scope tags: plain display text. */
  | { type: "plain"; text: string }
  /** A localized label the renderer looks up (`{@h}` → "Hit:", `{@actSave dex}` → "Dexterity Saving Throw:"). */
  | { type: "label"; key: TagLabel; text: string; value?: string }
  /** An in-scope link: candidate refs in order; the first that resolves wins, else display text. */
  | { type: "link"; refs: string[]; text: string };

const STYLE_TAGS: Record<string, TagStyle> = {
  b: "bold", bold: "bold", i: "italic", italic: "italic", u: "underline", s: "strike",
  note: "note", tip: "note", color: "highlight", highlight: "highlight", sup: "sup", sub: "sub", code: "code",
};

const ITEM_PROPERTY_ABBREVIATIONS: Record<string, string> = {
  a: "ammunition", f: "finesse", h: "heavy", l: "light", ld: "loading", r: "reach", t: "thrown",
  "2h": "two-handed", v: "versatile",
};

/** The pipeline's id slug (design §1.4): lowercase ASCII, `'` dropped, other non-alphanumerics → `-`. */
export function slugId(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Index of a tag's display argument: classFeature and subclassFeature carry class, source and level first. */
export function displayIndex(tag: string): number {
  if (tag === "classFeature") return 5;
  if (tag === "subclassFeature") return 7;
  return 2;
}

function displayText(args: string[], tag = ""): string {
  return args[displayIndex(tag)] || args[0] || "";
}

/**
 * SRD 5.2.1 fallback chapters for numbered XPHB book links. Pack chapters are resolved separately
 * against their book metadata.
 */
export const XPHB_CHAPTER_SLUGS: Readonly<Record<string, string>> = {
  1: "playing-the-game",
  2: "character-creation",
  3: "classes",
  4: "character-origins",
  5: "feats",
  6: "equipment",
  7: "spells",
};

/** `{@book Text|XPHB|chapter|header}`: the pack's XPHB chapter, then the SRD chapter, each section first. */
function bookRefs(args: string[]): string[] {
  const [, source = "", chapter = "", header = ""] = args;
  const number = chapter.trim();
  const book = source.toLowerCase();
  if ((book !== "xphb" && book !== "xdmg") || !/^\d+$/.test(number)) return [];
  const slug = book === "xphb" ? XPHB_CHAPTER_SLUGS[number] : undefined;
  const section = slugId(header);
  const packChapter = `book:${book}/${number}`;
  return [
    ...(section ? [`${packChapter}/${section}`] : []),
    packChapter,
    ...(slug && section ? [`chapter:srd/${slug}/${section}`] : []),
    ...(slug ? [`chapter:srd/${slug}`] : []),
  ];
}

/** `{@table Caption|XPHB}` or `{@table Section; Caption|XPHB}`: table ids are caption slugs (plan T2b §2.4). */
function tableRefs(target: string): string[] {
  const caption = target.includes(";") ? target.slice(target.lastIndexOf(";") + 1) : target;
  const ids = [slugId(caption), slugId(target)].filter(Boolean);
  return [...new Set(ids)].map((id) => `table:${id}`);
}

/** Candidate refs for an in-scope link tag; empty for tags that have no reference kind. */
export function linkRefs(tag: string, args: string[]): string[] {
  const target = args[0] ?? "";
  if (tag === "book") return bookRefs(args);
  const id = slugId(target);
  if (!id && tag !== "classFeature" && tag !== "subclassFeature") return [];
  switch (tag) {
    case "spell": return [`spell:${id}`];
    // Magic items (XDMG, plan T2b §2.8) are kind `item` too.
    case "item": return [`baseItem:${id}`, `item:${id}`, `itemGroup:${id}`];
    case "condition": return [`condition:${id}`];
    case "status": return [`status:${id}`];
    case "feat": return [`feat:${id}`];
    case "background": return [`background:${id}`];
    case "race": return [`species:${id}`];
    case "class": return [`class:${id}`];
    case "optfeature": return [`optionalFeature:${id}`];
    case "language": return [`language:${id}`];
    case "skill": return [`skill:${id}`];
    case "action": return [`action:${id}`];
    case "variantrule": return [`rule:${id}`];
    case "sense":
    case "hazard": return [`rule:${id}`];
    // Built-in SRD creatures, or a pack creature when the pack is loaded and names it.
    case "creature": return [`creature:${id}`];
    case "table": return tableRefs(target);
    case "itemMastery": return [`itemMastery:${id}`];
    case "itemProperty": {
      const full = ITEM_PROPERTY_ABBREVIATIONS[target.toLowerCase()] ?? id;
      return [`itemProperty:${full}`];
    }
    case "classFeature": {
      // Name|Class|ClassSource|Level
      const [name = "", className = "", , level = ""] = args;
      return name && className && level ? [`classFeature:${slugId(className)}/${slugId(name)}-l${level}`] : [];
    }
    case "subclassFeature": {
      // Name|Class|ClassSource|Subclass short name|SubclassSource|Level: ids use the subclass's full
      // name, which the short name only starts or ends; the lookup matches on the feature part.
      const [name = "", className = "", , , , level = ""] = args;
      return name && className && level ? [`subclassFeature:${slugId(className)}/*/${slugId(name)}-l${level}`] : [];
    }
    default:
      return [];
  }
}

const RULE_TAGS = new Set([
  "dice", "damage", "d20", "hit", "dc", "chance", "scaledice", "scaledamage", "recharge", "h", "atk", "atkr",
  "actSave", "actSaveFail", "actSaveSuccess", "actTrigger", "actResponse", "hitYourSpellAttack",
  // Bestiary stat block labels (T2b C3).
  "actSaveFailBy", "actSaveSuccessOrFail", "hom",
]);

const LINK_TAGS = new Set([
  "spell", "item", "condition", "status", "feat", "background", "race", "class", "classFeature",
  "subclassFeature", "optfeature", "language", "skill", "sense", "action", "variantrule", "itemProperty",
  "itemMastery", "hazard", "creature", "table", "book",
]);

/** Tags that show their own text (`args[0]`), never the chapter number in `args[2]` (F008). */
const OWN_TEXT_TAGS = new Set(["book", "adventure", "quickref"]);

function ruleText(tag: string, args: string[]): TextToken {
  const first = args[0] ?? "";
  switch (tag) {
    case "dc": return { type: "plain", text: `DC ${args[1] || first}` };
    case "hit": {
      const value = Number(first);
      return { type: "plain", text: Number.isFinite(value) && value >= 0 && !first.startsWith("+") ? `+${first}` : first };
    }
    case "chance": return { type: "plain", text: args[1] || `${first}%` };
    case "scaledice":
    case "scaledamage": return { type: "plain", text: args[args.length - 1] || first };
    case "recharge": {
      const value = first && first !== "6" ? `${first}–6` : "6";
      return { type: "label", key: "recharge", text: `(Recharge ${value})`, value };
    }
    case "h": return { type: "label", key: "hit", text: "Hit:" };
    case "atk": return { type: "label", key: "attack", text: "Attack" };
    // `{@atkr m}` / `r` / `m,r`: the value says melee, ranged or both ("mr").
    case "atkr": return { type: "label", key: "attack", text: "Attack", value: [...new Set(first.replace(/[^mr]/g, ""))].sort().join("") };
    case "actSave": return { type: "label", key: "save", text: `${first} Saving Throw:`, value: first };
    case "actSaveFail": {
      // `{@actSaveFail 1}` / `{@actSaveFail 2}`: the bestiary's First and Second Failure.
      const ordinal = ({ 1: "First ", 2: "Second ", 3: "Third " } as Record<string, string>)[first];
      return ordinal ? { type: "label", key: "saveFailNth", text: `${ordinal}Failure:`, value: first } : { type: "label", key: "saveFail", text: "Failure:" };
    }
    case "actSaveSuccess": return { type: "label", key: "saveSuccess", text: "Success:" };
    case "actTrigger": return { type: "label", key: "trigger", text: "Trigger:" };
    case "actResponse": return { type: "label", key: "response", text: "Response:" };
    case "hitYourSpellAttack": return { type: "label", key: "spellAttack", text: args[0] || "your spell attack modifier", value: args[0] };
    case "actSaveFailBy": return { type: "label", key: "saveFailBy", text: `Failure by ${first} or More:`, value: first };
    case "actSaveSuccessOrFail": return { type: "label", key: "saveSuccessOrFail", text: "Failure or Success:" };
    case "hom": return { type: "label", key: "hitOrMiss", text: "Hit or Miss:" };
    default: return { type: "plain", text: args[1] || first };
  }
}

/** Finds the `}` closing the tag opened at `start` (tags nest: `{@b {@spell Light}}`). */
function closingBrace(input: string, start: number): number {
  let depth = 0;
  for (let index = start; index < input.length; index += 1) {
    if (input.startsWith("{@", index)) {
      depth += 1;
      index += 1;
    } else if (input[index] === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

export function parseTags(input: string): TextToken[] {
  const tokens: TextToken[] = [];
  let cursor = 0;
  while (cursor < input.length) {
    const open = input.indexOf("{@", cursor);
    if (open === -1) {
      tokens.push({ type: "text", text: input.slice(cursor) });
      break;
    }
    if (open > cursor) tokens.push({ type: "text", text: input.slice(cursor, open) });
    const close = closingBrace(input, open);
    if (close === -1) {
      tokens.push({ type: "text", text: input.slice(open) });
      break;
    }
    const body = input.slice(open + 2, close);
    const space = body.search(/\s/);
    const tag = space === -1 ? body : body.slice(0, space);
    const rest = space === -1 ? "" : body.slice(space + 1);
    tokens.push(tagToken(tag, rest));
    cursor = close + 1;
  }
  return mergeText(tokens);
}

function tagToken(tag: string, rest: string): TextToken {
  const style = STYLE_TAGS[tag];
  if (style) return { type: "styled", style, children: parseTags(stripColor(tag, rest)) };
  const args = rest.split("|");
  if (RULE_TAGS.has(tag)) return ruleText(tag, args);
  if (LINK_TAGS.has(tag)) {
    const text = (OWN_TEXT_TAGS.has(tag) ? args[0] ?? "" : displayText(args, tag)).replace(/\s*\[[^\]]*\]$/, "");
    const refs = linkRefs(tag, args);
    return refs.length > 0 ? { type: "link", refs, text } : { type: "plain", text };
  }
  // A filter tag is `text|page|filter…`: its filters are not display text.
  if (tag === "filter") return { type: "plain", text: args[0] ?? "" };
  if (OWN_TEXT_TAGS.has(tag)) return { type: "plain", text: args[0] ?? "" };
  // Out of scope (5etools, link, deity, …) and unknown tags: display text only.
  return { type: "plain", text: displayText(args) };
}

/** `{@color text|hex}` keeps only its text. */
function stripColor(tag: string, rest: string): string {
  return tag === "color" ? rest.split("|")[0] ?? "" : rest;
}

function mergeText(tokens: TextToken[]): TextToken[] {
  const merged: TextToken[] = [];
  for (const token of tokens) {
    const last = merged[merged.length - 1];
    if (token.type === "text" && last?.type === "text") last.text += token.text;
    else if (token.type !== "text" || token.text) merged.push(token);
  }
  return merged;
}

/** Resolves a label token to localized text; the English fallback is the token's own text. */
export type LabelResolver = (key: TagLabel, value: string | undefined) => string | undefined;

/** Plain string of tokens: link and label tokens become their display text. */
export function tokensToText(tokens: TextToken[], label?: LabelResolver): string {
  return tokens
    .map((token) => {
      switch (token.type) {
        case "styled": return tokensToText(token.children, label);
        case "label": return label?.(token.key, token.value) ?? token.text;
        default: return token.text;
      }
    })
    .join("");
}

/** `kind:id` split, or null for anything else. */
export function splitRef(ref: string): { kind: DndKind; id: string } | null {
  const colon = ref.indexOf(":");
  if (colon <= 0) return null;
  const kind = ref.slice(0, colon) as DndKind;
  const id = ref.slice(colon + 1);
  return DND_KINDS.includes(kind) && id ? { kind, id } : null;
}
