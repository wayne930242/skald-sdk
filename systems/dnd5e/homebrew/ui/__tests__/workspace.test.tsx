import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@skald/system-dnd5e/data/dnd5e-2024/messages/homebrew/en.json";
import {
  bindHostPort,
  HostPortsProvider,
} from "@skald/sheet-sdk/modules/systems/ui/host-ports";
import { HomebrewWorkspace } from "../workspace";
import { dndHomebrewStorePort } from "../../store-port";
import {
  createMemoryHomebrewStore,
  type MemoryHomebrewStore,
} from "../../testing/memory-store";
import { HOMEBREW_FORMS } from "../../domain/forms";
import { HOMEBREW_FORM_KINDS } from "../../domain/types";

afterEach(cleanup);
const m = messages.homebrew;
function mount(store?: MemoryHomebrewStore) {
  render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <HostPortsProvider
        ports={store ? [bindHostPort(dndHomebrewStorePort, store)] : []}
      >
        <HomebrewWorkspace />
      </HostPortsProvider>
    </NextIntlClientProvider>,
  );
}
const button = (name: string) => screen.getByRole("button", { name });
const fill = (input: Element, value: string) =>
  fireEvent.change(input, { target: { value } });
async function create(store: MemoryHomebrewStore) {
  mount(store);
  fill(await screen.findByLabelText(m.packName), "Harbor");
  fireEvent.click(button(m.create));
  await screen.findByRole("heading", { name: "Harbor" });
}
it("shows unavailable when the host has no store", () => {
  mount();
  expect(screen.getByText(m.unavailable)).toBeTruthy();
});
it("invites guests to sign in instead of showing pack controls", async () => {
  mount(createMemoryHomebrewStore({ owner: "guest" }));
  expect(await screen.findByText(m["error"].signIn)).toBeTruthy();
  expect(screen.queryByLabelText(m.packName)).toBeNull();
});
it("creates a pack and saves each supported kind from its form", async () => {
  const store = createMemoryHomebrewStore();
  await create(store);
  for (const kind of HOMEBREW_FORM_KINDS) {
    fireEvent.click(button(`Add ${m.kind[kind]}`));
    const name = `Harbor ${kind}`;
    fill(screen.getByLabelText(m.field.nameEn), name);
    if (kind === "background") {
      fill(screen.getByLabelText(m.field.originFeat), "feat:alert");
      const skills = screen.getAllByRole("combobox", { name: m.field.skills });
      fill(skills[0], "stealth");
      fill(skills[1], "survival");
    }
    fireEvent.click(button(m.save));
    await screen.findByRole("button", { name });
  }
  expect(store.snapshot().items.map((r) => r.kind)).toEqual(
    HOMEBREW_FORM_KINDS,
  );
});
it("shows an error without writing an entry whose paragraph exceeds the v1 limit", async () => {
  const store = createMemoryHomebrewStore();
  await create(store);
  fireEvent.click(button("Add Feat"));
  fill(screen.getByLabelText(m.field.nameEn), "Harbor Watch");
  fill(screen.getByLabelText(m.field.textEn), "a".repeat(20_001));
  fireEvent.click(button(m.save));
  expect(await screen.findByText(m.error.invalid)).toBeVisible();
  expect(store.snapshot().items).toEqual([]);
});
it("orders, toggles, renames and deletes a named pack", async () => {
  const store = createMemoryHomebrewStore();
  await create(store);
  fill(screen.getByLabelText(m.packName), "Grove");
  fireEvent.click(button(m.create));
  await screen.findByRole("heading", { name: "Grove" });
  const row = (name: string) => within(button(`${name} (0)`).closest("li")!);
  fireEvent.click(row("Grove").getByText(m.up));
  await waitFor(() =>
    expect(screen.getAllByRole("listitem")[0].textContent).toContain("Grove"),
  );
  fireEvent.click(row("Grove").getByRole("switch"));
  await row("Grove").findByText(m.disabled);
  const prompt = vi.spyOn(window, "prompt").mockReturnValue("Orchard");
  fireEvent.click(row("Grove").getByText(m.rename));
  await screen.findByRole("heading", { name: "Orchard" });
  prompt.mockRestore();
  const confirm = vi
    .spyOn(window, "confirm")
    .mockReturnValueOnce(false)
    .mockReturnValueOnce(true);
  fireEvent.click(row("Orchard").getByText(m.delete));
  expect(store.snapshot().packs).toHaveLength(2);
  fireEvent.click(row("Orchard").getByText(m.delete));
  await screen.findByRole("heading", { name: "Harbor" });
  confirm.mockRestore();
  expect(store.snapshot().packs).toHaveLength(1);
});
it("keeps unsupported imported blocks intact on save", async () => {
  const store = createMemoryHomebrewStore();
  const p = await store.defaultPack();
  if (!p.ok) throw Error(p.error);
  const codec = HOMEBREW_FORMS.feat;
  const payload = codec.toPayload({
    ...codec.empty(),
    id: "imported",
    nameEn: "Imported",
  });
  payload.entry!.entries = [
    { type: "table", colLabels: ["Season"], rows: [["Spring"]] },
  ];
  await store.saveItem(p.value.id, { kind: "feat", key: "imported", payload });
  mount(store);
  fireEvent.click(await screen.findByRole("button", { name: "Imported" }));
  fireEvent.click(screen.getByText(m.advanced));
  fireEvent.click(button(m.save));
  await screen.findByRole("button", { name: "Imported" });
  await waitFor(() => expect(screen.queryByText(m.advanced)).toBeNull());
  expect(store.snapshot().items[0].payload).toEqual(payload);
});
it("does not overwrite an entry changed after the form opened", async () => {
  const store = createMemoryHomebrewStore();
  await create(store);
  fireEvent.click(button("Add Feat"));
  fill(screen.getByLabelText(m.field.nameEn), "Night Watch");
  fireEvent.click(button(m.save));
  fireEvent.click(await screen.findByRole("button", { name: "Night Watch" }));
  const row = store.snapshot().items[0];
  await store.saveItem(row.packUuid, {
    ...row,
    expectedRevision: row.revision,
    payload: {
      ...row.payload,
      entry: { ...row.payload.entry!, name: "New watch" },
    },
  });
  fill(screen.getByLabelText(m.field.nameEn), "Old draft");
  fireEvent.click(button(m.save));
  expect(await screen.findByText(m.error.conflict)).toBeTruthy();
  expect(store.snapshot().items[0].payload.entry?.name).toBe("New watch");
});
it("blocks a built-in clash before saving and shows the store's item limit", async () => {
  const store = createMemoryHomebrewStore({ limits: { items: 0 } });
  await create(store);
  fireEvent.click(button("Add Feat"));
  fill(screen.getByLabelText(m.field.nameEn), "Alert");
  fireEvent.click(screen.getByText(m.details));
  fill(screen.getByLabelText(m.field.id), "different-from-builtin-id");
  fireEvent.click(button(m.save));
  expect(await screen.findByText(/Matches built-in feat:alert/)).toBeTruthy();
  fill(screen.getByLabelText(m.field.nameEn), "Harbor Scout");
  fireEvent.click(button(m.save));
  expect(await screen.findByText(m.error.limitItems)).toBeTruthy();
  expect(store.snapshot().items).toHaveLength(0);
});
