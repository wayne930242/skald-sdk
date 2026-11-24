import { useEffect, useState, type ReactNode } from "react";
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
import { TemplateRenderer } from "@skald/sheet-sdk/modules/character/ui/renderer/template-renderer";
import { SystemPluginProvider } from "@skald/sheet-sdk/modules/systems/ui/system-plugin-provider";
import { useReferenceContext } from "../../use-reference-context";
import { DndPlayView } from "../play-view";
import { preloadPlayTabs } from "../lazy-tabs";
import { loadEditMessages } from "../edit-messages";

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

// The hit-die roll stays pending until the test resolves it, as 3D dice do for a few seconds.
const pending: { resolve: (value: { rolled: number }) => void } = { resolve: () => {} };
vi.mock("@skald/sheet-sdk/modules/rolls/ui/context/roll-context", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useRollOptional: () => ({
    executeRoll: () => new Promise((resolve) => {
      pending.resolve = resolve;
    }),
  }),
}));

const schema = schemaJson as unknown as Schema;
const template = templateJson as unknown as Template;
const system = {
  config: { id: "dnd5e-2024", sheetComponent: "dnd5e" },
  schema,
  template,
  defaultData: {},
  mappings: {},
  gameData: {},
} as unknown as LoadedSystem;

const saved: { data: Record<string, unknown>; setData: ((updater: (p: Record<string, unknown>) => Record<string, unknown>) => void) | null } = {
  data: {},
  setData: null,
};

function Sheet({ initial }: { initial: Record<string, unknown> }) {
  const [data, setData] = useState(initial);
  useEffect(() => {
    saved.data = data;
  });
  useEffect(() => {
    saved.setData = (updater) => setData(updater);
  }, []);
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
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    () => ({ width: 1440, height: 800, top: 0, left: 0, right: 1440, bottom: 800, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect,
  );
});
afterEach(() => vi.restoreAllMocks());

// The tabs past 角色 load when they open; load them ahead so a test reads them at once.
// The tabs' edit labels (plan-uat2 §3.2) load with them: load both ahead too.
beforeAll(() => Promise.all([preloadPlayTabs(), loadEditMessages("zh-TW"), loadEditMessages("en")]));

describe("use a hit die", () => {
  it.skipIf(zhWithheld("messages/play/zh-TW.json"))("heals the HP at commit time, keeping damage written while the die rolled", async () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <NextIntlClientProvider locale="zh-TW" messages={{ ...appZh, ...systemZh }} timeZone="UTC">
        <SystemPluginProvider catalog={{}}>{children}</SystemPluginProvider>
      </NextIntlClientProvider>
    );
    await act(async () => {
      render(
        <Sheet initial={{ name: "艾琳", level: 3, conMod: 2, hpMax: 20, hp: { current: 10 }, hitDieFaces: 6, hitDiceMax: 3, hitDiceSpent: 0 }} />,
        { wrapper },
      );
    });
    await screen.findByRole("tab", { name: "戰鬥" });

    fireEvent.click(screen.getByRole("button", { name: "使用生命骰" }));
    // The GM applies 4 damage, and another tab spends a die, while the die is rolling.
    act(() => saved.setData?.((previous) => ({ ...previous, hp: { current: 6 }, hitDiceSpent: 1 })));
    await act(async () => pending.resolve({ rolled: 5 }));

    expect(saved.data.hp).toEqual({ current: 11 });
    expect(saved.data.hitDiceSpent).toBe(2);
  });
});
