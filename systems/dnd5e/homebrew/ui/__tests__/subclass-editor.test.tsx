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
  await screen.findByText("Subclass and 3 features: 4 entries", undefined, slow);
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
    // Leaving the third caster removes the casting: only once confirmed, and asked once.
    const confirm = screen.queryByRole("button", { name: s.move.confirm });
    expect(confirm !== null).toBe(parent === "paladin");
    if (confirm) fireEvent.click(confirm);
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
  const row = (await screen.findByText("Subclass and 2 features: 3 entries", undefined, slow)).parentElement!;
  fireEvent.click(within(row).getByRole("button", { name: m.delete }));
  fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: m.delete }));
  await waitFor(() => expect(store.snapshot().items).toEqual([]));
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

const suggestions = (level: number) =>
  [...document.querySelectorAll(`#subclass-spells-${level} option`)].map((o) => (o as HTMLOptionElement).value);

it("suggests only the chosen list's castable spells and refuses one above the row's level", async () => {
  await start(undefined, "fighter", "Ember Knight");
  fireEvent.click(await screen.findByRole("switch", { name: s.casting }, slow));
  await waitFor(() => expect(suggestions(3).length).toBeGreaterThan(0));
  expect(suggestions(3)).toContain("Shield");
  expect(suggestions(3)).not.toContain("Fireball");
  expect(suggestions(3)).not.toContain("Fire Bolt");
  expect(suggestions(3)).not.toContain("Bless");
  expect(suggestions(13)).toContain("Fireball");
  const row = within(document.querySelector('[data-spell-row="3"]') as HTMLElement);
  fill(row.getByLabelText(s.spellRef.replace("{level}", "3")), "Fireball");
  expect(row.getByRole("button", { name: s.addSpell })).toBeDisabled();
  expect(row.getByRole("alert").textContent).toBe("Fireball is a level 3 spell; the class casts up to level 1 here.");

  // A parent's own list only narrows the suggestions; other lists stay one click away.
  fill(screen.getByLabelText(s.parent), "paladin");
  fireEvent.click(screen.getByRole("button", { name: s.move.confirm }));
  await waitFor(() => expect(suggestions(3)).toContain("Bless"));
  expect(suggestions(3)).not.toContain("Burning Hands");
  fireEvent.click(screen.getByLabelText(s.spellOtherLists));
  expect(suggestions(3)).toContain("Burning Hands");
  expect(suggestions(3)).not.toContain("Aid");
});

it("flags a stored spell above the castable level and blocks the save", async () => {
  const store = createMemoryHomebrewStore();
  await start(store, "paladin");
  await waitFor(() => expect(document.querySelector('[data-spell-row="3"]')).not.toBeNull(), slow);
  fill(screen.getByLabelText(s.spellRef.replace("{level}", "3")), "Bless");
  fireEvent.click(within(document.querySelector('[data-spell-row="3"]') as HTMLElement).getByRole("button", { name: s.addSpell }));
  await save();
  await waitFor(() => expect(store.snapshot().items.length).toBe(3), slow);
  // Hand-edit the stored meta so the row lists a level 3 spell at class level 3.
  const head = store.snapshot().items.find((r) => r.kind === "subclass")!;
  const saved = await store.saveItem(head.packUuid, {
    id: head.id, kind: head.kind, key: head.key, expectedRevision: head.revision,
    payload: { ...head.payload, entry: { ...head.payload.entry!, meta: { ...head.payload.entry!.meta, spells: [{ level: 3, refs: ["spell:bless", "spell:fireball"] }] } } },
  });
  expect(saved.ok).toBe(true);
  // Its generated spell table lists the spell too, as a save before the level check (v4.152.0) wrote it.
  const spells = store.snapshot().items.find((r) => r.key.endsWith("spells-l3"))!;
  const table = structuredClone(spells.payload.entry!.entries!) as [string, { rows: string[][] }];
  table[1].rows[0][1] = "{@spell bless||Bless}, {@spell fireball||Fireball}";
  const savedSpells = await store.saveItem(spells.packUuid, {
    id: spells.id, kind: spells.kind, key: spells.key, expectedRevision: spells.revision,
    payload: { ...spells.payload, entry: { ...spells.payload.entry!, entries: table } },
  });
  expect(savedSpells.ok).toBe(true);
  cleanup();
  await open(store);
  fireEvent.click(await screen.findByRole("button", { name: "Oath of Ash" }, slow));
  await waitFor(() => expect(document.querySelector('[data-spell-problem="tooHigh"]')).not.toBeNull(), slow);
  expect(document.querySelectorAll('[data-spell-row="3"] li')).toHaveLength(2);
  expect(document.querySelectorAll("[data-spell-problem]")).toHaveLength(1);
  const before = store.snapshot().items.map((r) => r.revision);
  fireEvent.click(button(m.save));
  expect(await screen.findByText(`${m.invalidFields.replace("{fields}", s.issue.spellLevel)}`)).toBeTruthy();
  expect(store.snapshot().items.map((r) => r.revision)).toEqual(before);
});

