import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@skald/system-dnd5e/data/dnd5e-2024/messages/homebrew/en.json";
import { bindHostPort, HostPortsProvider } from "@skald/sheet-sdk/modules/systems/ui/host-ports";
import { HomebrewWorkspace } from "../workspace";
import { dndHomebrewStorePort } from "../../store-port";
import { createMemoryHomebrewStore, type MemoryHomebrewStore } from "../../testing/memory-store";

vi.setConfig({ testTimeout: 60_000 });
afterEach(cleanup);
const m = messages.homebrew;
const s = m.subclass;
const slow = { timeout: 20_000 };
const button = (name: string | RegExp) => screen.getByRole("button", { name });
const fill = (input: Element, value: string) => fireEvent.change(input, { target: { value } });
const keys = (store: MemoryHomebrewStore) => store.snapshot().items.map((r) => r.key).sort();
const level = (n: number) => within(document.querySelector(`[data-subclass-level="${n}"]`) as HTMLElement);

async function open(store = createMemoryHomebrewStore()) {
  const pack = await store.defaultPack();
  if (!pack.ok) throw Error(pack.error);
  render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <HostPortsProvider ports={[bindHostPort(dndHomebrewStorePort, store)]}>
        <HomebrewWorkspace />
      </HostPortsProvider>
    </NextIntlClientProvider>,
  );
  return store;
}
async function start(store: MemoryHomebrewStore | undefined, parent: string, name = "Oath of Ash") {
  const s0 = await open(store);
  fireEvent.click(await screen.findByRole("button", { name: `Add ${m.kind.subclass}` }));
  fill(await screen.findByLabelText(s.parent, undefined, slow), parent);
  fill(screen.getByLabelText(m.field.nameEn), name);
  return s0;
}
function feature(at: number, name: string, text = "Ash wards you.") {
  fireEvent.click(level(at).getByRole("button", { name: s.addFeature }));
  fill(level(at).getAllByLabelText(s.featureNameEn).at(-1)!, name);
  fill(level(at).getAllByLabelText(s.featureTextEn).at(-1)!, text);
}
async function save() {
  await waitFor(() => expect(document.querySelector("[data-subclass-preview]")).not.toBeNull(), slow);
  fireEvent.click(button(m.save));
}
const ash = ["paladin/oath-of-ash", "paladin/oath-of-ash/ash-ward-l7", "paladin/oath-of-ash/oath-of-ash-l3"];

it("creates a Paladin subclass, edits one feature and re-levels it", async () => {
  const store = await start(undefined, "paladin");
  await waitFor(() => expect(document.querySelector('[data-subclass-level="20"]')).not.toBeNull(), slow);
  feature(7, "Ash Ward");
  fill(screen.getByLabelText(s.spellRef.replace("{level}", "3")), "Bless");
  fireEvent.click(screen.getAllByRole("button", { name: s.addSpell })[0]);
  await save();
  await screen.findByText("3 features", undefined, slow);
  expect(keys(store)).toEqual([...ash, "paladin/oath-of-ash/oath-of-ash-spells-l3"].sort());
  const spells = store.snapshot().items.find((r) => r.key.endsWith("spells-l3"))!;
  expect(JSON.stringify(spells.payload.entry)).toContain("{@spell bless||Bless}");

  fireEvent.click(button("Oath of Ash"));
  await waitFor(() => expect(document.querySelector('[data-subclass-level="7"]')).not.toBeNull(), slow);
  fill(level(7).getByLabelText(s.featureTextEn), "Ash wards you twice.");
  await save();
  await waitFor(() => expect(document.querySelector("[data-subclass-editor]")).toBeNull(), slow);
  const revisions = Object.fromEntries(store.snapshot().items.map((r) => [r.key, r.revision]));
  expect(revisions).toEqual({
    "paladin/oath-of-ash": 1,
    "paladin/oath-of-ash/oath-of-ash-l3": 1,
    "paladin/oath-of-ash/oath-of-ash-spells-l3": 1,
    "paladin/oath-of-ash/ash-ward-l7": 2,
  });

  fireEvent.click(button("Oath of Ash"));
  await waitFor(() => expect(document.querySelector('[data-subclass-level="7"]')).not.toBeNull(), slow);
  fill(level(7).getByLabelText(s.featureLevel), "15");
  expect(screen.getByText(s.relevel)).toBeTruthy();
  await save();
  await waitFor(() => expect(keys(store)).toContain("paladin/oath-of-ash/ash-ward-l15"), slow);
  expect(keys(store)).not.toContain("paladin/oath-of-ash/ash-ward-l7");
});

