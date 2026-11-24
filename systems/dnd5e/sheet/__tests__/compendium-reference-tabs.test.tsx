import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { zhWithheld } from "../../__tests__/zh-withheld";
import type { LoadedSystem } from "@skald/types/system";
import appZh from "@skald/sheet-sdk/messages/zh-TW.json";
import systemZh from "@skald/system-dnd5e/data/dnd5e-2024/messages/zh-TW.json";
import systemEn from "@skald/system-dnd5e/data/dnd5e-2024/messages/en.json";
import { PackTextIndex } from "../../content-pack/domain/overlay";
import { loadReferenceNames } from "../../reference/load-corpus";
import { createBuiltinSource, createPackSource, createRefResolver, ReferenceSources, type NamesCatalog } from "../../reference/sources";
import type { ValidatedPack } from "../../content-pack/domain/types";
import { sampleDm } from './sample-dm-content';
import { CompendiumDialog } from "../compendium-dialog";
import type { ReferenceContextValue } from "../use-reference-context";

/** Plan T2b §5.2, §5.3, §5.5–§5.7 through the compendium, on the real indexes (made-up pack content). */

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock("../play/edit-messages", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../play/edit-messages")>()),
  loadEditMessages: async () => ({ edit: {}, play: { damageType: {} } }),
}));

let lazyZh: NamesCatalog = {};
let lazyEn: NamesCatalog = {};

beforeAll(async () => {
  [lazyZh, lazyEn] = await Promise.all([loadReferenceNames("zh-TW"), loadReferenceNames("en")]);
  // Radix Select in jsdom.
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.scrollIntoView ??= () => {};
});

const tierA = (systemZh as { ref: Record<string, Record<string, string>> }).ref;
const tierAEnglish = (systemEn as { ref: Record<string, Record<string, string>> }).ref;

const pack: ValidatedPack = {
  manifest: { systemId: "dnd5e-2024", packId: "sample", packVersion: "1", requiresBuiltin: "", payloadSha256: "", counts: {}, notice: "" },
  entries: [...sampleDm.entries, {
    source: "XMM", ref: "creature:sample-marsh-lurker", kind: "creature", id: "sample-marsh-lurker", name: "Sample Marsh Lurker", entries: [],
    meta: { cr: { cr: "1/8", xp: 25 }, type: "beast", size: ["S"] },
  }, {
    ref: "chapter:xphb/sample-introduction", kind: "chapter", id: "xphb/sample-introduction", name: "Sample Introduction",
    entries: ["A made-up chapter sentence."], meta: { bookChapter: 0 },
  }, {
    ref: "chapter:xphb/sample-classes", kind: "chapter", id: "xphb/sample-classes", name: "Sample Classes",
    entries: [{ type: "table", colLabels: ["Level", "Class Features"], rows: [[1, "Sample Alpha"], [2, "Sample Beta"], [3, "Sample Gamma"]] }],
    meta: { bookChapter: 1 },
  }],
  zhTW: { ...sampleDm.zhTW, "creature:sample-marsh-lurker": { name: "範例沼澤潛伏者", entries: [] } },
  wizard: {},
  overlays: {},
};

function contextFor(withPack: boolean): ReferenceContextValue {
  const names: Record<string, Record<string, string>> = { ...lazyZh, ...tierA } as Record<string, Record<string, string>>;
  const englishNames: Record<string, Record<string, string>> = { ...lazyEn, ...tierAEnglish } as Record<string, Record<string, string>>;
  const srdSource = createBuiltinSource(new Map());
  const sources = new ReferenceSources([srdSource, ...(withPack ? [createPackSource(pack.entries, pack.zhTW)] : [])]);
  return {
    sources,
    srdSource,
    locale: "zh-TW",
    names,
    englishNames,
    nameOf: (ref: string) => {
      const [kind, id] = ref.split(":");
      return names[kind]?.[id] ?? englishNames[kind]?.[id] ?? id;
    },
    gameSpells: new Map(),
    packIds: withPack ? [pack.manifest.packId] : [],
    packRefs: new Set(withPack ? pack.entries.map((entry) => entry.ref) : []),
    packSupplier: (ref: string) => (withPack && pack.entries.some((entry) => entry.ref === ref) ? pack.manifest.packId : undefined),
    packText: withPack ? new PackTextIndex(pack, "zh-TW") : null,
    token: (value: unknown) => String(value),
    renderContext: { resolveRef: createRefResolver(names, withPack ? pack.entries : []) },
  } as unknown as ReferenceContextValue;
}

