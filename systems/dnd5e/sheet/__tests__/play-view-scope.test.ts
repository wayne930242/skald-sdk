import { describe, expect, it } from "vitest";
import type { LoadedSystem } from "@skald/types/system";
import schema from "@skald/system-dnd5e/data/dnd5e-2024/schema.json";
import { supportsPlayView } from "../dnd-sheet-adapter";

const system = (runtime: LoadedSystem["runtime"]) => ({ schema, runtime }) as unknown as LoadedSystem;
const runtime = { systemId: "s", templateVersionId: "v" };

describe("supportsPlayView", () => {
  it("offers the play view for the built-in D&D template", () => {
    expect(supportsPlayView(system({ ...runtime, builtinTemplate: true }))).toBe(true);
  });

  it("keeps the template layout for a fork or user template with the same fields", () => {
    expect(supportsPlayView(system({ ...runtime, builtinTemplate: false }))).toBe(false);
    expect(supportsPlayView(system(runtime))).toBe(false);
    expect(supportsPlayView(system(undefined))).toBe(false);
  });
});
