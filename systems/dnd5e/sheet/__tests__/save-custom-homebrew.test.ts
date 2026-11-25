import { expect, it } from "vitest";
import { loadBuiltinIdentity, loadOpenPackSchemaCheck } from "../../content-pack/open/load";
import { validateOpenPackText } from "../../content-pack/open/validate-open-pack";
import { exportHomebrewPack } from "../../homebrew/domain/assemble";
import { createMemoryHomebrewStore } from "../../homebrew/testing/memory-store";
import { saveCustomHomebrew } from "../custom-entry-form";

it("keeps a player's Fireball as a distinct spell after pack validation", async () => {
  const store = createMemoryHomebrewStore();
  const row = await saveCustomHomebrew(store, "spells", { name: "Fireball", text: "My version." }, "en");
  expect(row.ref).toMatch(/^spell:hb-/);
  const { packs, items } = store.snapshot();
  const identity = await loadBuiltinIdentity();
  const checked = await validateOpenPackText(await exportHomebrewPack(packs[0], items), {
    builtinRefs: identity.refs, builtinNameKeys: identity.nameKeys, schema: await loadOpenPackSchemaCheck(),
  });
  expect(checked.ok && checked.pack.entries.map((entry) => entry.ref)).toEqual([row.ref]);
}, 30_000);