const system = {
  config: { id: "dnd5e-2024" },
  schema: { fields: { equipment: { id: "equipment", type: "list", rowTemplate: { children: [] } }, features: { id: "features", type: "list", rowTemplate: { children: [] } } } },
  gameData: {},
} as unknown as LoadedSystem;

async function open({ withPack = false, level }: { withPack?: boolean; level?: number } = {}) {
  let data: Record<string, unknown> = {};
  const onUpdate = vi.fn((updater: (previous: Record<string, unknown>) => Record<string, unknown>) => {
    data = updater(data);
  });
  await act(async () => {
    render(
      <NextIntlClientProvider locale="zh-TW" messages={{ ...appZh, ...systemZh }} timeZone="UTC">
        <CompendiumDialog open system={system} context={contextFor(withPack)} onClose={() => {}} onUpdate={onUpdate} onPreview={() => {}} characterLevel={level} />
      </NextIntlClientProvider>,
    );
  });
  return { data: () => data };
}

async function tab(name: string) {
  const trigger = await screen.findByRole("tab", { name });
  fireEvent.mouseDown(trigger);
  fireEvent.click(trigger);
}

const listed = () => [...document.querySelectorAll("[data-compendium-ref]")].map((row) => row.getAttribute("data-compendium-ref"));

async function choose(label: string, option: string) {
  fireEvent.click(screen.getByRole("combobox", { name: label }));
  fireEvent.click(await screen.findByRole("option", { name: option }));
}

describe("monster browser (§5.2)", () => {
  it.skipIf(zhWithheld("messages/reference/zh-TW.json"))("filters beasts of CR 1/4 or lower, which include Owl and Wolf", async () => {
    await open();
    await tab("怪物");
    await waitFor(() => expect(listed()).toContain("creature:owl"));
    await choose("挑戰等級上限", "1/4");
    await choose("類型", "野獸");
    expect(listed()).toEqual(expect.arrayContaining(["creature:owl", "creature:wolf"]));
    expect(listed()).not.toContain("creature:aboleth");
  });

  it.skipIf(zhWithheld("messages/reference/zh-TW.json", "corpus/index/zh-TW/creature.json"))("finds a monster by its zh name", async () => {
    await open();
    await tab("怪物");
    fireEvent.change(await screen.findByRole("textbox", { name: "搜尋怪物" }), { target: { value: "貓頭鷹" } });
    await waitFor(() => expect(listed()).toContain("creature:owl"));
    expect(listed()).not.toContain("creature:wolf");
  });

  it.skipIf(zhWithheld("messages/reference/zh-TW.json"))("lists a pack monster with its badge only while the pack is loaded", async () => {
    await open();
    await tab("怪物");
    await waitFor(() => expect(listed()).toContain("creature:owl"));
    expect(listed()).not.toContain("creature:sample-marsh-lurker");
    cleanup();
    await open({ withPack: true });
    await tab("怪物");
    await waitFor(() => expect(listed()).toContain("creature:sample-marsh-lurker"));
    const row = document.querySelector("[data-compendium-ref='creature:sample-marsh-lurker']") as HTMLElement;
    expect(within(row).getByText("範例沼澤潛伏者")).toBeInTheDocument();
    expect(row.querySelector("[data-pack-badge]")).toHaveTextContent(`內容包：${pack.manifest.packId}`);
  });
});

