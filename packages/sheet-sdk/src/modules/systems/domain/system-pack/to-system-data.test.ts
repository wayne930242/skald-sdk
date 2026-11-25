import { describe, expect, it } from "vitest";
import { minimalPackContent, sealed } from "./__fixtures__/minimal-pack";
import { parseSystemPack } from "./parse";
import { ruleNodesPlainText } from "./rule-nodes";
import { toSystemData } from "./to-system-data";

async function minimalPack() {
  const { pack } = await parseSystemPack(await sealed(minimalPackContent()));
  if (!pack) throw new Error("fixture refused");
  return pack;
}

describe("toSystemData", () => {
  it("maps the pack to a generic system config under the host's slug", async () => {
    const pack = await minimalPack();
    const { config } = toSystemData(pack, "sp-0123456789ab");
    expect(config).toEqual({
      id: "sp-0123456789ab",
      name: "Test Game",
      version: "1.0.0",
      category: "other",
      description: "A test system.",
      sheetComponent: "generic",
      schema: "schema",
      template: "template",
      defaultData: "default-data",
    });
    expect(toSystemData(pack).config.id).toBe("test-game");
  });

  it("carries the sheet parts and game data as built-in local data", async () => {
    const pack = await minimalPack();
    const { data } = toSystemData(pack);
    expect(data.schema).toBe(pack.system.schema);
    expect(data.template).toBe(pack.system.template);
    expect(data.defaultData).toEqual({ name: "", might: 1 });
    expect(data.dsl?.rollRules).toBeDefined();
    expect(data.gameData).toEqual({ origins: [{ id: "farmer", label: "Farmer" }] });
    expect("wizard" in data).toBe(false);
    expect("fieldMigration" in data).toBe(false);
  });

  it("lists sections, collections and entries in order", async () => {
    const { documents } = toSystemData(await minimalPack());
    expect(documents.map(({ kind, collection, key, parentKey, position }) => ({ kind, collection, key, parentKey, position }))).toEqual([
      { kind: "section", collection: null, key: "basics", parentKey: null, position: 0 },
      { kind: "section", collection: null, key: "combat", parentKey: "basics", position: 1 },
      { kind: "collection", collection: null, key: "moves", parentKey: null, position: 0 },
      { kind: "entry", collection: "moves", key: "strike", parentKey: null, position: 0 },
    ]);
    const entry = documents[3];
    expect(entry).toMatchObject({ title: "Strike", collectionTitle: "Moves", summary: "Hit something.", tags: ["combat"] });
    expect(ruleNodesPlainText(documents[0].blocks)).toBe("Roll 2d6. See Combat and Strike .");
  });
});
