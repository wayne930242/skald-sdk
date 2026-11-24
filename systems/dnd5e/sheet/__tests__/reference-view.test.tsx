import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import { zhWithheld } from "../../__tests__/zh-withheld";
import type { LoadedSystem } from "@skald/types/system";
import appEn from "@skald/sheet-sdk/messages/en.json";
import appZh from "@skald/sheet-sdk/messages/zh-TW.json";
import systemEn from "@skald/system-dnd5e/data/dnd5e-2024/messages/en.json";
import systemZh from "@skald/system-dnd5e/data/dnd5e-2024/messages/zh-TW.json";
import { SystemPluginProvider } from "@skald/sheet-sdk/modules/systems/ui/system-plugin-provider";
import type { ValidatedPack } from "../../content-pack/domain/types";
import { singlePackView } from "../../content-pack/domain/effective";
import { mergePacks } from "../../content-pack/domain/merge-packs";
import type { EffectivePacks, PackContent } from "../../content-pack/domain/types";
import { ReferenceDialog, type ReferenceRequest } from "../reference-dialog";
import { useReferenceContext } from "../use-reference-context";

/**
 * Plan T2b §5.1, §5.3, §5.8 and the coordinator's additions, through the real reference context,
 * corpus and lazy labels. Overlay text in these packs is made up; built-in text is SRD.
 */

const system = { config: { id: "dnd5e-2024" }, gameData: { spells: [] } } as unknown as LoadedSystem;

function samplePack(overlays: ValidatedPack["overlays"]): ValidatedPack {
  return {
    manifest: { systemId: "dnd5e-2024", packId: "sample", packVersion: "1", requiresBuiltin: "", payloadSha256: "", counts: {}, notice: "" },
    entries: [],
    zhTW: {},
    wizard: {},
    overlays,
  };
}

function Harness({ request, pack, packs }: { request: ReferenceRequest; pack: ValidatedPack | null; packs?: EffectivePacks | null }) {
  const context = useReferenceContext(system, packs ?? (pack && singlePackView(pack.manifest.packId, pack)), { english: true, reference: true });
  return <ReferenceDialog request={request} context={context} onClose={() => {}} />;
}

async function show(ref: string, { locale = "en", pack = null, packs, request }: { locale?: "en" | "zh-TW"; pack?: ValidatedPack | null; packs?: EffectivePacks; request?: ReferenceRequest } = {}) {
  const messages = locale === "en" ? { ...appEn, ...systemEn } : { ...appZh, ...systemZh };
  await act(async () => {
    render(
      <NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
        <SystemPluginProvider catalog={{ getClientSystemMessages: () => systemEn }}>
          <Harness request={request ?? { mode: "ref", ref }} pack={pack} packs={packs} />
        </SystemPluginProvider>
      </NextIntlClientProvider>,
    );
  });
  return screen.findByRole("dialog");
}

const statBlock = async () => (await screen.findByText((_, node) => node?.hasAttribute("data-stat-block") ?? false)) as HTMLElement;