describe("XDMG", () => {
  it.skipIf(zhWithheld("messages/reference/zh-TW.json"))("separates the book from XPHB and resolves a section in the same numbered chapter", async () => {
    await open({ withPack: true });
    await tab("書籍");
    fireEvent.click(await screen.findByRole("button", { name: "《城主指南》（2024）" }));
    expect(screen.queryByRole("button", { name: "Sample Classes" })).toBeNull();
    fireEvent.click(await screen.findByRole("button", { name: "範例大廳" }));
    expect(await screen.findByText("想像中的大廳有三扇藍門。")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "東門" })).toHaveAttribute("data-ref", "chapter:xdmg/sample-hall/east-door");
  });
  it.skipIf(zhWithheld("messages/reference/zh-TW.json", "messages/zh-TW.json"))("filters pack items by rarity and copies their text when added", async () => {
    const { data } = await open({ withPack: true });
    await tab("魔法物品");
    await screen.findByRole("combobox", { name: "稀有度" });
    await choose("來源", "SRD");
    expect(listed()).not.toContain("item:sample-pebble");
    await choose("來源", pack.manifest.packId);
    expect(listed()).toEqual(["item:sample-pebble"]);
    await choose("稀有度", "稀有");
    const row = (await screen.findByText("Sample Pebble")).closest("li")!;
    expect(row).toHaveTextContent(`內容包：${pack.manifest.packId}`);
    fireEvent.click(within(row).getByRole("button", { name: "加入" }));
    expect(data().equipment).toEqual([expect.objectContaining({ ref: "item:sample-pebble", origin: "pack", text: "A pebble that hums." })]);
  });
});

describe("magic item tab (§5.3)", () => {
  it.skipIf(zhWithheld("messages/reference/zh-TW.json", "messages/zh-TW.json", "corpus/index/zh-TW/item-magic.json"))("lists Belt of Hill Giant Strength under rare + attunement, and adds it as an equipment row with its ref and name only", async () => {
    const { data } = await open();
    await tab("魔法物品");
    await screen.findByText((_, node) => node?.hasAttribute("data-magic-item-tab") ?? false);
    await waitFor(() => expect(listed().length).toBeGreaterThan(100));
    await choose("來源", "SRD");
    await choose("稀有度", "稀有");
    await choose("同調", "需要同調");
    expect(listed()).toContain("item:belt-of-hill-giant-strength");
    expect(listed()).not.toContain("item:adamantine-armor");
    const row = document.querySelector("[data-compendium-ref='item:belt-of-hill-giant-strength']") as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: "加入" }));
    expect(data().equipment).toEqual([expect.objectContaining({ ref: "item:belt-of-hill-giant-strength", name: "山丘巨人力量腰帶", origin: "srd", text: "" })]);
  });
});

describe("compendium F012, F014", () => {
  it.skipIf(zhWithheld("messages/reference/zh-TW.json", "messages/zh-TW.json"))("badges feature rows with their class and level (F012)", async () => {
    await open();
    await tab("特性");
    fireEvent.change(screen.getByRole("textbox", { name: "依名稱搜尋" }), { target: { value: "屬性值提升" } });
    const row = (await screen.findByText((_, node) => node?.getAttribute("data-compendium-ref") === "classFeature:fighter/ability-score-improvement-l4")) as HTMLElement;
    expect(within(row).getByText("戰士")).toBeInTheDocument();
    expect(within(row).getByText("4 級")).toBeInTheDocument();
  });

  it.skipIf(zhWithheld("messages/zh-TW.json"))("hides single ammunition units that the bundle lists (F014), and no magic item in the equipment tab", async () => {
    await open();
    await tab("裝備");
    await waitFor(() => expect(listed()).toContain("baseItem:arrows-20"));
    expect(listed()).not.toContain("baseItem:arrow");
    expect(listed()).not.toContain("item:iron-spike");
    expect(listed()).toContain("item:iron-spikes");
  });
});

