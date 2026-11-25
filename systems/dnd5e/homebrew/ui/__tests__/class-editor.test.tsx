import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@skald/system-dnd5e/data/dnd5e-2024/messages/homebrew/en.json";
import { bindHostPort, HostPortsProvider } from "@skald/sheet-sdk/modules/systems/ui/host-ports";
import { MULTICLASS_RULES, multiclassRulesOf } from "../../../reference/multiclass";
import { HomebrewWorkspace } from "../workspace";
import { dndHomebrewStorePort } from "../../store-port";
import { createMemoryHomebrewStore, type MemoryHomebrewStore } from "../../testing/memory-store";

vi.setConfig({ testTimeout: 60_000 });
afterEach(cleanup);
const m = messages.homebrew;
const c = m.class;
const slow = { timeout: 20_000 };
const button = (name: string | RegExp) => screen.getByRole("button", { name });
const fill = (input: Element, value: string) => fireEvent.change(input, { target: { value } });
const items = (store: MemoryHomebrewStore) => store.snapshot().items;
const keys = (store: MemoryHomebrewStore) => items(store).map((r) => r.key).sort();
const level = (n: number) => within(document.querySelector(`[data-class-level="${n}"]`) as HTMLElement);
const WIZARD_GENERATED = [
  "spellcasting-l1", "ember-sage-subclass-l3", "ability-score-improvement-l4", "subclass-feature-l6", "ability-score-improvement-l8",
  "subclass-feature-l10", "ability-score-improvement-l12", "subclass-feature-l14", "ability-score-improvement-l16", "epic-boon-l19",
].map((leaf) => `ember-sage/${leaf}`);

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
async function start(store: MemoryHomebrewStore | undefined, from: string, name = "Ember Sage") {
  const s0 = await open(store);
  fireEvent.click(await screen.findByRole("button", { name: `Add ${m.kind.class}` }));
  fill(await screen.findByLabelText(c.copyFrom, undefined, slow), from);
  fill(screen.getByLabelText(m.field.nameEn), name);
  return s0;
}
async function save() {
  await waitFor(() => expect(document.querySelector("[data-class-preview]")).not.toBeNull(), slow);
  fireEvent.click(button(m.save));
}
const closed = () => waitFor(() => expect(document.querySelector("[data-class-editor]")).toBeNull(), slow);
async function reopen(name = "Ember Sage") {
  fireEvent.click(await screen.findByRole("button", { name }, slow));
  await waitFor(() => expect(document.querySelector("[data-class-preview]")).not.toBeNull(), slow);
}
function feature(at: number, name: string) {
  fireEvent.click(level(at).getByRole("button", { name: c.addFeature }));
  fill(level(at).getAllByLabelText(m.subclass.featureNameEn).at(-1)!, name);
  fill(level(at).getAllByLabelText(m.subclass.featureTextEn).at(-1)!, `${name} text.`);
}

it("copies Wizard, saves generated rows, then edits, re-levels and changes the ASI ladder", async () => {
  const store = await start(undefined, "wizard");
  expect(screen.getByLabelText(c.castingKind)).toHaveProperty("value", "full");
  await save();
  await closed();
  expect(keys(store)).toEqual(["ember-sage", ...WIZARD_GENERATED].sort());
  expect(items(store).filter((r) => r.kind === "classFeature").every((r) => r.payload.entry!.meta!.generated)).toBe(true);
  expect(screen.getByText(`${WIZARD_GENERATED.length} features`)).toBeTruthy();

  await reopen();
  expect(document.querySelectorAll("[data-class-table] tbody tr")).toHaveLength(20);
  feature(2, "Ember Sight");
  await save();
  await closed();
  const revisions = () => Object.fromEntries(items(store).map((r) => [r.key, r.revision]));
  expect(keys(store)).toContain("ember-sage/ember-sight-l2");
  // The class row's table names the new feature; every feature row before stays at revision 1.
  expect(revisions()).toMatchObject({ "ember-sage": 2, ...Object.fromEntries(WIZARD_GENERATED.map((k) => [k, 1])) });

  await reopen();
  fill(level(2).getByLabelText(m.subclass.featureLevel), "7");
  expect(screen.getByText(m.subclass.relevel)).toBeTruthy();
  fill(screen.getByLabelText(c.asi), "fighter");
  await save();
  await closed();
  expect(keys(store)).toContain("ember-sage/ember-sight-l7");
  expect(keys(store)).not.toContain("ember-sage/ember-sight-l2");
  expect(keys(store)).toEqual(expect.arrayContaining(["ember-sage/ability-score-improvement-l6", "ember-sage/ability-score-improvement-l14"]));
  expect(keys(store)).toHaveLength(1 + WIZARD_GENERATED.length + 2 + 1);
});

