import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { useEffect, useState, type ReactNode } from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { zhWithheld } from "../../../__tests__/zh-withheld";
import { readCompiledFormulaArtifact, type CompiledFormulaArtifact } from "@skald/formula";
import type { Schema, Template } from "@skald/types/schema";
import type { LoadedSystem } from "@skald/types/system";
import appZh from "@skald/sheet-sdk/messages/zh-TW.json";
import systemZh from "@skald/system-dnd5e/data/dnd5e-2024/messages/zh-TW.json";
import { compileBuiltinFixtureArtifact } from "@skald/sheet-sdk/modules/templates/sheet-artifact";
import { loadDnd5e2024Data } from "../../../data-access/builtin-local-data";
import { TemplateRenderer } from "@skald/sheet-sdk/modules/character/ui/renderer/template-renderer";
import { SystemPluginProvider } from "@skald/sheet-sdk/modules/systems/ui/system-plugin-provider";
import type { BuiltinLocalSystemData } from "@skald/sheet-sdk/modules/systems";
import { useReferenceContext } from "../../use-reference-context";
import { DndPlayView } from "../play-view";
import { preloadPlayTabs } from "../lazy-tabs";
import { loadEditMessages } from "../edit-messages";
import { loadEconomyMessages } from "../../economy/economy-intl";
import { EDIT_PARTS, EDIT_TARGETS } from "../edit-layer";
import { CUSTOM_FORM_FIELDS } from "../../custom-rows";
import { PLAYER_TEXT_LISTS } from "../row-body";

/**
 * plan-uat2 §3.1 (D2 = B): edit mode is the play view with the structural fields unlocked, each
 * the schema's own field renderer. The coverage guard keeps every schema input editable somewhere.
 */

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.setConfig({ testTimeout: 30_000 });

let local: BuiltinLocalSystemData;
let artifact: CompiledFormulaArtifact;
let system: LoadedSystem;

beforeAll(async () => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  local = await loadDnd5e2024Data();
  const { compiledArtifact } = compileBuiltinFixtureArtifact("dnd5e-2024", local);
  const read = readCompiledFormulaArtifact((compiledArtifact as { formulas: unknown }).formulas);
  if (!read) throw new Error("compiled artifact carries no formulas");
  artifact = read;
  system = {
    config: { id: "dnd5e-2024", sheetComponent: "dnd5e" },
    schema: local.schema,
    template: local.template,
    defaultData: local.defaultData,
    mappings: {},
    gameData: local.gameData,
    runtime: { builtinTemplate: true },
  } as unknown as LoadedSystem;
  await Promise.all([preloadPlayTabs(), loadEditMessages("zh-TW"), loadEconomyMessages("zh-TW"), import("../edit-layer")]);
});

let width = 1440;
beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => ({ width, height: 800, top: 0, left: 0, right: width, bottom: 800, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect);
});
afterEach(() => {
  vi.restoreAllMocks();
  width = 1440;
});

const setOverride = vi.fn();

const saved: { data: Record<string, unknown> } = { data: {} };

function Sheet({ mode, schema = local.schema as Schema, extra }: { mode: "play" | "edit"; schema?: Schema; extra?: Record<string, unknown> }) {
  const [data, setData] = useState<Record<string, unknown>>(() => ({ ...structuredClone(local.defaultData), name: "布蘭", level: 1, classId: "fighter", className: "戰士", species: "人類", ...extra }));
  useEffect(() => {
    saved.data = data;
  });
  const reference = useReferenceContext(system);
  return (
    <TemplateRenderer
      template={local.template as Template}
      schema={schema}
      data={data}
      viewMode="web"
      mode={mode}
      editable
      setupMode={mode === "edit"}
      onChange={(path, value) => setData((previous) => ({ ...previous, [path]: value }))}
      setData={setData}
      characterId="c-bran"
      formulaRuntime={{ templateVersionId: "v", artifact, derivedOverrides: {} }}
      onSetDerivedOverride={setOverride}
      onRefreshDerivedOverride={vi.fn()}
      playView={<DndPlayView system={system} reference={reference} openReference={vi.fn()} openCompendium={vi.fn()} />}
      playViewModes="both"
    />
  );
}

async function mount(mode: "play" | "edit", schema?: Schema, extra?: Record<string, unknown>) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <NextIntlClientProvider locale="zh-TW" messages={{ ...appZh, ...(systemZh as object) }} timeZone="UTC">
      <SystemPluginProvider catalog={{}}>{children}</SystemPluginProvider>
    </NextIntlClientProvider>
  );
  await act(async () => {
    render(<Sheet mode={mode} schema={schema} extra={extra} />, { wrapper });
  });
  await screen.findByRole("tab", { name: "戰鬥" });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function openTab(name: string) {
  fireEvent.mouseDown(screen.getByRole("tab", { name }));
  await act(async () => {
    fireEvent.click(screen.getByRole("tab", { name }));
  });
}