describe("book reader (§5.5)", () => {
  it.skipIf(zhWithheld("messages/reference/zh-TW.json", "messages/zh-TW.json", "corpus/index/zh-TW/item-magic.json", "corpus/zh-TW/chapter-spells.json"))("reads the SRD book: its contents, a chapter's included sections, and the spell and magic item refLists", async () => {
    await open();
    await tab("書籍");
    expect(await screen.findByRole("button", { name: "SRD 5.2.1" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "《玩家手冊》（2024）" })).toBeNull();
    fireEvent.click(await screen.findByRole("button", { name: "法術" }));
    expect(await screen.findByText(/施展法術前，你必須已在心中準備好該法術/, undefined, { timeout: 4000 })).toBeInTheDocument();
    const spells = (await screen.findByText((_, node) => node?.getAttribute("data-ref-list") === "spell", undefined, { timeout: 4000 })) as HTMLElement;
    expect(within(spells).getByRole("button", { name: "火球術" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "目錄" }));
    fireEvent.click(await screen.findByRole("button", { name: "魔法物品" }));
    const items = (await screen.findByText((_, node) => node?.getAttribute("data-ref-list") === "item", undefined, { timeout: 4000 })) as HTMLElement;
    await waitFor(() => expect(within(items).getByRole("button", { name: "巨人力量腰帶" })).toBeInTheDocument());
    // Variants list under their family (filter family: null).
    expect(within(items).queryByRole("button", { name: "山丘巨人力量腰帶" })).toBeNull();
  });

  it.skipIf(zhWithheld("messages/reference/zh-TW.json"))("filters sections across the book", async () => {
    await open();
    await tab("書籍");
    fireEvent.change(await screen.findByRole("textbox", { name: "篩選章節" }), { target: { value: "法術說明" } });
    expect(await screen.findByRole("button", { name: "法術說明" })).toBeInTheDocument();
  });

  it.skipIf(zhWithheld("messages/reference/zh-TW.json"))("puts the pack's Player's Handbook beside the SRD book", async () => {
    await open({ withPack: true });
    await tab("書籍");
    fireEvent.click(await screen.findByRole("button", { name: "《玩家手冊》（2024）" }));
    fireEvent.click(await screen.findByRole("button", { name: "Sample Introduction" }));
    expect(await screen.findByText("A made-up chapter sentence.")).toBeInTheDocument();
  });
});

describe("book reader level highlight (T2b-F F005)", () => {
  it.skipIf(zhWithheld("messages/reference/zh-TW.json"))("highlights the character's level in a progression table the compendium's reader shows", async () => {
    await open({ withPack: true, level: 2 });
    await tab("書籍");
    fireEvent.click(await screen.findByRole("button", { name: "《玩家手冊》（2024）" }));
    fireEvent.click(await screen.findByRole("button", { name: "Sample Classes" }));
    expect(await screen.findByText("Sample Beta")).toBeInTheDocument();
    expect(document.querySelector("tr[data-highlight]")).toHaveTextContent("Sample Beta");
  });
});

describe("state across a preview (T2bF-R-F002)", () => {
  it.skipIf(zhWithheld("messages/reference/zh-TW.json"))("keeps the monster search and the reader's chapter while a preview closes and reopens the compendium", async () => {
    const tree = (isOpen: boolean) => (
      <NextIntlClientProvider locale="zh-TW" messages={{ ...appZh, ...systemZh }} timeZone="UTC">
        <CompendiumDialog open={isOpen} system={system} context={contextFor(true)} onClose={() => {}} onUpdate={null} onPreview={() => {}} />
      </NextIntlClientProvider>
    );
    let view!: ReturnType<typeof render>;
    await act(async () => {
      view = render(tree(true));
    });
    await tab("怪物");
    fireEvent.change(await screen.findByRole("textbox", { name: "搜尋怪物" }), { target: { value: "貓頭鷹" } });
    await tab("書籍");
    fireEvent.click(await screen.findByRole("button", { name: "《玩家手冊》（2024）" }));
    fireEvent.click(await screen.findByRole("button", { name: "Sample Introduction" }));
    expect(await screen.findByText("A made-up chapter sentence.")).toBeInTheDocument();
    // A preview closes the compendium; Back reopens it.
    await act(async () => view.rerender(tree(false)));
    expect(screen.queryByText("A made-up chapter sentence.")).toBeNull();
    await act(async () => view.rerender(tree(true)));
    expect(await screen.findByText("A made-up chapter sentence.")).toBeInTheDocument();
    await tab("怪物");
    expect(await screen.findByRole("textbox", { name: "搜尋怪物" })).toHaveValue("貓頭鷹");
  });
});
