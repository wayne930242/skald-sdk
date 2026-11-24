import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { expect, it, vi } from "vitest";
import type { Schema } from "@skald/types/schema";
import type { LoadedSystem } from "@skald/types/system";
import schemaJson from "@skald/system-fate/data/fate-condensed/schema.json";
import { FatePlayContext, type FatePlayContextValue } from "../play/play-context";
import { FatePresetsEntry } from "../presets/presets-entry";
import { FateVitalsPane } from "./vitals-pane";

const data = {
  mildConsequence: "Cut shoulder", physicalStress: [1], skills: { skills: [{ id: "physique", level: 1 }] },
  fateV2: { preset: { selection: { ratings: "srd" } }, gear: { armor: 1 } },
};
const schema = schemaJson as unknown as Schema;

function mount(overrides: Partial<FatePlayContextValue> = {}) {
  const update = vi.fn<FatePlayContextValue["update"]>();
  const value: FatePlayContextValue = {
    data, schema, system: { schema } as LoadedSystem, editable: true, structural: false, update,
    setField: vi.fn(), openRules: vi.fn(), secretAccess: "unknown", skills: [], aspects: { permanent: [], held: [] }, ...overrides,
  };
  const body = (context: FatePlayContextValue) => <NextIntlClientProvider locale="en" timeZone="UTC" messages={{ common: { loading: "Loading", error: "Error" } }}>
    <FatePlayContext.Provider value={context}><FateVitalsPane /><FatePresetsEntry /></FatePlayContext.Provider>
  </NextIntlClientProvider>;
  const view = render(body(value));
  return { update, refresh: (changes: Partial<FatePlayContextValue>) => view.rerender(body({ ...value, ...changes })) };
}

async function hitOptions() {
  fireEvent.click(await screen.findByRole("button", { name: "Allocate a hit" }));
  const dialog = within(await screen.findByRole("dialog", { name: "Allocate a hit" }));
  fireEvent.change(dialog.getByRole("spinbutton", { name: "Incoming shifts" }), { target: { value: "5" } });
  expect(dialog.getByText("Shifts to absorb: 5 − 0 = 5")).toBeInTheDocument();
  fireEvent.click(dialog.getByRole("checkbox", { name: "Apply armor to this hit" }));
  fireEvent.click(dialog.getByRole("radio", { name: /moderate \(4\)/i }));
  return dialog;
}

it("cancels a chosen and fully described hit without a write", async () => {
  const { update } = mount();
  const dialog = await hitOptions();
  fireEvent.change(dialog.getByRole("textbox", { name: /new moderate/i }), { target: { value: "Broken ribs" } });
  expect(dialog.getByRole("button", { name: "Confirm harm" })).toBeEnabled();
  fireEvent.click(dialog.getByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(update).not.toHaveBeenCalled();
});

it("rejects the selected split plan when its cells are no longer legal", async () => {
  const { update, refresh } = mount();
  const dialog = await hitOptions();
  refresh({ data: { ...data, moderateConsequence: "Remote wound" } });
  expect(dialog.getByRole("alert")).toHaveTextContent("The card changed");
  expect(dialog.getByRole("button", { name: "Confirm harm" })).toBeDisabled();
  expect(update).not.toHaveBeenCalled();
});

it("means editable play for stress, and editable setup for recipe UI", async () => {
  const { refresh, update } = mount({ editable: false, structural: true });
  expect(await screen.findByRole("checkbox", { name: "Physical stress, cell 1" })).toBeChecked();
  expect(screen.queryByRole("button", { name: "Rules recipe" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Allocate a hit" })).not.toBeInTheDocument();
  expect(update).not.toHaveBeenCalled();
  refresh({ editable: true, structural: false });
  const cell = screen.getByRole("button", { name: "Physical stress, cell 1" });
  fireEvent.click(cell);
  expect(update.mock.calls[0][0](data).physicalStress).toEqual([]);
  expect(screen.queryByRole("button", { name: "Rules recipe" })).not.toBeInTheDocument();
  refresh({ editable: true, structural: true });
  fireEvent.click(await screen.findByRole("button", { name: "Rules recipe" }));
  const recipe = within(await screen.findByRole("dialog", { name: "Rules recipe" }));
  fireEvent.change(recipe.getByRole("combobox", { name: "Stress" }), { target: { value: "unified" } });
  expect(recipe.getByRole("alert")).toHaveTextContent("Clear the stored stress");
  expect(recipe.getByRole("button", { name: "Apply recipe" })).toBeDisabled();
  expect(update).toHaveBeenCalledTimes(1);
});

it("shows a marked condition's own words beside the condition", async () => {
  const conditions = {
    skills: { skills: [{ id: "physique", level: 1 }] },
    fateV2: {
      preset: { id: "condensed-standard", version: 1, selection: { injuries: "conditions" } },
      harm: { conditions: { "hurt:1": { text: "Sprained ankle" } } },
    },
  };
  mount({ data: conditions });
  const box = await screen.findByRole("checkbox", { name: /cell 1/ , checked: true });
  const condition = box.closest("[data-fate-condition]") as HTMLElement;
  expect(condition).toHaveTextContent("Sprained ankle");
});