const rendered = () => new Set([...document.querySelectorAll("[data-dnd-play-view] [data-field-id]")].map((element) => element.getAttribute("data-field-id")));
const input = (fieldId: string) => document.querySelector(`[data-dnd-play-view] [data-field-id='${fieldId}'] input, [data-dnd-play-view] [data-field-id='${fieldId}'] [role='combobox']`);

describe("edit mode in the play view", () => {
  it.skipIf(zhWithheld("messages/edit/zh-TW.json", "messages/play/zh-TW.json"))("is the play layout with a banner, not the template form", async () => {
    await mount("edit");
    expect(document.querySelector("[data-dnd-play-view]")).not.toBeNull();
    expect(document.querySelector(".skald-page")).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("編輯模式：可修改屬性、種族、職業等基礎資料");
    // B-023: the HP buttons stay, and in edit mode they open the HP editor.
    expect(screen.getAllByRole("button", { name: "編輯生命值" }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "失去1點生命值" })).toBeNull();
  });

  it.skipIf(zhWithheld("messages/play/zh-TW.json"))("renders schema inputs for the ability scores, species, class and armor base", async () => {
    await mount("edit");
    for (const id of ["str", "species", "className"]) expect(input(id), id).not.toBeNull();
    fireEvent.change(input("str") as HTMLInputElement, { target: { value: "17" } });
    expect(input("str")).toHaveValue(17);
    expect(input("armorBase")).not.toBeNull();
  });

  it.skipIf(zhWithheld("messages/play/zh-TW.json"))("offers the derived-value override for AC", async () => {
    await mount("edit");
    const ac = document.querySelector("[data-dnd-play-view] [data-field-id='ac'] [data-derived-value] input") as HTMLInputElement;
    expect(ac).not.toBeNull();
    expect(ac).not.toHaveAttribute("readonly");
    // B-024: the shared DerivedValue commits on leaving the input (or Enter)
    fireEvent.focus(ac);
    fireEvent.change(ac, { target: { value: "15" } });
    fireEvent.keyDown(ac, { key: "Enter" });
    expect(setOverride).toHaveBeenCalledWith("ac", 15);
  });

  it.skipIf(zhWithheld("messages/play/zh-TW.json"))("skips fields an older character schema lacks, and a card left empty", async () => {
    // A character pinned to a template version from before rangedAttackBonus and orderLoreBonus.
    const fields = { ...(local.schema.fields as Schema["fields"]) };
    delete fields.rangedAttackBonus;
    delete fields.orderLoreBonus;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await mount("edit", { ...(local.schema as Schema), fields });
    await openTab("戰鬥");
    expect(document.querySelector("[data-play-edit='combat']")).toBeNull();
    expect(input("athletics")).not.toBeNull();
    expect(warn.mock.calls.filter(([message]) => String(message).startsWith("Field not found"))).toEqual([]);
  });

  it.skipIf(zhWithheld("messages/edit/zh-TW.json", "messages/play/zh-TW.json", "messages/zh-TW.json"))("編輯欄位 on an SRD row leaves out what the catalog shows: its name, a built-in spell's casting time and range", async () => {
    const spell = { id: "s9", level: 1, name: "Magic Missile", ref: "spell:magic-missile", origin: "srd", prepared: true, source: "other", notes: "" };
    await mount("edit", undefined, { spells: [spell] });
    await openTab("法術");
    const trigger = await screen.findByRole("button", { name: "魔法飛彈的選項" });
    await act(async () => {
      fireEvent.keyDown(trigger, { key: "Enter" });
    });
    await act(async () => {
      fireEvent.click(within(await screen.findByRole("menu")).getByRole("menuitem", { name: "編輯欄位" }));
    });
    const dialog = await screen.findByRole("dialog", { name: "編輯魔法飛彈" });
    expect(within(dialog).queryByLabelText("名稱")).toBeNull();
    expect(within(dialog).queryByLabelText("施法時間")).toBeNull();
    expect(within(dialog).queryByLabelText("距離")).toBeNull();
    fireEvent.change(within(dialog).getByLabelText("備註"), { target: { value: "法杖上的。" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "儲存" }));
    expect(within(dialog).queryByRole("alert")).toBeNull();
    expect((saved.data.spells as Array<Record<string, unknown>>)[0]).toMatchObject({ id: "s9", name: "Magic Missile", notes: "法杖上的。" });
  });

  it.skipIf(zhWithheld("messages/play/zh-TW.json"))("shows no schema input in play mode", async () => {
    await mount("play");
    expect(rendered().size).toBe(0);
    expect(screen.queryByRole("status")).toBeNull();
  });
});

/**
 * Fields no player edits by hand: ids the wizard writes for lookups (plan-uat2 §3.1), and what
 * equipping writes from the worn items (§3.3): a shield's +N is set on the shield row, a GM's
 * extra AC goes to `acMisc`.
 */
const INTERNAL = new Set(["classId", "speciesId", "backgroundId", "startingShop", "armorStrReq", "armorStealth", "shieldBonus"]);

