import { Suspense, useState } from "react";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import type { LoadedSystem } from "@skald/types/system";
import { zhWithheld } from "../../../__tests__/zh-withheld";
import type { EffectivePacks, PackEntry } from "../../../content-pack/domain/types";
import { LevelUpDialog } from "../../level-up/level-up-dialog";
import type { ReferenceContextValue } from "../../use-reference-context";
import type { LevelUpRequest } from "../play-context";
import { loadDndHarness, mountDnd, openTab, type DndHarness, type MountOptions } from "./dnd-harness";

/** The level-up helper's UI (phase 2b §4.1, §4.4; slice L2) on the real play view and template. */

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(() => "toast-1"), { success: vi.fn(), error: vi.fn(), warning: vi.fn(), dismiss: vi.fn() }) }));
vi.setConfig({ testTimeout: 30_000 });

let harness: DndHarness;
beforeAll(async () => {
  harness = await loadDndHarness();
});
beforeEach(() => {
  vi.mocked(toast).mockClear();
  vi.mocked(toast.success).mockClear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

type Row = Record<string, unknown>;

/** The adapter's part: 升級 opens the dialog beside the sheet with the view's request. */
function withLevelUp(options: { inTable?: boolean; packs?: EffectivePacks | null; system?: LoadedSystem } = {}): MountOptions["useHost"] {
  return function useLevelUpHost(reference: ReferenceContextValue) {
    const [request, setRequest] = useState<LevelUpRequest | null>(null);
    return {
      playView: { openLevelUp: setRequest },
      dialogs: request && (
        <Suspense fallback={null}>
          <LevelUpDialog
            request={request}
            system={options.system ?? harness.system}
            context={reference}
            packs={options.packs ?? null}
            inTable={options.inTable}
            onClose={() => setRequest(null)}
          />
        </Suspense>
      ),
    };
  };
}

async function openLevelUp(name = "升級", title = name) {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
  });
  const dialog = await screen.findByRole("dialog", { name: title });
  await waitFor(() => expect(dialog.querySelector("[data-level-up-apply]")).not.toBeNull());
  return dialog;
}

async function click(element: Element) {
  await act(async () => {
    fireEvent.click(element);
  });
}

const featureRows = (data: Row) => (data.features as Row[]).filter((row) => row.level === 3);
const paladin = { classId: "paladin", className: "聖武士", level: 2, hitDieFaces: 10, slot1Total: 2, features: [] };
const zhSheet = zhWithheld("messages/zh-TW.json", "messages/play/zh-TW.json");