describe("stat block (§5.1)", () => {
  it("shows Aboleth's 2024 header, abilities and sections", async () => {
    await show("creature:aboleth");
    const block = await statBlock();
    expect(block).toHaveTextContent("Large Aberration, Lawful Evil");
    expect(block).toHaveTextContent("AC 17");
    expect(block).toHaveTextContent("Initiative +7 (17)");
    expect(block).toHaveTextContent("HP 150 (20d10 + 40)");
    expect(block).toHaveTextContent("Speed 10 ft., Swim 40 ft.");
    expect(block).toHaveTextContent("Skills History +12, Perception +10");
    expect(block).toHaveTextContent("Senses Darkvision 120 ft., Passive Perception 20");
    expect(block).toHaveTextContent("CR 10 (XP 5,900, or 7,200 in lair; PB +4)");
    expect(within(block.querySelector("[data-ability='str']") as HTMLElement).getAllByText("+5")).toHaveLength(2);
    expect(within(block.querySelector("[data-ability='int']") as HTMLElement).getByText("+8")).toBeInTheDocument();
    expect([...block.querySelectorAll("[data-stat-section]")].map((node) => node.getAttribute("data-stat-section"))).toEqual(["trait", "action", "legendary"]);
    expect(within(block.querySelector("[data-stat-section='legendary']") as HTMLElement).getByText(/Legendary Action Uses: 3/)).toBeInTheDocument();
    expect(screen.getByText("Creature")).toBeInTheDocument();
  });

  it.skipIf(zhWithheld("messages/reference/zh-TW.json"))("shows Otherworldly Steed's summon lines, in zh with the spell attack label localized", async () => {
    await show("creature:otherworldly-steed", { locale: "zh-TW" });
    const block = await statBlock();
    expect(block).toHaveTextContent("天界生物、精類或邪魔（由你選擇）");
    expect(block).toHaveTextContent("無（經驗值 0；熟練加值 等於你的熟練加值）");
    expect(block).toHaveTextContent("加值等於你的法術攻擊調整值");
    expect(block).not.toHaveTextContent("Bonus equals your spell attack modifier");
    expect(block).toHaveTextContent("近戰攻擊檢定：");
    expect(screen.getByText("生物")).toBeInTheDocument();
  });

  it("notes an SRD erratum under the block (coordinator 3)", async () => {
    await show("creature:archmage");
    await statBlock();
    expect(await screen.findByText(/XP shown as 8,400/)).toBeInTheDocument();
    expect(screen.getByText(/SRD errata, p\. 305/)).toBeInTheDocument();
  });

  it("shows Adult Black Dragon with an XMM overlay, its badge and source, and the toggle back to SRD (§5.8)", async () => {
    const pack = samplePack({
      "creature:adult-black-dragon": {
        source: "XMM",
        en: {
          name: "Sample Bog Dragon",
          entries: [{ type: "entries", name: "Sample Bog Breath", entries: ["A made-up overlay sentence."] }],
          meta: { initiative: 99, section: ["action"] },
          lore: ["A made-up lore sentence."],
        },
      },
    });
    await show("creature:adult-black-dragon", { pack });
    await waitFor(() => expect(screen.getByText("A made-up overlay sentence.")).toBeInTheDocument());
    expect(screen.getByRole("heading", { name: "Sample Bog Dragon" })).toBeInTheDocument();
    expect(screen.getByText("Original text (content pack)")).toBeInTheDocument();
    expect(screen.getByText("Source: 2024 bestiary (XMM)")).toBeInTheDocument();
    expect(await statBlock()).toHaveTextContent("Initiative +99");
    expect(screen.getByText("Lore")).toBeInTheDocument();
    expect(screen.getByText("A made-up lore sentence.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("switch", { name: "Show SRD version" }));
    await waitFor(() => expect(screen.queryByText("A made-up overlay sentence.")).toBeNull());
    expect(await statBlock()).toHaveTextContent("Initiative +12 (22)");
    expect(screen.getAllByRole("button", { name: "Acid Arrow" }).length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "Adult Black Dragon" })).toBeInTheDocument();
    // The overlay's lore is XMM text too (F003).
    expect(screen.queryByText("A made-up lore sentence.")).toBeNull();
  });

  it("finds an entry by its overlay name in the reference search (§4)", async () => {
    const pack = samplePack({ "creature:adult-black-dragon": { source: "XMM", en: { name: "Sample Bog Dragon", entries: [] } } });
    await show("", { pack, request: { mode: "browser", rows: [] } });
    fireEvent.change(await screen.findByRole("textbox", { name: "Search rules" }), { target: { value: "bog dragon" } });
    expect(await screen.findByRole("heading", { name: "Creature (1)" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sample Bog Dragon" }));
    expect(await screen.findByRole("heading", { name: "Sample Bog Dragon" })).toBeInTheDocument();
  });

  it("keeps a pinned entry and its visit on home after following its book link and going back", async () => {
    window.localStorage.clear();
    try {
      await show("", { request: { mode: "browser", rows: [] } });
      fireEvent.change(await screen.findByRole("textbox", { name: "Search rules" }), { target: { value: "aboleth" } });
      fireEvent.click(await screen.findByRole("button", { name: "Aboleth" }));
      fireEvent.click(await screen.findByRole("button", { name: "Pin", pressed: false }));
      expect(screen.getByRole("button", { name: "Pin", pressed: true })).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "View in book" }));
      expect(await screen.findByRole("heading", { name: "Monsters" })).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Back" }));
      expect(await screen.findByRole("heading", { name: "Aboleth" })).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Show only: Creature" }));
      expect(screen.getByRole("button", { name: "Creature", pressed: true })).toBeInTheDocument();
      fireEvent.change(screen.getByRole("textbox", { name: "Search rules" }), { target: { value: "" } });
      fireEvent.click(screen.getByRole("button", { name: "All" }));
      expect(screen.getByRole("heading", { name: "Pinned" })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Recently Viewed" })).toBeInTheDocument();
      expect(screen.getAllByRole("button", { name: "Aboleth" })).toHaveLength(2);
    } finally {
      window.localStorage.clear();
    }
  });

  it("leaves room inside the scroll area for the search input's focus ring (B-011)", async () => {
    await show("", { request: { mode: "browser", rows: [] } });
    const input = await screen.findByRole("textbox", { name: "Search rules" });
    const viewport = input.closest("[data-slot='scroll-area-viewport']")!;
    const inset = input.closest("[data-reference-scroll-content]");
    expect(inset).not.toBeNull();
    expect(viewport.contains(inset)).toBe(true);
    // The ring is 3px wide outside the input; the viewport clips at its edges.
    expect(inset!.className).toMatch(/\bp-1\b/);
  });

  it("shows SRD text only without the pack", async () => {
    await show("creature:adult-black-dragon");
    await statBlock();
    expect(screen.queryByText("Original text (content pack)")).toBeNull();
    expect(screen.queryByRole("switch")).toBeNull();
  });
});

describe("magic item header (§5.3)", () => {
  it("shows a variant's family label and the family text (P7)", async () => {
    await show("item:belt-of-hill-giant-strength");
    expect(await screen.findByText(/While wearing this belt, your Strength changes/)).toBeInTheDocument();
    expect(screen.getByText(/Wondrous Item, Rare \(Requires Attunement\)/)).toBeInTheDocument();
    expect(screen.getByText("Variant of")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Belt of Giant Strength" })).toBeInTheDocument();
  });

  it("keeps the family text under the SRD toggle when an overlay words the variant (coordinator 5)", async () => {
    const pack = samplePack({ "item:belt-of-hill-giant-strength": { source: "XDMG", en: { entries: ["A made-up belt sentence."] } } });
    await show("item:belt-of-hill-giant-strength", { pack });
    expect(await screen.findByText("A made-up belt sentence.")).toBeInTheDocument();
    expect(screen.queryByText(/While wearing this belt/)).toBeNull();
    fireEvent.click(screen.getByRole("switch", { name: "Show SRD version" }));
    expect(await screen.findByText(/While wearing this belt, your Strength changes/)).toBeInTheDocument();
  });

  it("shows the base item detail the SRD header prints (coordinator 4)", async () => {
    await show("item:adamantine-armor");
    expect(await screen.findByText("Armor (Any Medium or Heavy, Except Hide Armor), Uncommon")).toBeInTheDocument();
  });

  it.skipIf(zhWithheld("messages/reference/zh-TW.json"))("localizes an attunement condition that names an item, with no English inside the zh line (F006)", async () => {
    await show("item:dwarven-thrower", { locale: "zh-TW" });
    expect(await screen.findByText(/須由矮人或已與矮人腰帶同調的生物同調/)).toBeInTheDocument();
    expect(screen.queryByText(/by a Dwarf/)).toBeNull();
  });

  it.skipIf(zhWithheld("messages/reference/zh-TW.json", "messages/zh-TW.json"))("localizes the header and the base item detail in zh", async () => {
    await show("item:adamantine-armor", { locale: "zh-TW" });
    expect(await screen.findByText("護甲（任一中甲或重甲，獸皮甲除外），非普通")).toBeInTheDocument();
  });
});

describe("stat block embeds (coordinator 7)", () => {
  it("draws a pack feature's embedded item block instead of its bare name", async () => {
    const pack = samplePack({});
    pack.entries = [
      { ref: "subclassFeature:rogue/sample-path/sample-blades-l3", kind: "subclassFeature", id: "rogue/sample-path/sample-blades-l3", name: "Sample Blades",
        entries: ["You can manifest a blade:", { type: "statblock", tag: "item", source: "XPHB", name: "Sample Blade" }, "After the block."], meta: { level: 3 } },
      { ref: "item:sample-blade", kind: "item", id: "sample-blade", name: "Sample Blade", entries: ["A made-up blade trait."], meta: {} },
    ];
    await show("subclassFeature:rogue/sample-path/sample-blades-l3", { pack });
    expect(await screen.findByText("A made-up blade trait.")).toBeInTheDocument();
    expect(screen.getByText("After the block.")).toBeInTheDocument();
  });
});

describe("Wild Shape (§5.2)", () => {
  it("opens the monster browser preset to beasts of CR 1/4 or lower", async () => {
    await show("classFeature:druid/wild-shape-l2");
    fireEvent.click(await screen.findByRole("button", { name: "Browse beasts for Wild Shape" }));
    await waitFor(() => expect(document.querySelector("[data-compendium-ref='creature:wolf']")).not.toBeNull(), { timeout: 4000 });
    const listed = [...document.querySelectorAll("[data-compendium-ref]")].map((row) => row.getAttribute("data-compendium-ref"));
    expect(listed).toEqual(expect.arrayContaining(["creature:owl", "creature:wolf"]));
    expect(listed).not.toContain("creature:aboleth");
    expect(listed).not.toContain("creature:brown-bear");
    expect(screen.getByRole("heading", { name: "Monsters" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByRole("heading", { name: "Wild Shape" })).toBeInTheDocument();
  });
});

describe("chapters (§5.9)", () => {
  it("embeds a chapter's included sections", async () => {
    await show("chapter:srd/spells");
    expect(await screen.findByText(/Before you can cast a spell, you must have the spell prepared/, undefined, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.getByText("Chapter")).toBeInTheDocument();
  });
});

describe("SRD book refLists (F004, P4)", () => {
  it("lists no pack spell in the SRD Spell Descriptions list while a pack is loaded", async () => {
    const pack: ValidatedPack = {
      ...samplePack({}),
      entries: [{ ref: "spell:sample-glimmer", kind: "spell", id: "sample-glimmer", name: "Sample Glimmer", entries: [], meta: { level: 1 } }] as ValidatedPack["entries"],
    };
    await show("chapter:srd/spells", { pack });
    const list = (await screen.findByText((_, node) => node?.getAttribute("data-ref-list") === "spell", undefined, { timeout: 4000 })) as HTMLElement;
    await waitFor(() => expect(within(list).getByRole("button", { name: "Fireball" })).toBeInTheDocument());
    expect(within(list).queryByRole("button", { name: "Sample Glimmer" })).toBeNull();
  });
});

describe("several enabled packs (B-025)", () => {
  /** Two made-up packs carrying the same spell under different ids. */
  const flare = (id: string, text: string): PackContent => ({
    entries: [{ ref: `spell:${id}`, kind: "spell", id, name: "Sample Flare", entries: [text], meta: { level: 1 } }] as PackContent["entries"],
    zhTW: {},
    wizard: {},
    overlays: {},
  });
  const alpha = flare("sample-flare", "Alpha flare text.");
  const beta = flare("sample-flare-b", "Beta flare text.");

  it("opens a row saved with the losing pack's ref on the winner's entry, and names the winner", async () => {
    const packs = mergePacks([{ key: "sample-alpha", pack: alpha }, { key: "sample-beta", pack: beta }])!;
    await show("spell:sample-flare-b", { packs });
    expect(await screen.findByText("Alpha flare text.")).toBeInTheDocument();
    expect(document.querySelector("[data-slot=dialog-title], h2")?.textContent).toBe("Sample Flare");
    expect(document.querySelector("[data-pack-supplier]")).toHaveTextContent("Pack: sample-alpha");
  });

  it.skipIf(zhWithheld("messages/reference/zh-TW.json"))("follows the order: with the other pack on top, it supplies the entry", async () => {
    const packs = mergePacks([{ key: "sample-beta", pack: beta }, { key: "sample-alpha", pack: alpha }])!;
    await show("spell:sample-flare", { packs, locale: "zh-TW" });
    expect(await screen.findByText("Beta flare text.")).toBeInTheDocument();
    expect(document.querySelector("[data-pack-supplier]")).toHaveTextContent("內容包：sample-beta");
  });
});