/** Fields the play view itself writes (taps, list rows, the 角色 ✎ editors), in both modes. */
const PLAY_CONTROLLED = [
  "hp", "hpTemp", "hitDiceSpent", "deathSuccesses", "deathFailures", "conditions", "exhaustion", "concentration", "heroicInspiration",
  ...Array.from({ length: 9 }, (_, index) => `slot${index + 1}Used`), "pactUsed",
  "portrait", "appearance", "backstory", "notes",
  "languages", "toolProficiencies", "features", "speciesTraits", "feats", "weapons", "spells",
];

/** Row fields no player edits: the row's identity and provenance, and `playerText` (編輯文字 writes it). */
const ROW_INTERNAL = new Set(["id", "ref", "origin", "itemId", "playerText"]);

/** Row fields a play control writes in place of the form. */
const ROW_PLAY_CONTROLS: Record<string, string[]> = { spells: ["prepared"] };

/** Row fields no surface shows, so no editor is offered: a language is its name (an SRD one's text resolves live). */
const ROW_NOT_SHOWN: Record<string, string[]> = { languages: ["text"] };

const playDir = join(__dirname, "..");
const playSource = readdirSync(playDir)
  .filter((name) => /\.tsx?$/.test(name))
  .map((name) => readFileSync(join(playDir, name), "utf8"))
  .join("\n");

describe("coverage guard (plan-uat2 §3.1): every schema input is editable in the play view", () => {
  it.skipIf(zhWithheld("messages/play/zh-TW.json"))("renders every structural field in edit mode, across the tabs", async () => {
    await mount("edit");
    const seen = rendered();
    for (const tab of ["戰鬥", "法術", "特性", "物品"]) {
      await openTab(tab);
      for (const id of rendered()) seen.add(id);
    }
    const fields = local.schema.fields as Schema["fields"];
    const inputs = Object.values(fields).filter((field) => field.type !== "computed" && !INTERNAL.has(field.id)).map((field) => field.id);
    const missing = inputs.filter((id) => !seen.has(id) && !PLAY_CONTROLLED.includes(id));
    expect(missing).toEqual([]);
    // Every part's field is one the schema has: a renamed field fails here, not silently.
    expect(Object.values(EDIT_PARTS).flat().filter((id) => !(id in fields))).toEqual([]);
    // B-023: so does every edit target's field (plan §4.1)
    expect(Object.values(EDIT_TARGETS).flat().filter((id) => !(id in fields))).toEqual([]);
  });

  it.skipIf(zhWithheld("messages/play/zh-TW.json"))("covers what the play view did not reach before (xp, proficiencies, AC inputs, attunement)", async () => {
    await mount("edit");
    const seen = rendered();
    await openTab("物品");
    for (const id of rendered()) seen.add(id);
    const before = [
      "xp", ...["str", "dex", "con", "int", "wis", "cha"].map((ability) => `${ability}SaveProf`),
      "initiativeProf", "initiativeMisc", "jackOfAllTrades", "orderLoreBonus",
      "armorType", "armorBase", "shield", "unarmoredDefense", "acMisc", "hpPerLevelBonus", "hpMaxMisc",
      "attunement1", "attunement2", "attunement3", "acrobaticsProf", "stealthProf",
    ];
    expect(before.filter((id) => !seen.has(id))).toEqual([]);
  });

  it("finds each play-controlled field in the play view's code", () => {
    const missing = PLAY_CONTROLLED.filter((id) => {
      if (/^slot\dUsed$/.test(id)) return !/slot\$\{[^}]+\}Used/.test(playSource);
      return !new RegExp(`["'.\\s{]${id}\\b`).test(playSource);
    });
    expect(missing).toEqual([]);
  });

  it("reaches every row field of every list: its form (編輯欄位), a list part, 編輯文字 or a named play control", () => {
    const fields = local.schema.fields as Schema["fields"];
    const parts = new Set<string>(Object.values(EDIT_PARTS).flat());
    const forms = CUSTOM_FORM_FIELDS as Record<string, readonly string[]>;
    const missing: string[] = [];
    for (const field of Object.values(fields)) {
      if (field.type !== "list" || parts.has(field.id)) continue;
      for (const child of field.rowTemplate.children) {
        if (child.type === "computed" || ROW_INTERNAL.has(child.id)) continue;
        if (forms[field.id]?.includes(child.id)) continue;
        if (child.id === "text" && (PLAYER_TEXT_LISTS as readonly string[]).includes(field.id)) continue;
        const control = ROW_PLAY_CONTROLS[field.id]?.includes(child.id) && new RegExp(`["'\\s{]${child.id}\\b`).test(playSource);
        if (!control && !ROW_NOT_SHOWN[field.id]?.includes(child.id)) missing.push(`${field.id}.${child.id}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("lists only schema fields as play-controlled", () => {
    expect(PLAY_CONTROLLED.filter((id) => !(id in local.schema.fields))).toEqual([]);
  });
});