it("opens a subclass whose parent class was deleted in the form, to be re-parented and saved", async () => {
  const store = await open();
  fireEvent.click(await screen.findByRole("button", { name: `Add ${m.kind.class}` }));
  fill(await screen.findByLabelText(m.class.copyFrom, undefined, slow), "wizard");
  fill(screen.getByLabelText(m.field.nameEn), "Ember Sage");
  await waitFor(() => expect(document.querySelector("[data-class-preview]")).not.toBeNull(), slow);
  fireEvent.click(button(m.save));
  await waitFor(() => expect(document.querySelector("[data-class-editor]")).toBeNull(), slow);
  fireEvent.click(button(`Add ${m.kind.subclass}`));
  fill(await screen.findByLabelText(s.parent, undefined, slow), "ember-sage");
  fill(screen.getByLabelText(m.field.nameEn), "Circle of Cinders");
  await waitFor(() => expect(document.querySelector('[data-subclass-level="6"]')).not.toBeNull(), slow);
  feature(6, "Cinder Ward");
  await save();
  await waitFor(() => expect(keys(store)).toContain("ember-sage/circle-of-cinders/cinder-ward-l6"), slow);
  for (const r of store.snapshot().items.filter((x) => x.kind === "class" || x.kind === "classFeature")) await store.deleteItem(r.id);
  cleanup();

  await open(store);
  fireEvent.click(await screen.findByRole("button", { name: "Circle of Cinders" }, slow));
  const parent = await screen.findByLabelText(s.parent, undefined, slow);
  expect(parent).toHaveProperty("value", "");
  expect(parent.getAttribute("aria-invalid")).toBe("true");
  expect(parent).not.toBeDisabled();
  expect(screen.getByRole("alert").textContent).toBe(s.reparent);
  expect(screen.queryByText(m.advanced)).toBeNull();
  expect(screen.getByLabelText(m.field.nameEn)).toHaveProperty("value", "Circle of Cinders");

  fill(parent, "paladin");
  // Paladin has no level 6 subclass feature: the move is listed and waits for confirmation.
  const move = within(screen.getByRole("alertdialog"));
  expect(move.getByText(s.move.feature.replace("{feature}", "Cinder Ward").replace("{from}", "6").replace("{to}", "3"))).toBeTruthy();
  fireEvent.click(move.getByRole("button", { name: s.move.confirm }));
  expect(screen.queryByRole("alertdialog")).toBeNull();
  await save();
  await waitFor(
    () =>
      expect(keys(store)).toEqual(
        ["paladin/circle-of-cinders", "paladin/circle-of-cinders/circle-of-cinders-l3", "paladin/circle-of-cinders/cinder-ward-l3"].sort(),
      ),
    slow,
  );
  const ward = store.snapshot().items.find((r) => r.key.endsWith("cinder-ward-l3"))!;
  expect(ward.payload.entry!.entries).toEqual(["Ash wards you."]);
});

it("moves a draft to a class that does not fit only once confirmed, and gives the parts back on switching back", async () => {
  await start(undefined, "fighter", "Ember Knight");
  fireEvent.click(await screen.findByRole("switch", { name: s.casting }, slow));
  await waitFor(() => expect(document.querySelector('[data-subclass-level="10"]')).not.toBeNull(), slow);
  feature(10, "Glow");
  const parent = screen.getByLabelText(s.parent);
  const glowAt = (n: number) => level(n).queryAllByLabelText(s.featureNameEn).some((el) => (el as HTMLInputElement).value === "Glow");

  fill(parent, "paladin");
  const move = within(screen.getByRole("alertdialog"));
  expect(move.getByText(s.move.casting.replace("{parent}", "Paladin"))).toBeTruthy();
  expect(move.getByText(s.move.feature.replace("{feature}", "Glow").replace("{from}", "10").replace("{to}", "3"))).toBeTruthy();
  // Nothing changed yet.
  expect(screen.getByRole("switch", { name: s.casting })).toHaveProperty("checked", true);
  expect(glowAt(10)).toBe(true);
  fireEvent.click(move.getByRole("button", { name: m.cancel }));
  expect(screen.queryByRole("alertdialog")).toBeNull();
  expect(parent).toHaveProperty("value", "fighter");

  fill(parent, "paladin");
  fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: s.move.confirm }));
  await waitFor(() => expect(document.querySelector('[data-subclass-level="20"]')).not.toBeNull(), slow);
  expect(screen.queryByRole("switch", { name: s.casting })).toBeNull();
  expect(glowAt(3)).toBe(true);

  // Back to a third caster with a level 10 subclass feature: casting and the feature level come back, no question asked.
  fill(parent, "fighter");
  expect(screen.queryByRole("alertdialog")).toBeNull();
  await waitFor(() => expect(screen.getByRole("switch", { name: s.casting })).toHaveProperty("checked", true), slow);
  expect(glowAt(10)).toBe(true);
});

it("previews one header block, then the features, with — for empty slots", async () => {
  await start(undefined, "fighter", "Ember Knight");
  fireEvent.click(await screen.findByRole("switch", { name: s.casting }, slow));
  feature(3, "Flare");
  await waitFor(() => expect(document.querySelector("[data-subclass-preview]")).not.toBeNull(), slow);
  const preview = within(document.querySelector("[data-subclass-preview]") as HTMLElement);
  expect(document.querySelectorAll("[data-subclass-preview-head]")).toHaveLength(1);
  expect(preview.getAllByText("Ember Knight")).toHaveLength(1);
  const features = [...document.querySelectorAll("[data-subclass-preview-feature] strong")].map((el) => el.firstChild!.textContent);
  expect(features).toEqual(["Ember Knight Spellcasting", "Flare"]);
  const row3 = [...document.querySelectorAll("[data-subclass-preview] tbody tr")][0];
  expect([...row3.querySelectorAll("td")].map((td) => td.textContent)).toEqual(["3", "2", "—", "—", "—"]);
});
