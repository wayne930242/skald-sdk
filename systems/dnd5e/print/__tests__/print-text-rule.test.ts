import { describe, expect, it, vi } from "vitest";
import * as rowBody from "../../sheet/play/row-body";
import { bodySource } from "../print-text";

vi.mock("../../sheet/play/row-body", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../sheet/play/row-body")>();
  return { ...actual, rowBodyText: vi.fn(actual.rowBodyText) };
});

/**
 * Print reads a row's own text through the sheet's rule (`rowBodyText`, plan-uat2 §3.4), so play,
 * edit and print cannot drift: only a row the rule leaves empty goes on to the pack cache or the
 * SRD corpus.
 */
describe("print text rule", () => {
  it("takes the row's own text from rowBodyText", () => {
    const rows = [
      { ref: "spell:shield", origin: "srd", playerText: "我的護盾", text: "" },
      { ref: "spell:shield", origin: "srd", playerText: "  ", text: "存下的" },
      { ref: "spell:x", origin: "pack", text: "內容包快照" },
    ];
    for (const row of rows) {
      vi.mocked(rowBody.rowBodyText).mockClear();
      const source = bodySource(row);
      expect(rowBody.rowBodyText).toHaveBeenCalledWith(row, null);
      expect(source).toEqual({ kind: "own", text: rowBody.rowBodyText(row, null) });
    }
  });
});