it("stores a borrowed list and the copied multiclass rules, read back as known rules", async () => {
  const store = await start(undefined, "rogue", "Shade");
  expect(screen.getByLabelText(c.castingKind)).toHaveProperty("value", "none");
  fill(screen.getByLabelText(c.castingKind), "full");
  fill(screen.getByLabelText(c.list), "druid");
  await save();
  await closed();
  const meta = items(store).find((r) => r.kind === "class")!.payload.entry!.meta!;
  expect(meta.spellcasting).toMatchObject({ progression: "full", list: "druid" });
  expect(meta.multiclass).toEqual(MULTICLASS_RULES.rogue);
  expect(multiclassRulesOf("shade", meta)).toEqual({ ...MULTICLASS_RULES.rogue, known: true });

  // Round trip: the saved class opens as an editable form, and an edit to the block is stored.
  await reopen("Shade");
  const block = within(document.querySelector("[data-class-multiclass]") as HTMLElement);
  fireEvent.click(block.getByLabelText(c.mcMartial));
  fill(block.getByLabelText(c.mcMode), "any");
  await save();
  await closed();
  const next = items(store).find((r) => r.kind === "class")!.payload.entry!.meta!.multiclass as typeof MULTICLASS_RULES.rogue;
  expect(next).toEqual({ ...MULTICLASS_RULES.rogue, requires: { ...MULTICLASS_RULES.rogue.requires, mode: "any" }, gains: { ...MULTICLASS_RULES.rogue.gains, weapons: ["martial"] } });
});

it("blocks a built-in class name clash before writing", async () => {
  const store = await start(undefined, "wizard", "Wizard");
  await save();
  expect(await screen.findByText(/Matches built-in class:wizard/, undefined, slow)).toBeTruthy();
  expect(items(store)).toEqual([]);
});

it("checks the item limit before any write", async () => {
  const store = createMemoryHomebrewStore();
  store.usage = async () => ({ ok: true, value: { items: 295, bytes: 0, packs: 1 } });
  await start(store, "wizard");
  await save();
  expect(await screen.findByText(m.error.limitItems, undefined, slow)).toBeTruthy();
  expect(items(store)).toEqual([]);
});

it("reports a partial save when the third write fails and finishes on retry", async () => {
  const store = createMemoryHomebrewStore();
  const saveItem = store.saveItem.bind(store);
  let calls = 0;
  store.saveItem = (pack, item) => (++calls === 3 ? Promise.resolve({ ok: false, error: "network" }) : saveItem(pack, item));
  await start(store, "wizard");
  await save();
  expect(await screen.findByText(c.partial, undefined, slow)).toBeTruthy();
  expect(items(store)).toHaveLength(2);
  await waitFor(() => expect(button(m.save)).not.toBeDisabled());
  fireEvent.click(button(m.save));
  await closed();
  expect(keys(store)).toEqual(["ember-sage", ...WIZARD_GENERATED].sort());
  expect(items(store).every((r) => r.revision === 1)).toBe(true);
});

it("offers the saved class as a subclass parent and under a spell's classes, and deletes it naming its subclasses", async () => {
  const store = await start(undefined, "wizard");
  await save();
  await closed();

  fireEvent.click(button(`Add ${m.kind.subclass}`));
  const parent = await screen.findByLabelText(m.subclass.parent, undefined, slow);
  expect(within(parent).getByRole("option", { name: "Ember Sage" })).toBeTruthy();
  fill(parent, "ember-sage");
  fill(screen.getByLabelText(m.field.nameEn), "Circle of Cinders");
  await waitFor(() => expect(document.querySelector("[data-subclass-preview]")).not.toBeNull(), slow);
  fireEvent.click(button(m.save));
  await waitFor(() => expect(keys(store)).toContain("ember-sage/circle-of-cinders"), slow);

  fireEvent.click(await screen.findByRole("button", { name: `Add ${m.kind.spell}` }, slow));
  fireEvent.click(await screen.findByRole("button", { name: `Add ${m.field.classes}` }));
  const classes = screen.getAllByLabelText(m.field.classes).find((el) => el.tagName === "SELECT")!;
  expect(within(classes).getByRole("option", { name: "Ember Sage" })).toHaveProperty("value", "ember-sage");

  const row = screen.getByText(`${WIZARD_GENERATED.length} features`).parentElement!;
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
  fireEvent.click(within(row).getByRole("button", { name: m.delete }));
  await waitFor(() => expect(keys(store)).toEqual(["ember-sage/circle-of-cinders", "ember-sage/circle-of-cinders/circle-of-cinders-l3"].sort()));
  expect(confirm.mock.calls[0][0]).toContain("Circle of Cinders");
  confirm.mockRestore();
});

it("opens a hand-written class read-only", async () => {
  const store = createMemoryHomebrewStore();
  const pack = await store.defaultPack();
  if (!pack.ok) throw Error(pack.error);
  const entry = (kind: string, id: string, name: string, meta: Record<string, unknown>) => ({
    entry: { kind, id, ref: `${kind}:${id}`, name, source: "homebrew", entries: ["Hand written."], meta },
  });
  await store.saveItem(pack.value.id, { kind: "class", key: "hand", payload: entry("class", "hand", "Hand Class", { hitDie: 8 }) } as never);
  await store.saveItem(pack.value.id, {
    kind: "classFeature", key: "hand/grip-l2", payload: entry("classFeature", "hand/grip-l2", "Grip", { level: 2 }),
  } as never);
  await open(store);
  expect(await screen.findByText("1 feature", undefined, slow)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Hand Class" }));
  await waitFor(() => expect(screen.getAllByText(m.advanced)).toHaveLength(2), slow);
  expect(document.querySelector("[data-class-editor]")).toBeNull();
});