it("offers derived third-caster spellcasting to Fighter only and hides spells for Monk", async () => {
  await start(undefined, "fighter", "Ember Knight");
  const toggle = await screen.findByRole("switch", { name: s.casting }, slow);
  expect(screen.queryByText(s.spells)).toBeNull();
  fireEvent.click(toggle);
  expect(await screen.findByText(s.derivedNote)).toBeTruthy();
  expect(document.querySelectorAll("[data-derived-slots] tbody tr")).toHaveLength(18);
  expect(screen.getByText(s.spells)).toBeTruthy();
  for (const parent of ["paladin", "barbarian", "monk"]) {
    fill(screen.getByLabelText(s.parent), parent);
    await waitFor(() => expect(document.querySelector("[data-subclass-casting]")).toBeNull());
    expect(screen.queryByText(s.spells) !== null).toBe(parent === "paladin");
  }
});

it("blocks a built-in subclass name clash before writing", async () => {
  const store = await start(undefined, "paladin", "Oath of Devotion");
  await save();
  expect(await screen.findByText(/Matches built-in subclass:paladin\/oath-of-devotion/, undefined, slow)).toBeTruthy();
  expect(store.snapshot().items).toEqual([]);
});

it("checks the item limit before any write", async () => {
  const store = createMemoryHomebrewStore();
  store.usage = async () => ({ ok: true, value: { items: 299, bytes: 0, packs: 1 } });
  await start(store, "paladin");
  await save();
  expect(await screen.findByText(m.error.limitItems, undefined, slow)).toBeTruthy();
  expect(store.snapshot().items).toEqual([]);
});

it("reports a partial save when the second write fails and finishes on retry", async () => {
  const store = createMemoryHomebrewStore();
  const saveItem = store.saveItem.bind(store);
  let calls = 0;
  store.saveItem = (pack, item) => (++calls === 2 ? Promise.resolve({ ok: false, error: "network" }) : saveItem(pack, item));
  await start(store, "paladin");
  await waitFor(() => expect(document.querySelector('[data-subclass-level="7"]')).not.toBeNull(), slow);
  feature(7, "Ash Ward");
  await save();
  expect(await screen.findByText(s.partial, undefined, slow)).toBeTruthy();
  expect(keys(store)).toEqual(["paladin/oath-of-ash"]);
  await waitFor(() => expect(button(m.save)).not.toBeDisabled());
  fireEvent.click(button(m.save));
  await waitFor(() => expect(keys(store)).toEqual(ash), slow);
  expect(store.snapshot().items.every((r) => r.revision === 1)).toBe(true);
});

it("deletes a subclass with its feature rows", async () => {
  const store = await start(undefined, "paladin");
  await waitFor(() => expect(document.querySelector('[data-subclass-level="7"]')).not.toBeNull(), slow);
  feature(7, "Ash Ward");
  await save();
  const row = (await screen.findByText("2 features", undefined, slow)).parentElement!;
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
  fireEvent.click(within(row).getByRole("button", { name: m.delete }));
  await waitFor(() => expect(store.snapshot().items).toEqual([]));
  confirm.mockRestore();
});

it("opens a hand-written subclass read-only", async () => {
  const store = createMemoryHomebrewStore();
  const pack = await store.defaultPack();
  if (!pack.ok) throw Error(pack.error);
  const entry = (kind: string, id: string, name: string, meta: Record<string, unknown>) => ({
    entry: { kind, id, ref: `${kind}:${id}`, name, source: "homebrew", entries: ["Hand written."], meta },
  });
  await store.saveItem(pack.value.id, {
    kind: "subclass",
    key: "paladin/oath-of-ash",
    payload: entry("subclass", "paladin/oath-of-ash", "Oath of Ash", { parent: "paladin" }),
  } as never);
  await store.saveItem(pack.value.id, {
    kind: "subclassFeature",
    key: "paladin/oath-of-ash/ash-ward-l7",
    payload: entry("subclassFeature", "paladin/oath-of-ash/ash-ward-l7", "Ash Ward", { level: 7 }),
  } as never);
  await open(store);
  fireEvent.click(await screen.findByRole("button", { name: "Oath of Ash" }));
  await waitFor(() => expect(screen.getAllByText(m.advanced)).toHaveLength(2), slow);
  expect(document.querySelector("[data-subclass-editor]")).toBeNull();
});
