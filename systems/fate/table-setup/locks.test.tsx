import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Schema } from "@skald/types/schema";
import type { LoadedSystem } from "@skald/types/system";
import { TABLE_SETUP_SCHEMA, type TableSetupSheetPort } from "@skald/sheet-sdk/modules/systems";
import { TableSetupSheetProvider } from "@skald/sheet-sdk/modules/systems/ui/table-setup-sheet";
import appEn from "@skald/sheet-sdk/messages/en.json";
import systemEn from "@skald/system-fate/data/fate-condensed/messages/en.json";
import presetsEn from "@skald/system-fate/data/fate-condensed/messages/v2-presets/en.json";
import labelsEn from "@skald/system-fate/data/fate-condensed/presets/labels/en.json";
import schemaJson from "@skald/system-fate/data/fate-condensed/schema.json";
import { loadFatePresetCatalog, type FatePresetCatalog, type FatePresetLabels } from "../domain/presets";
import { FatePlayContext, type FatePlayContextValue } from "../sheet/play/play-context";
import { FatePresetDialog } from "../sheet/presets/preset-dialog";
import type { FateTableSetupConfig } from "./config";

// D1, D2 (ADR 0016 S2): a table copy's recipe dialog cannot move a locked item off the table's
// value; defaults stay free; a vault card (no port) is unaffected.

let catalog: FatePresetCatalog;
beforeAll(async () => { catalog = await loadFatePresetCatalog(); });
afterEach(() => cleanup());

const schema = schemaJson as unknown as Schema;
const labels = labelsEn as FatePresetLabels;

function port(config: FateTableSetupConfig, locksApply = true): TableSetupSheetPort {
  return {
    tableId: "t1",
    locksApply,
    setup: { config: { schema: TABLE_SETUP_SCHEMA, system: { "fate-condensed": config } }, revision: 1 },
    appliedRevision: 1,
    ApplyPrompt: () => null,
  };
}

function open(data: Record<string, unknown>, value: TableSetupSheetPort | null) {
  const update = vi.fn();
  const play = {
    data, schema, system: { config: { id: "fate-condensed" } } as unknown as LoadedSystem,
    editable: true, structural: true, secretAccess: "unknown", update, setField: vi.fn(), openRules: vi.fn(),
    skills: [], aspects: { permanent: [], held: [] },
  } as unknown as FatePlayContextValue;
  render(
    <NextIntlClientProvider locale="en" timeZone="UTC" messages={{ ...appEn, ...systemEn, ...presetsEn }}>
      <TableSetupSheetProvider value={{ port: value, request: () => {} }}>
        <FatePlayContext.Provider value={play}>
          <FatePresetDialog catalog={catalog} labels={labels} close={vi.fn()} restoreFocus={vi.fn()} />
        </FatePlayContext.Provider>
      </TableSetupSheetProvider>
    </NextIntlClientProvider>,
  );
  return update;
}

const axis = (id: string) => screen.getByRole("dialog").querySelector<HTMLElement>(`[data-fate-preset-axis="${id}"]`)!;
const text = presetsEn.fatePresets;
const unifiedLocked: FateTableSetupConfig = {
  selection: { stress: { value: "unified", policy: "locked" }, injuries: { value: "conditions", policy: "default" } },
  overrides: {},
};

describe("the recipe dialog of a table copy", () => {
  it("disables an axis locked at the card's value and says so; a default item stays free", async () => {
    open({ fateV2: { preset: { selection: { stress: "unified" } } } }, port(unifiedLocked));
    fireEvent.click(screen.getByRole("button", { name: text.tableNoticeLabel }));
    expect(await screen.findByText(text.tableNotice)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: text.tableNoticeLabel }));
    await waitFor(() => expect(screen.queryByText(text.tableNotice)).not.toBeInTheDocument());
    const stress = within(axis("stress"));
    expect(stress.getByText(text.lockedByTable)).toBeVisible();
    expect(stress.getByRole("combobox")).toBeDisabled();
    expect(within(axis("injuries")).getByRole("combobox")).toBeEnabled();
    expect(within(axis("injuries")).queryByText(text.lockedByTable)).not.toBeInTheDocument();
  });

  it("lets a card that differs keep its value or take the table's, nothing else", () => {
    open({}, port(unifiedLocked));
    const select = within(axis("stress")).getByRole("combobox");
    expect(select).toBeEnabled();
    expect([...select.querySelectorAll("option")].map((option) => option.value)).toEqual(["split", "unified"]);
  });

  it("disables shortcuts that would move a locked axis", () => {
    open({ fateV2: { preset: { selection: { stress: "unified" } } } }, port({ selection: { stress: { value: "split", policy: "locked" } }, overrides: {} }));
    expect(screen.getByRole("button", { name: labels.recipes.unified })).toBeEnabled();
    open({ fateV2: { preset: { selection: { stress: "split" } } } }, port({ selection: { stress: { value: "split", policy: "locked" } }, overrides: {} }));
    const buttons = screen.getAllByRole("button", { name: labels.recipes.unified });
    expect(buttons.at(-1)).toBeDisabled();
  });

  it("offers a locked point budget's table value to a card that differs, and disables the input (TS2-F004)", () => {
    open({ fateV2: { preset: { selection: { allocation: "point-buy" }, overrides: { pointBudget: 20 } } } },
      port({ selection: { allocation: { value: "point-buy", policy: "locked" } }, overrides: { pointBudget: { value: 25, policy: "locked" } } }));
    const budget = screen.getByRole("spinbutton", { name: text.budget });
    expect(budget).toBeDisabled();
    expect(budget).toHaveValue(20);
    fireEvent.click(screen.getByRole("button", { name: text.useTableValue.replace("{value}", "25") }));
    expect(budget).toHaveValue(25);
    expect(screen.queryByRole("button", { name: text.useTableValue.replace("{value}", "25") })).not.toBeInTheDocument();
  });

  it("does not lock the table's GM or assistants (TS2-F002)", () => {
    open({ fateV2: { preset: { selection: { stress: "unified" } } } }, port(unifiedLocked, false));
    expect(screen.queryByRole("button", { name: text.tableNoticeLabel })).not.toBeInTheDocument();
    expect(within(axis("stress")).queryByText(text.lockedByTable)).not.toBeInTheDocument();
    expect(within(axis("stress")).getByRole("combobox")).toBeEnabled();
  });

  it("leaves a vault card's dialog as it was", () => {
    open({}, null);
    expect(screen.queryByRole("button", { name: text.tableNoticeLabel })).not.toBeInTheDocument();
    const select = within(axis("stress")).getByRole("combobox");
    expect(select).toBeEnabled();
    fireEvent.change(select, { target: { value: "unified" } });
    expect(select).toHaveValue("unified");
  });
});
