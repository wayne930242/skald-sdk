import { useEffect, useState, type ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { zhWithheld } from "../../../__tests__/zh-withheld";
import { toast } from "sonner";
import type { Schema, Template } from "@skald/types/schema";
import type { LoadedSystem } from "@skald/types/system";
import appZh from "@skald/sheet-sdk/messages/zh-TW.json";
import systemZh from "@skald/system-dnd5e/data/dnd5e-2024/messages/zh-TW.json";
import schemaJson from "@skald/system-dnd5e/data/dnd5e-2024/schema.json";
import templateJson from "@skald/system-dnd5e/data/dnd5e-2024/template.json";
import classes from "@skald/system-dnd5e/data/dnd5e-2024/game/classes.json";
import { TemplateRenderer } from "@skald/sheet-sdk/modules/character/ui/renderer/template-renderer";
import { SystemPluginProvider } from "@skald/sheet-sdk/modules/systems/ui/system-plugin-provider";
import { useReferenceContext } from "../../use-reference-context";
import { DndPlayView } from "../play-view";
import * as editMessages from "../edit-messages";

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
const executeRoll = vi.hoisted(() => vi.fn());
vi.mock("@skald/sheet-sdk/modules/rolls/ui/context/roll-context", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useRollOptional: () => ({ executeRoll, nextModifier: 0 }),
}));
// Counts the lazy catalog's loads; the loads themselves are the real ones.
vi.mock("../edit-messages", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../edit-messages")>();
  return { ...actual, loadEditMessages: vi.fn(actual.loadEditMessages), loadPlayTabsText: vi.fn(actual.loadPlayTabsText) };
});

/**
 * The labels the sheet shows only after an action (rest and death save toasts, the long rest
 * confirmation, Concentration ended) load from the lazy play-tabs catalog (`later-text.ts`). The
 * first render of the default tab must not need them: every label it shows is in the eager
 * catalog, and it loads no lazy catalog.
 */
const schema = schemaJson as unknown as Schema;
const template = templateJson as unknown as Template;
const system = {
  config: { id: "dnd5e-2024", sheetComponent: "dnd5e" },
  schema,
  template,
  defaultData: {},
  mappings: {},
  gameData: { classes },
} as unknown as LoadedSystem;

/** At 0 HP, with Concentration and Exhaustion: the death save, the chips and the rests all show. */
const down: Record<string, unknown> = {
  name: "石鐘", level: 1, classId: "cleric", hpMax: 10, hp: { current: 0 }, profBonus: 2, speed: 30,
  hitDieFaces: 8, hitDiceMax: 1, hitDiceSpent: 1, concentration: "spell:bless", exhaustion: 1, conditions: ["exhaustion", "prone"],
};

let width = 1440;
const saved: { data: Record<string, unknown> } = { data: {} };

function Sheet({ initial }: { initial: Record<string, unknown> }) {
  const [data, setData] = useState(initial);
  useEffect(() => {
    saved.data = data;
  });
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
      characterId="c-later"
      playView={<DndPlayView system={system} reference={reference} openReference={() => {}} openCompendium={null} />}
    />
  );
}

const missing = vi.fn();

async function mount(initial = down) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <NextIntlClientProvider locale="zh-TW" messages={{ ...appZh, ...systemZh }} timeZone="UTC" onError={missing}>
      <SystemPluginProvider catalog={{}}>{children}</SystemPluginProvider>
    </NextIntlClientProvider>
  );
  await act(async () => {
    render(<Sheet initial={initial} />, { wrapper });
  });
  await screen.findAllByRole("tab");
}

