import { describe, expect, it, vi } from "vitest";
import { singlePackView } from "../../content-pack/domain/effective";
import type { ValidatedPack } from "../../content-pack/domain/types";
import type { DndPackSource } from "../../sheet/pack-source-port";
import { devicePackLoader } from "../device-pack";

/**
 * Open-source plan T6: the print reads this device's packs only through `dndPackSourcePort`, from
 * the cache, and only when a row asks; without the port a pack row prints its name and a notice.
 */

const pack: ValidatedPack = {
  manifest: { systemId: "dnd5e-2024", packId: "sample", packVersion: "1", requiresBuiltin: "", payloadSha256: "", counts: {}, notice: "" },
  entries: [{ ref: "feat:whittler", kind: "feat", id: "whittler", name: "Whittler", entries: ["Craft faster."], meta: {} }],
  zhTW: {},
  wizard: {},
  overlays: {},
};

describe("the print's device pack", () => {
  it("resolves pack rows from the port's cached view, read on the first call", async () => {
    const source: DndPackSource = { readCached: vi.fn(async () => singlePackView("sample", pack)), revalidate: vi.fn() };
    const load = devicePackLoader(source);
    expect(source.readCached).not.toHaveBeenCalled();
    const reference = await load();
    expect(source.readCached).toHaveBeenCalledTimes(1);
    expect(source.revalidate).not.toHaveBeenCalled();
    expect(await reference!.resolve("feat:whittler", "en")).toMatchObject({ name: "Whittler" });
    expect(await reference!.resolve("feat:alert", "en")).toBeNull();
  });

  it("answers null without the port or without a cached pack", async () => {
    expect(await devicePackLoader(null)()).toBeNull();
    const empty: DndPackSource = { readCached: async () => null, revalidate: async () => null };
    expect(await devicePackLoader(empty)()).toBeNull();
  });
});
