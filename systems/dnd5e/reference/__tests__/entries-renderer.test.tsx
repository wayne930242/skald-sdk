import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { EntriesRenderer, type EntriesRenderContext } from "../entries-renderer";
import { entriesToText } from "../entries-to-text";
import { createRefResolver, overlayBlocks } from "../sources";
import { linkRefs, parseTags, slugId } from "../tags";

/** Design §1.6 / §3.6: every entry type and tag class the corpus and the pack carry. */

const names = {
  spell: { fireball: "Fireball", light: "Light" },
  condition: { prone: "Prone" },
  rule: { "bonus-action": "Bonus Action" },
  classFeature: { "druid/potent-spellcasting-l7": "Potent Spellcasting" },
  subclassFeature: { "druid/circle-of-the-land/circle-of-the-land-spells-l3": "Circle of the Land Spells" },
  optionalFeature: { "careful-spell": "Careful Spell" },
  itemProperty: { versatile: "Versatile" },
};

function context(onOpenRef = vi.fn()): EntriesRenderContext & { onOpenRef: ReturnType<typeof vi.fn> } {
  return { resolveRef: createRefResolver(names), onOpenRef };
}

/** One sample per entry type: the built-in and pack inventories plus the §1.6 list. */
const SAMPLES: Record<string, unknown> = {
  entries: { type: "entries", name: "Entries Name", entries: ["Entries body."] },
  section: { type: "section", name: "Section Name", entries: ["Section body."] },
  list: { type: "list", style: "list-hang-notitle", items: [{ type: "item", name: "Ability:", entries: ["Wisdom"] }, "Plain list item"] },
  item: { type: "item", name: "Item Name", entry: "Item body." },
  itemSub: { type: "itemSub", name: "Sub Name", entries: ["Sub body."] },
  table: { type: "table", caption: "Trinkets", colLabels: ["{@dice 1d100}", "Trinket"], rows: [["01", "A mummified goblin hand"], [{ type: "cell", roll: { min: 2, max: 3 } }, "A crystal"]] },
  inset: { type: "inset", name: "Inset Name", entries: ["Inset body."] },
  insetReadaloud: { type: "insetReadaloud", entries: ["Read-aloud body."] },
  quote: { type: "quote", entries: ["Quoted body."], by: "Someone" },
  options: { type: "options", count: 1, entries: [{ type: "refOptionalfeature", optionalfeature: "Careful Spell|XPHB" }] },
  refClassFeature: { type: "refClassFeature", classFeature: "Potent Spellcasting|Druid|XPHB|7" },
  refSubclassFeature: { type: "refSubclassFeature", subclassFeature: "Circle of the Land Spells|Druid|XPHB|Land|XPHB|3" },
  refOptionalfeature: { type: "refOptionalfeature", optionalfeature: "Careful Spell|XPHB" },
  abilityDc: { type: "abilityDc", name: "Spell", attributes: ["int"] },
  abilityAttackMod: { type: "abilityAttackMod", name: "Spell", attributes: ["int"] },
  inline: { type: "inline", entries: ["Inline ", "body."] },
  inlineBlock: { type: "inlineBlock", entries: ["Inline block body."] },
  statblock: { type: "statblock", tag: "creature", name: "Steel Defender" },
  image: { type: "image", href: { type: "internal", path: "x.webp" } },
  // SRD chapter embeds (design T2b §2.5); the reader that expands them is task F's.
  include: { type: "include", ref: "rule:bonus-action" },
  refList: { type: "refList", kind: "item", filter: { magic: true } },
};

const EXPECTED_TEXT: Record<string, RegExp | null> = {
  entries: /Entries Name.*Entries body\./,
  section: /Section Name.*Section body\./,
  list: /Ability:.*Wisdom.*Plain list item/,
  item: /Item Name\..*Item body\./,
  itemSub: /Sub Name\..*Sub body\./,
  table: /Trinkets.*1d100.*Trinket.*A mummified goblin hand.*2–3.*A crystal/,
  inset: /Inset Name.*Inset body\./,
  insetReadaloud: /Read-aloud body\./,
  quote: /Quoted body\..*— Someone/,
  options: /Careful Spell/,
  refClassFeature: /Potent Spellcasting/,
  refSubclassFeature: /Circle of the Land Spells/,
  refOptionalfeature: /Careful Spell/,
  abilityDc: /Spell save DC = 8 \+ your Proficiency Bonus \+ your int modifier/,
  abilityAttackMod: /Spell attack modifier = your Proficiency Bonus \+ your int modifier/,
  inline: /Inline body\./,
  inlineBlock: /Inline block body\./,
  statblock: /Steel Defender/,
  image: null,
  include: null,
  refList: null,
};