/** Text, labels and titles of the view: a missing label shows as its key path (`play.rest.long`). */
function keyPaths(): string[] {
  const view = document.querySelector("[data-dnd-play-view]") as HTMLElement;
  const texts = [view.textContent ?? "", ...[...view.querySelectorAll("[aria-label], [title]")].flatMap((node) => [node.getAttribute("aria-label") ?? "", node.getAttribute("title") ?? ""])];
  return texts.flatMap((value) => value.match(/\b(?:play|edit)\.[A-Za-z]+(?:\.[A-Za-z]+)*/g) ?? []);
}

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => ({ width, height: 800, top: 0, left: 0, right: width, bottom: 800, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect);
  executeRoll.mockReset();
  missing.mockClear();
  vi.mocked(toast).mockClear();
  vi.mocked(toast.success).mockClear();
  vi.mocked(toast.error).mockClear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  width = 1440;
});

describe("labels shown only after an action (later-text)", () => {
  // First in the file: the lazy catalog is not loaded yet in this module registry.
  it.each([["wide", 1440], ["compact", 390]] as const)("the first render (%s) shows every label from the eager catalog and loads no lazy one", async (_, at) => {
    width = at;
    await mount();
    // The wide sheet shows the death save, rests and chips on 角色; a phone shows them on 戰鬥.
    if (at === 1440 && !zhWithheld("messages/play/zh-TW.json")) expect(screen.getAllByRole("button", { name: /擲死亡豁免/ }).length).toBeGreaterThan(0);
    expect(keyPaths()).toEqual([]);
    expect(missing).not.toHaveBeenCalled();
    expect(editMessages.loadEditMessages).not.toHaveBeenCalled();
    expect(editMessages.loadPlayTabsText).not.toHaveBeenCalled();
  });

  it.skipIf(zhWithheld("messages/play-tabs/zh-TW.json", "messages/play/zh-TW.json"))("a short rest with nothing to recover toasts its lazy hint", async () => {
    await mount({ ...down, hp: { current: 10 } });
    await act(async () => {
      fireEvent.click(screen.getAllByRole("button", { name: "短休" })[0]);
    });
    await waitFor(() => expect(toast).toHaveBeenCalledWith("短休：可使用生命骰恢復生命值。"));
    expect(missing).not.toHaveBeenCalled();
  });

  it.skipIf(zhWithheld("messages/play-tabs/zh-TW.json", "messages/play/zh-TW.json"))("a long rest asks with its lazy labels, then toasts", async () => {
    await mount({ ...down, hp: { current: 10 } });
    await act(async () => {
      fireEvent.click(screen.getAllByRole("button", { name: "長休" })[0]);
    });
    const confirm = await screen.findByRole("alertdialog", { name: "進行長休？" });
    expect(confirm).toHaveTextContent("恢復全部生命值、所有已用的生命骰與法術位，並清除死亡豁免。");
    await act(async () => {
      fireEvent.click(within(confirm).getByRole("button", { name: "長休" }));
    });
    expect(saved.data.hitDiceSpent).toBe(0);
    expect(toast.success).toHaveBeenCalledWith("長休完成。");
    expect(missing).not.toHaveBeenCalled();
  });

  it.skipIf(zhWithheld("messages/play-tabs/zh-TW.json", "messages/play/zh-TW.json"))("ending Concentration toasts its lazy label", async () => {
    await mount();
    await act(async () => {
      fireEvent.click(screen.getAllByRole("button", { name: /^終止對/ })[0]);
    });
    expect(saved.data.concentration).toBe("");
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.stringMatching(/^已結束專注.+。$/)));
  });

  it.skipIf(zhWithheld("messages/play-tabs/zh-TW.json", "messages/play/zh-TW.json"))("a death save's outcome toasts its lazy label", async () => {
    executeRoll.mockResolvedValue({ rolled: 1, rolls: [1] });
    await mount();
    await act(async () => {
      fireEvent.click(screen.getAllByRole("button", { name: /擲死亡豁免/ })[0]);
    });
    expect(saved.data.deathFailures).toBe(2);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("擲出 1：算兩次失敗（2/3）"));
    expect(missing).not.toHaveBeenCalled();
  });
});
