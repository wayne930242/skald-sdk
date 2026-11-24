import { useState, type ReactNode } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi, beforeAll } from "vitest";
import { zhWithheld } from "../../../__tests__/zh-withheld";
import type { Schema, Template } from "@skald/types/schema";
import type { LoadedSystem } from "@skald/types/system";
import appZh from "@skald/sheet-sdk/messages/zh-TW.json";
import systemZh from "@skald/system-dnd5e/data/dnd5e-2024/messages/zh-TW.json";
import schemaJson from "@skald/system-dnd5e/data/dnd5e-2024/schema.json";
import templateJson from "@skald/system-dnd5e/data/dnd5e-2024/template.json";
import spells from "@skald/system-dnd5e/data/dnd5e-2024/game/spells.json";
import { TemplateRenderer } from "@skald/sheet-sdk/modules/character/ui/renderer/template-renderer";
import { SystemPluginProvider } from "@skald/sheet-sdk/modules/systems/ui/system-plugin-provider";
import { useReferenceContext } from "../../use-reference-context";
import { DndPlayView } from "../play-view";
import { preloadPlayTabs } from "../lazy-tabs";
import { loadEditMessages } from "../edit-messages";

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

// The combat tab must not fetch a spell part of the corpus for a cantrip's dice (first-load budget).
const corpusParts = vi.hoisted(() => [] as string[]);
vi.mock("../../../reference/load-corpus", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../reference/load-corpus")>();
  return {
    ...actual,
    loadEnglishCorpus: (part: string) => {
      corpusParts.push(part);
      return actual.loadEnglishCorpus(part);
    },
  };
});

const byId = (id: string) => (spells as Array<Record<string, unknown>>).find((spell) => spell.id === id);

// The tabs past 角色 load when they open; load them ahead so a test reads them at once.
// The tabs' edit labels (plan-uat2 §3.2) load with them: load both ahead too.
beforeAll(() => Promise.all([preloadPlayTabs(), loadEditMessages("zh-TW"), loadEditMessages("en")]));

describe("spell roll facts in game data", () => {
  it("game/spells.json carries a spell's damage dice and spell attack", () => {
    expect(byId("fire-bolt")).toMatchObject({ damageDice: "1d10", spellAttack: true });
    expect(byId("sacred-flame")).toMatchObject({ damageDice: "1d8" });
    expect(byId("sacred-flame")).not.toHaveProperty("spellAttack");
    expect(byId("light")).not.toHaveProperty("damageDice");
  });
});

const schema = schemaJson as unknown as Schema;
const template = templateJson as unknown as Template;
const system = {
  config: { id: "dnd5e-2024", sheetComponent: "dnd5e" },
  schema,
  template,
  defaultData: {},
  mappings: {},
  gameData: { spells },
} as unknown as LoadedSystem;

function Sheet({ initial }: { initial: Record<string, unknown> }) {
  const [data, setData] = useState(initial);
  const reference = useReferenceContext(system);
  return (
    <TemplateRenderer
      template={template}
      schema={schema}
      data={data}
      viewMode="web"
      mode="play"
      editable
      onChange={(path, value) => setData((previous) => ({ ...previous, [path]: value }))}
      setData={setData}
      playView={<DndPlayView system={system} reference={reference} openReference={() => {}} openCompendium={null} />}
    />
  );
}

beforeEach(() => {
  corpusParts.length = 0;
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    () => ({ width: 1440, height: 800, top: 0, left: 0, right: 1440, bottom: 800, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect,
  );
});
afterEach(() => vi.restoreAllMocks());

describe("combat tab cantrips", () => {
  it.skipIf(zhWithheld("messages/play/zh-TW.json", "messages/zh-TW.json"))("rolls a cantrip's scaled dice from game data, without loading the spell corpus", async () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <NextIntlClientProvider locale="zh-TW" messages={{ ...appZh, ...systemZh }} timeZone="UTC">
        <SystemPluginProvider catalog={{}}>{children}</SystemPluginProvider>
      </NextIntlClientProvider>
    );
    await act(async () => {
      render(
        <Sheet initial={{ name: "艾琳", level: 5, spellAttack: 6, spells: [{ id: "s1", level: 0, name: "火焰箭", ref: "spell:fire-bolt", prepared: true }] }} />,
        { wrapper },
      );
    });
    const combat = await screen.findByRole("tab", { name: "戰鬥" });
    fireEvent.mouseDown(combat);
    fireEvent.click(combat);
    expect(await screen.findByRole("button", { name: /火焰箭.* 2d10$/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /火焰箭.* \+6$/ })).toBeInTheDocument();
    expect(corpusParts.filter((part) => part.startsWith("spell-"))).toEqual([]);
  });
});