function corpusFiles(): string[] {
  // The package root runs the tests: apps/web here, systems/dnd5e in the public tree.
  const dir = join(process.cwd(), "data", "dnd5e-2024", "corpus", "en");
  return readdirSync(dir).map((file) => join(dir, file));
}

function walk(value: unknown, visit: (node: Record<string, unknown>) => void) {
  if (Array.isArray(value)) value.forEach((item) => walk(item, visit));
  else if (value && typeof value === "object") {
    visit(value as Record<string, unknown>);
    Object.values(value).forEach((item) => walk(item, visit));
  }
}

describe("entries renderer", () => {
  it.each(Object.keys(SAMPLES))("renders the %s entry type", (type) => {
    const { container } = render(<EntriesRenderer entries={[SAMPLES[type]]} context={context()} />);
    const expected = EXPECTED_TEXT[type];
    if (expected === null) {
      expect(container.textContent).toBe("");
      expect(container.querySelector("img")).toBeNull();
    } else {
      expect(container.textContent?.replace(/\s+/g, " ")).toMatch(expected);
    }
    expect(entriesToText([SAMPLES[type]]).replace(/\s+/g, " ")).toMatch(expected ?? /^$/);
  });

  it("covers every entry type in the built-in corpus", () => {
    const types = new Set<string>();
    for (const file of corpusFiles()) {
      const corpus = JSON.parse(readFileSync(file, "utf8")) as Record<string, { entries: unknown; meta?: { entriesHigherLevel?: unknown } }>;
      for (const entry of Object.values(corpus)) {
        walk([entry.entries, entry.meta?.entriesHigherLevel], (node) => {
          // Table cells carry `type: "cell"`, images `href.type`; neither is an entry type.
          if (typeof node.type === "string" && !["cell", "internal", "external"].includes(node.type)) types.add(node.type);
        });
      }
    }
    expect(types.size).toBeGreaterThan(5);
    for (const type of types) expect(Object.keys(SAMPLES), type).toContain(type);
  });

  it("renders formatting and inline rules tags as text, never as HTML", () => {
    const { container } = render(
      <EntriesRenderer
        entries={["{@b Bold} {@i it} DC {@dc 15}, {@hit 5} to hit, {@chance 50} chance, {@damage 2d6} and {@scaledamage 8d6|3-9|1d6}. <img src=x onerror=alert(1)>"]}
        context={context()}
      />,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector(".font-semibold")?.textContent).toBe("Bold");
    expect(container.textContent).toBe("Bold it DC DC 15, +5 to hit, 50% chance, 2d6 and 1d6. <img src=x onerror=alert(1)>");
  });

  it("links in-scope tags that resolve and leaves the rest as display text", () => {
    const onOpenRef = vi.fn();
    render(
      <EntriesRenderer
        entries={["Cast {@spell Fireball|XPHB}, fall {@condition Prone|XPHB}, use a {@variantrule Bonus Action|XPHB|bonus action}; {@spell Wish|XPHB} is not built in; {@creature Zombie|XMM} and {@sense Darkvision|XPHB} stay text; {@itemProperty V|XPHB|Versatile}."]}
        context={context(onOpenRef)}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Fireball" }));
    expect(onOpenRef).toHaveBeenCalledWith("spell:fireball");
    expect(screen.getByRole("button", { name: "bonus action" }).dataset.ref).toBe("rule:bonus-action");
    expect(screen.getByRole("button", { name: "Versatile" }).dataset.ref).toBe("itemProperty:versatile");
    expect(screen.getByRole("button", { name: "Prone" })).toBeTruthy();
    for (const text of ["Wish", "Zombie", "Darkvision"]) expect(screen.queryByRole("button", { name: text })).toBeNull();
  });

  it("resolves feature references, including subclass features by their feature part", () => {
    const onOpenRef = vi.fn();
    render(<EntriesRenderer entries={[SAMPLES.refClassFeature, SAMPLES.refSubclassFeature]} context={context(onOpenRef)} />);
    fireEvent.click(screen.getByRole("button", { name: "Circle of the Land Spells" }));
    expect(onOpenRef).toHaveBeenCalledWith("subclassFeature:druid/circle-of-the-land/circle-of-the-land-spells-l3");
    fireEvent.click(screen.getByRole("button", { name: "Potent Spellcasting" }));
    expect(onOpenRef).toHaveBeenCalledWith("classFeature:druid/potent-spellcasting-l7");
  });

  it("shows a feature tag's display text from its own position, and table footnotes", () => {
    const onOpenRef = vi.fn();
    const table = { type: "table", colLabels: ["Language"], rows: [["Primordial*"]], footnotes: ["*Primordial includes four dialects."] };
    render(<EntriesRenderer entries={["{@classFeature Rage|Barbarian||1||狂暴} {@subclassFeature Frenzy|Barbarian||Berserker||3||狂亂}", table]} context={context(onOpenRef)} />);
    expect(screen.getByText(/狂暴/)).toBeTruthy();
    expect(screen.getByText(/狂亂/)).toBeTruthy();
    expect(linkRefs("classFeature", ["Rage", "Barbarian", "", "1", "", "狂暴"])).toEqual(["classFeature:barbarian/rage-l1"]);
    expect(screen.queryByText("Barbarian")).toBeNull();
    expect(screen.getByText("*Primordial includes four dialects.")).toBeTruthy();
    expect(entriesToText([table])).toContain("*Primordial includes four dialects.");
  });

  it("knows how to read every tag in the built-in corpus", () => {
    const known = new Set([
      "b", "bold", "i", "italic", "u", "s", "note", "tip", "color", "highlight", "sup", "sub", "code",
      "dice", "damage", "d20", "hit", "dc", "chance", "scaledice", "scaledamage", "recharge", "h", "atk", "atkr",
      "actSave", "actSaveFail", "actSaveSuccess", "actTrigger", "actResponse", "actSaveFailBy", "actSaveSuccessOrFail", "hom",
      "hitYourSpellAttack", "spell", "item", "condition", "status", "feat", "background", "race", "class", "classFeature", "subclassFeature",
      "optfeature", "language", "skill", "sense", "action", "variantrule", "itemProperty", "itemMastery",
      "creature", "book", "adventure", "quickref", "table", "filter", "card", "deck", "hazard", "trap", "vehicle",
      "vehupgrade", "deity", "disease", "5etools", "link", "area",
    ]);
    const seen = new Set<string>();
    for (const file of corpusFiles()) {
      for (const match of readFileSync(file, "utf8").matchAll(/\{@(\w+)/g)) seen.add(match[1]);
    }
    for (const tag of seen) expect(known, tag).toContain(tag);
  });
});

describe("tags and text", () => {
  it("slugs names the way the pipeline assigns ids", () => {
    expect(slugId("Alchemist's Supplies")).toBe("alchemists-supplies");
    expect(slugId("Arrows (20)")).toBe("arrows-20");
    expect(linkRefs("classFeature", ["Second Wind", "Fighter", "XPHB", "1"])).toEqual(["classFeature:fighter/second-wind-l1"]);
  });

  it("shows a filter tag's own text, not its filter arguments", () => {
    expect(parseTags("a different {@filter cantrip from the Wizard spell list|spells|level=0|class=Wizard}.")).toEqual([
      { type: "text", text: "a different " },
      { type: "plain", text: "cantrip from the Wizard spell list" },
      { type: "text", text: "." },
    ]);
  });

  it("keeps nested tags", () => {
    expect(parseTags("{@b {@spell Light|XPHB}}")).toEqual([
      { type: "styled", style: "bold", children: [{ type: "link", refs: ["spell:light"], text: "Light" }] },
    ]);
  });

  it("makes a plain-text snapshot capped at 8,000 characters", () => {
    const text = entriesToText(["Cast {@spell Fireball|XPHB}.", { type: "list", items: ["one", "two"] }]);
    expect(text).toBe("Cast Fireball.\n• one\n• two");
    expect(entriesToText(["x".repeat(9000)]).length).toBe(8000);
  });

  it("adds no period after a name that ends in its own mark, fullwidth included (B-001)", () => {
    const list = {
      type: "list",
      style: "list-hang-notitle",
      items: [
        { type: "item", name: "屬性值：", entry: "力量、敏捷、智力" },
        { type: "item", name: "為何？", entry: "因為。" },
        { type: "item", name: "Feat:", entry: "Alert" },
        { type: "item", name: "Darkvision", entry: "You see." },
      ],
    };
    expect(entriesToText([list])).toBe("• 屬性值：力量、敏捷、智力\n• 為何？因為。\n• Feat: Alert\n• Darkvision. You see.");
    const { container } = render(<EntriesRenderer entries={[list]} context={context()} />);
    expect([...container.querySelectorAll("li")].map((node) => node.textContent)).toEqual([
      "屬性值：力量、敏捷、智力",
      "為何？因為。",
      "Feat: Alert",
      "Darkvision. You see.",
    ]);
  });

  it("ends a zh inline head with a fullwidth colon and no space; a Latin head keeps its period (B-001)", () => {
    const entries = [
      { type: "entries", name: "戲法", entries: ["自選三道法師戲法。"] },
      { type: "entries", name: "燃燒【危害】", entries: ["你受到火焰傷害。"] },
      { type: "entries", name: "魔法物品 A–Z", entries: ["依字母排列。"] },
      { type: "entries", name: "{@filter 異怪|bestiary|type=aberration}", entries: ["見怪物。"] },
      { type: "entries", name: "Wizard spells from the Arcane list", entries: ["Choose two."] },
      { type: "entries", name: "Cantrips", entries: ["Choose three."] },
    ];
    expect(entriesToText(entries)).toBe(
      "戲法：自選三道法師戲法。\n燃燒【危害】：你受到火焰傷害。\n魔法物品 A–Z：依字母排列。\n異怪：見怪物。\nWizard spells from the Arcane list. Choose two.\nCantrips. Choose three.",
    );
    // the renderer sets an entries name as a heading; a list item's name runs inline
    const list = {
      type: "list",
      style: "list-hang-notitle",
      items: [
        { type: "item", name: "戲法", entry: "自選三道法師戲法。" },
        { type: "item", name: "燃燒【危害】", entry: "你受到火焰傷害。" },
        { type: "item", name: "Cantrips", entry: "Choose three." },
      ],
    };
    const { container } = render(<EntriesRenderer entries={[list]} context={context()} />);
    expect([...container.querySelectorAll("li")].map((node) => node.textContent)).toEqual([
      "戲法：自選三道法師戲法。",
      "燃燒【危害】：你受到火焰傷害。",
      "Cantrips. Choose three.",
    ]);
  });

  it("overlays zh-TW blocks by index and badges the untranslated ones", () => {
    expect(overlayBlocks(["a", "b", "c"], ["甲", null], "zh-TW")).toEqual([
      { block: "甲", english: false },
      { block: "b", english: true },
      { block: "c", english: true },
    ]);
    expect(overlayBlocks(["a"], undefined, "en")).toEqual([{ block: "a", english: false }]);
  });

  it("embeds included entries, refList indexes and stat block embeds through the context (plan T2b §5.9, coordinator 7)", () => {
    const renderInclude = vi.fn((ref: string) => <span data-testid="included">{ref}</span>);
    const renderRefList = vi.fn((node: Record<string, unknown>) => <span data-testid="ref-list">{String(node.kind)}</span>);
    const resolveRef = createRefResolver({ item: { "sample-blade": "Sample Blade" }, rule: { burning: "Burning" } });
    render(
      <EntriesRenderer
        entries={[
          { type: "include", ref: "rule:burning" },
          { type: "refList", kind: "creature", filter: { srdChapter: "animals" } },
          { type: "statblock", tag: "item", source: "XPHB", name: "Sample Blade" },
          { type: "statblock", tag: "item", source: "XPHB", name: "Missing Blade" },
        ]}
        context={{ resolveRef, renderInclude, renderRefList }}
      />,
    );
    expect(screen.getAllByTestId("included").map((node) => node.textContent)).toEqual(["rule:burning", "item:sample-blade"]);
    expect(screen.getByTestId("ref-list")).toHaveTextContent("creature");
    // An embed whose entry is not loaded keeps its name.
    expect(screen.getByText("Missing Blade")).toBeInTheDocument();
  });

  it("draws a progression table with column groups, a sticky Level column and the character's level highlighted (§5.4)", () => {
    const table = {
      type: "table", caption: "Sample Features",
      colGroups: [{ entry: "Spell Slots per Spell Level", span: 2, start: 2 }],
      colLabels: ["Level", "Class Features", "1", "2"],
      rows: [[1, "Alpha", 2, "—"], [2, "Beta", 3, "—"], [3, "Gamma", 4, 2]],
    };
    render(<EntriesRenderer entries={[table]} context={{ resolveRef: () => null, highlightLevel: 2 }} />);
    const group = screen.getByText("Spell Slots per Spell Level");
    expect(group.closest("th")).toHaveAttribute("colspan", "2");
    const highlighted = document.querySelector("tr[data-highlight]");
    expect(highlighted).toHaveTextContent("Beta");
    expect(document.querySelectorAll("tr[data-highlight]")).toHaveLength(1);
    expect(screen.getByText("Gamma").closest("tr")?.querySelector("td")?.className).toContain("sticky");
  });

  it("detects a progression table by its rows, so a zh-TW 「等級」 table gets the sticky column and the highlight (§5.4)", () => {
    const table = { type: "table", colLabels: ["等級", "職業特性"], rows: [[1, "甲"], [2, "乙"], [3, "丙"]] };
    render(<EntriesRenderer entries={[table]} context={{ resolveRef: () => null, highlightLevel: 3 }} />);
    expect(document.querySelector("tr[data-highlight]")).toHaveTextContent("丙");
    expect(screen.getByText("甲").closest("tr")?.querySelector("td")?.className).toContain("sticky");
  });

  it("does not treat a numbered table that skips levels as a progression table", () => {
    const table = { type: "table", colLabels: ["Level", "Note"], rows: [[1, "a"], [3, "b"]] };
    render(<EntriesRenderer entries={[table]} context={{ resolveRef: () => null, highlightLevel: 3 }} />);
    expect(document.querySelector("tr[data-highlight]")).toBeNull();
  });
});

