import type { ReactNode } from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { zhWithheld } from "../../__tests__/zh-withheld";
import zhTW from "@skald/sheet-sdk/messages/zh-TW.json";
import type { LoadedSystem } from "@skald/types/system";
import { SystemPluginProvider } from "@skald/sheet-sdk/modules/systems/ui/system-plugin-provider";
import type { ValidatedPack } from "../../content-pack/domain/types";
import { singlePackView } from "../../content-pack/domain/effective";
import { loadRowText } from "../play/row-text";
import { parseTags } from "../../reference/tags";
import { useReferenceContext } from "../use-reference-context";

/** The lazy names (plan T2b §5.10) and pack overlays (§4) through the shared reference context. */

const system = { config: { id: "dnd5e-2024" }, gameData: { spells: [{ id: "wish", level: 9 }] } } as unknown as LoadedSystem;

const pack: ValidatedPack = {
  manifest: { systemId: "dnd5e-2024", packId: "sample", packVersion: "1", requiresBuiltin: "", payloadSha256: "", counts: {}, notice: "" },
  entries: [
    { ref: "chapter:xphb/sample-topic", kind: "chapter", id: "xphb/sample-topic", name: "Sample Topic", entries: [], meta: { bookChapter: 2 } },
    { ref: "chapter:xphb/sample-topic/custom-id", kind: "chapter", id: "xphb/sample-topic/custom-id", name: "Sample Section", entries: [], meta: { bookChapter: 2, bookSection: "Sample Section" } },
    { ref: "chapter:xphb/sample-appendix", kind: "chapter", id: "xphb/sample-appendix", name: "Sample Appendix", entries: [], meta: { bookChapter: 12 } },
  ],
  zhTW: {},
  wizard: {},
  overlays: {
    "spell:wish": { source: "XPHB", en: { entries: ["Sample overlay wording."] } },
    "creature:owl": { source: "XMM", en: { meta: { passive: 13 } } },
  },
};

function setup(options: { reference?: boolean; english?: boolean }, withPack: ValidatedPack | null = null) {
  const read = vi.fn((_slug: string, _locale: string) => ({ ref: { spell: { wish: "Wish" } } }));
  const wrapper = ({ children }: { children: ReactNode }) => (
    <NextIntlClientProvider locale="zh-TW" messages={{ ...zhTW, ref: { spell: { wish: "祈願術" } } }} timeZone="UTC">
      <SystemPluginProvider catalog={{ getClientSystemMessages: read }}>{children}</SystemPluginProvider>
    </NextIntlClientProvider>
  );
  return renderHook(() => useReferenceContext(system, withPack && singlePackView(withPack.manifest.packId, withPack), options), { wrapper });
}

describe("useReferenceContext lazy names", () => {
  it("resolves book links by chapter and section metadata", () => {
    const { resolveRef } = setup({ reference: true }, pack).result.current;
    const resolveBook = (tag: string) => {
      const [token] = parseTags(tag);
      return token.type === "link" ? token.refs.map(resolveRef).find(Boolean) : null;
    };
    expect(resolveBook("{@book Sample|XPHB|2|Sample Section}")).toBe("chapter:xphb/sample-topic/custom-id");
    expect(resolveBook("{@book Sample|XPHB|2|Missing}")).toBe("chapter:xphb/sample-topic");
    expect(resolveBook("{@book Sample|XPHB|12}")).toBe("chapter:xphb/sample-appendix");
  });

  it("keeps row text SRD even when a reference view can read the overlay", async () => {
    const row = { ref: "spell:wish" };
    const withPack = setup({ reference: true }, pack).result.current;
    const without = setup({ reference: true }).result.current;
    expect(await withPack.sources.resolve(row.ref, "en")).toMatchObject({ textSource: "xphb" });
    const body = await loadRowText(withPack, row, {});
    expect(body).toBeTruthy();
    expect(body).not.toContain("Sample overlay wording");
    expect(await loadRowText(without, row, {})).toBe(body);
  });

  it("stays on tier A until a reference view asks for the lazy names", () => {
    const { result } = setup({});
    expect(result.current.resolveRef("creature:owl")).toBeNull();
    expect(result.current.resolveRef("spell:wish")).toBe("spell:wish");
  });

  it.skipIf(zhWithheld("corpus/index/zh-TW/creature.json"))("loads the creature, magic item, table and chapter names in both locales, and links to them resolve", async () => {
    const { result } = setup({ reference: true, english: true });
    await waitFor(() => expect(result.current.resolveRef("creature:owl")).toBe("creature:owl"));
    const context = result.current;
    expect(context.nameOf("creature:owl")).not.toBe("owl");
    expect(context.nameOf("creature:owl")).toMatch(/\p{Script=Han}/u);
    expect(context.englishNames.creature?.owl).toBe("Owl");
    expect(context.englishNames.item?.["bag-of-holding"]).toBe("Bag of Holding");
    expect(context.resolveRef("table:skills")).toBe("table:skills");
    expect(context.resolveRef("chapter:srd/playing-the-game")).toBe("chapter:srd/playing-the-game");
    // Tier A names win over nothing: the own catalog is kept.
    expect(context.nameOf("spell:wish")).toBe("祈願術");
  });

  it("shows a loaded pack's overlay through the sources, and the SRD text without the pack", async () => {
    const withOverlay = setup({ reference: true }, pack).result.current;
    expect(await withOverlay.sources.resolve("creature:owl", "zh-TW")).toMatchObject({ textSource: "xmm", meta: { passive: 13 }, srdMeta: { passive: 15 } });
    const without = setup({ reference: true }).result.current;
    const srd = await without.sources.resolve("creature:owl", "zh-TW");
    expect(srd).toMatchObject({ meta: { passive: 15 } });
    expect(srd?.textSource).toBeUndefined();
  });
});
