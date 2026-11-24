import { beforeAll, describe, expect, it } from "vitest";
import { readCompiledFormulaArtifact, type CompiledFormulaArtifact } from "@skald/formula";
import items from "@skald/system-dnd5e/data/dnd5e-2024/economy/items.json";
import { compileBuiltinFixtureArtifact } from "@skald/sheet-sdk/modules/templates/sheet-artifact";
import { evaluateCharacterFormulaRuntime, withSchemaInputDefaults } from "@skald/sheet-sdk/modules/sheet-schema";
import type { BuiltinLocalSystemData } from "@skald/sheet-sdk/modules/systems";
import { loadDnd5e2024Data } from "../../../data-access/builtin-local-data";
import type { Catalog } from "../catalog";
import { toggleEquipped } from "../equip";

/** Equipping writes the AC inputs; the sheet's own `ac` formula then gives the SRD numbers (plan-uat2 §5 W2). */

type Data = Record<string, unknown>;
const catalog = items as unknown as Catalog;
let local: BuiltinLocalSystemData;
let artifact: CompiledFormulaArtifact;

beforeAll(async () => {
  local = await loadDnd5e2024Data();
  const { compiledArtifact } = compileBuiltinFixtureArtifact("dnd5e-2024", local);
  const read = readCompiledFormulaArtifact((compiledArtifact as { formulas: unknown }).formulas);
  if (!read) throw new Error("no formulas");
  artifact = read;
});

function ac(data: Data): unknown {
  const runtime = withSchemaInputDefaults({ templateVersionId: "test", artifact, derivedOverrides: {} }, local.schema);
  const result = evaluateCharacterFormulaRuntime(runtime, { ...structuredClone(local.defaultData), ...data });
  expect(result.issues).toEqual([]);
  return result.derivedValues.ac;
}

const row = (id: string, ref: string, bonus = 0) => ({ id, name: id, qty: 1, ref, equipped: false, bonus });
const wear = (data: Data, ...indexes: number[]) => indexes.reduce((next, index) => toggleEquipped(next, index, catalog).data, data);
const dex3 = { dex: 16, con: 14, wis: 14 };

describe("AC follows the equipped armor (plan-uat2 §3.3, SRD 5.2.1 p.92)", () => {
  it("leather + Dex 3 = 14; half plate + Dex 3 = 17 (Dex capped at 2)", () => {
    expect(ac(wear({ ...dex3, equipment: [row("leather", "baseItem:leather-armor")] }, 0))).toBe(14);
    expect(ac(wear({ ...dex3, equipment: [row("half", "baseItem:half-plate-armor")] }, 0))).toBe(17);
  });

  it("plate +1 and a +1 shield = 22", () => {
    expect(ac(wear({ ...dex3, equipment: [row("plate", "baseItem:plate-armor", 1), row("shield", "baseItem:shield", 1)] }, 0, 1))).toBe(22);
  });

  it("a monk who takes the armor off is back on Unarmored Defense", () => {
    const monk = wear({ ...dex3, unarmoredDefense: "monk", equipment: [row("leather", "baseItem:leather-armor")] }, 0, 0);
    expect(monk.armorType).toBe("none");
    expect(ac(monk)).toBe(15);
  });

  it("swapping body armor changes AC to the new armor's", () => {
    const data = wear({ ...dex3, equipment: [row("shirt", "baseItem:chain-shirt"), row("plate", "baseItem:plate-armor")] }, 0);
    expect(ac(data)).toBe(15);
    expect(ac(wear(data, 1))).toBe(18);
  });
});
