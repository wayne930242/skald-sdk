import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PackTextIndex } from "../../../content-pack/domain/overlay";
import type { ValidatedPack } from "../../../content-pack/domain/types";
import type { ReferenceContextValue } from "../../use-reference-context";
import { useRowText, withPackRowText } from "../row-text";

const pack = {
  manifest: { systemId: "dnd5e-2024", packId: "sample", packVersion: "v", requiresBuiltin: "", payloadSha256: "", counts: {}, notice: "" },
  entries: [{ kind: "feat", id: "sample-feat", ref: "feat:sample-feat", name: "Sample Feat", entries: ["Pack words."], meta: {} }],
  zhTW: {},
  wizard: {},
  overlays: {},
} as unknown as ValidatedPack;

function context(withPack: boolean): ReferenceContextValue {
  return { locale: "en", packText: withPack ? new PackTextIndex(pack, "en") : null, srdSource: { resolve: async () => null } } as unknown as ReferenceContextValue;
}

// D9: a table copy's pack row holds ref, name and origin only.
const copyRow = { id: "f1", name: "Sample Feat", ref: "feat:sample-feat", origin: "pack" };

describe("a table copy's pack row (D9)", () => {
  it("shows the text of the viewer's own pack", () => {
    const { result } = renderHook(() => useRowText(context(true), copyRow));
    expect(result.current).toEqual({ text: "Pack words.", loading: false });
    expect(withPackRowText(context(true), copyRow)).toEqual({ ...copyRow, text: "Pack words." });
  });

  it("shows no text without the pack, and never reads the SRD corpus for it", () => {
    const { result } = renderHook(() => useRowText(context(false), copyRow));
    expect(result.current).toEqual({ text: null, loading: false });
    expect(withPackRowText(context(false), copyRow)).toBe(copyRow);
  });

  it("keeps the player's own text and a saved snapshot first", () => {
    const own = renderHook(() => useRowText(context(true), { ...copyRow, playerText: "Mine." }));
    expect(own.result.current.text).toBe("Mine.");
    const snap = { ...copyRow, text: "Snapshot." };
    expect(withPackRowText(context(true), snap)).toBe(snap);
  });
});