describe("level-up helper UI (phase 2b §4)", () => {
  it.skipIf(zhSheet)("hides 升級 on a read-only sheet and at level 20", async () => {
    await mountDnd(harness, { editable: false, extra: paladin, useHost: withLevelUp() });
    expect(screen.queryByRole("button", { name: "升級" })).toBeNull();
    cleanup();
    await mountDnd(harness, { extra: { ...paladin, level: 20 }, useHost: withLevelUp() });
    expect(screen.queryByRole("button", { name: "升級" })).toBeNull();
    cleanup();
    await mountDnd(harness, { extra: paladin, useHost: withLevelUp() });
    expect(screen.getByRole("button", { name: "升級" })).toBeInTheDocument();
  });

  it.skipIf(zhSheet)("Paladin 2→3 with Oath of Devotion: level 3, five feature rows, the subclass, slots and the recalc notice; 復原 undoes it", async () => {
    const sheet = await mountDnd(harness, { extra: paladin, useHost: withLevelUp() });
    const dialog = await openLevelUp();
    expect(dialog.querySelector("[data-level-up-class]")).toHaveTextContent("聖武士 2 → 3");
    await click(within(dialog).getByRole("radio", { name: "奉獻之誓" }));
    expect(dialog.querySelectorAll("[data-level-up-feature]")).toHaveLength(5);
    expect(dialog.querySelector("[data-level-up-slots]")).toHaveTextContent("1環：2 → 3");
    expect(dialog.querySelector("[data-level-up-spells]")).toHaveTextContent("已準備法術 3 → 4");
    // The class columns read their zh-TW label from the localized table.
    await waitFor(() => expect(dialog.querySelector("[data-level-up-columns]")).toHaveTextContent("引導神力：0 → 2"));
    await click(within(dialog).getByRole("button", { name: "套用" }));

    const after = sheet.data();
    expect(after).toMatchObject({ level: 3, subclass: "奉獻之誓", slot1Total: 3 });
    const rows = featureRows(after);
    expect(rows).toHaveLength(5);
    expect(rows.map((row) => row.ref).sort()).toEqual([
      "classFeature:paladin/channel-divinity-l3",
      "classFeature:paladin/divine-sense-l3",
      "subclassFeature:paladin/oath-of-devotion/oath-of-devotion-l3",
      "subclassFeature:paladin/oath-of-devotion/oath-of-devotion-spells-l3",
      "subclassFeature:paladin/oath-of-devotion/sacred-weapon-l3",
    ]);
    await waitFor(() => expect(vi.mocked(toast).mock.calls.some(([title]) => title === "已重新計算")).toBe(true));
    expect(within(dialog).getByRole("button", { name: "繼續升到 4 級" })).toBeInTheDocument();

    const [message, options] = vi.mocked(toast.success).mock.calls.find(([title]) => title === "已升到 3 級") as unknown as [string, { duration: number; action: { label: string; onClick: () => void } }];
    expect(message).toBe("已升到 3 級");
    expect(options.duration).toBe(Infinity);
    expect(options.action.label).toBe("復原");
    await act(async () => options.action.onClick());
    expect(sheet.data()).toMatchObject({ level: 2, subclass: "", slot1Total: 2 });
    expect(featureRows(sheet.data())).toEqual([]);
  });

  it("writes the English subclass name on an English sheet", async () => {
    const sheet = await mountDnd(harness, { locale: "en", extra: { ...paladin, className: "Paladin" }, useHost: withLevelUp() });
    const dialog = await openLevelUp("Level up");
    expect(dialog.querySelector("[data-level-up-class]")).toHaveTextContent("Paladin 2 → 3");
    await click(within(dialog).getByRole("radio", { name: "Oath of Devotion" }));
    await click(within(dialog).getByRole("button", { name: "Apply" }));
    expect(sheet.data()).toMatchObject({ level: 3, subclass: "Oath of Devotion" });
  });

  it.skipIf(zhSheet)("an ability score improvement of +2 Strength writes the score and the feat row", async () => {
    const sheet = await mountDnd(harness, { extra: { level: 3, str: 15, subclass: "Champion", features: [], feats: [] }, useHost: withLevelUp() });
    const dialog = await openLevelUp();
    const apply = within(dialog).getByRole("button", { name: "套用" });
    expect(apply).toBeDisabled();
    await click(within(dialog).getByRole("button", { name: "力量 +1" }));
    await click(within(dialog).getByRole("button", { name: "力量 +1" }));
    expect(dialog.querySelector("[data-level-up-ability='str']")).toHaveTextContent("15 → 17");
    expect(apply).toBeEnabled();
    await click(apply);
    const after = sheet.data();
    expect(after).toMatchObject({ level: 4, str: 17 });
    expect((after.feats as Row[]).map((row) => row.ref)).toEqual(["feat:ability-score-improvement"]);
  });

  it.skipIf(zhSheet)("a rolled hit die writes its difference from the average to hpMaxMisc", async () => {
    const sheet = await mountDnd(harness, { extra: { level: 1, hitDieFaces: 10, hpMaxMisc: 1, features: [] }, useHost: withLevelUp() });
    const dialog = await openLevelUp();
    await click(within(dialog).getByRole("radio", { name: "擲骰" }));
    fireEvent.change(within(dialog).getByLabelText("生命骰結果"), { target: { value: "9" } });
    expect(dialog.querySelector("[data-level-up-hp]")).toHaveTextContent("+3");
    await click(within(dialog).getByRole("button", { name: "套用" }));
    expect(sheet.data()).toMatchObject({ level: 2, hpMaxMisc: 4 });
  });

  it.skipIf(zhSheet)("on a table's copy adds a Drive pack feature without its text and a homebrew one with text and stamp", async () => {
    const entry = (id: string, name: string, text: string): PackEntry => ({
      kind: "classFeature", id: `fighter/${id}-l2`, ref: `classFeature:fighter/${id}-l2`, name, entries: [text], meta: { level: 2 },
    });
    const packs: EffectivePacks = {
      content: { entries: [entry("ember-drill", "Ember Drill", "Drive pack text."), entry("ash-guard", "Ash Guard", "Homebrew text.")], overlays: {}, wizard: {}, zhTW: {} },
      keys: ["drive", "homebrew"],
      supplier: { "classFeature:fighter/ember-drill-l2": "drive", "classFeature:fighter/ash-guard-l2": "homebrew" },
      aliases: {},
      shadowed: {},
      homebrew: { "classFeature:fighter/ash-guard-l2": { pack: "pack-1", item: "item-1", rev: 3 } },
    };
    const sheet = await mountDnd(harness, { packs, extra: { level: 1, features: [] }, useHost: withLevelUp({ inTable: true, packs }) });
    const dialog = await openLevelUp();
    expect(within(dialog).getByRole("checkbox", { name: "Ember Drill" })).toBeChecked();
    await click(within(dialog).getByRole("button", { name: "套用" }));
    const rows = sheet.data().features as Row[];
    const drive = rows.find((row) => row.ref === "classFeature:fighter/ember-drill-l2")!;
    expect(drive).toMatchObject({ origin: "pack", level: 2, name: "Ember Drill" });
    expect(drive).not.toHaveProperty("text");
    expect(rows.find((row) => row.ref === "classFeature:fighter/ash-guard-l2")).toMatchObject({
      origin: "custom", text: "Homebrew text.", homebrewPack: "pack-1", homebrewItem: "item-1", homebrewRev: 3, level: 2,
    });
  });

  it.skipIf(zhSheet)("an unknown class offers level and hit points only", async () => {
    const sheet = await mountDnd(harness, { extra: { level: 4, classId: "", className: "自創職業" }, useHost: withLevelUp() });
    const dialog = await openLevelUp();
    expect(dialog.querySelector("[data-level-up-no-class]")).toHaveTextContent("找不到職業資料");
    expect(dialog.querySelector("[data-level-up-features]")).toBeNull();
    await click(within(dialog).getByRole("button", { name: "套用" }));
    expect(sheet.data()).toMatchObject({ level: 5 });
  });

  const ashWardenPacks = (): EffectivePacks => ({
    content: {
      entries: [{ kind: "class", id: "ash-warden", ref: "class:ash-warden", name: "Ash Warden", entries: [], meta: { spellcasting: { list: "druid" } } }],
      overlays: {}, wizard: {}, zhTW: {},
    },
    keys: ["drive"],
    supplier: { "class:ash-warden": "drive" },
    aliases: {},
    shadowed: {},
  });

  it.skipIf(zhSheet)("the spells tab's library opens on a pack class's borrowed spell list", async () => {
    const openCompendium = vi.fn();
    await mountDnd(harness, { packs: ashWardenPacks(), extra: { classId: "ash-warden", className: "灰燼守望者" }, useHost: () => ({ playView: { openCompendium } }) });
    await openTab("法術");
    await click(document.querySelector("[data-add-list='spells']")!);
    expect(openCompendium).toHaveBeenCalledWith(expect.any(Function), expect.anything(), { tab: "spells", classId: "druid" });
  });

  it.skipIf(zhSheet)("on a multiclass sheet 我的職業 unions a pack class's borrowed list and casts it from that class", async () => {
    const openCompendium = vi.fn();
    const multiclass = [{ id: "class_a", classId: "ash-warden", ref: "class:ash-warden", origin: "pack", name: "Ash Warden", subclass: "", level: 1, hitDie: 8, hitDiceSpent: 0, spellAbility: "wis" }];
    await mountDnd(harness, { packs: ashWardenPacks(), extra: { level: 2, classId: "wizard", className: "法師", multiclass }, useHost: () => ({ playView: { openCompendium } }) });
    await openTab("法術");
    await click(document.querySelector("[data-add-list='spells']")!);
    const start = openCompendium.mock.calls.at(-1)?.[2] as { classIds: string[]; castingClassOf: Record<string, string> };
    expect(start.classIds).toEqual(["wizard", "druid"]);
    expect(start.castingClassOf).toEqual({ wizard: "", druid: "ash-warden" });
  });
});
