import { describe, expect, it } from "vitest";
import { displayName } from "../../sheet/play/row-text";
import type { ReferenceContextValue } from "../../sheet/use-reference-context";
import { printName, type PrintNaming } from "../print-reference";

// Made-up names: the print's naming must stay the play view's, without the print chunk importing
// row-text (which would split the sheet's play chunk).
const names = { spell: { "made-up-bolt": "虛構閃電" }, feat: { "made-up-feat": "虛構專長" } } as PrintNaming["names"];
const englishNames = { spell: { "english-only": "English Only" } } as PrintNaming["englishNames"];
const naming: PrintNaming = {
  names,
  englishNames,
  nameOf: (ref) => {
    const [kind, id] = ref.split(":");
    return (names as Record<string, Record<string, string> | undefined>)[kind]?.[id] ?? id;
  },
  token: (value) => (value === "{{i18n:wizard.trait.darkvision}}" ? "黑暗視覺" : String(value).replace(/^\{\{i18n:.*\.(\w+)\}\}$/, "$1")),
};

const rows: Array<Record<string, unknown>> = [
  { name: "我的閃電" },
  { name: "", ref: "spell:made-up-bolt" },
  { name: "玩家改名", ref: "spell:made-up-bolt" },
  { name: "Saved", ref: "spell:english-only" },
  { name: "Saved", ref: "spell:unknown-spell" },
  { name: "", ref: "spell:unknown-spell" },
  { name: "包內名", ref: "spell:made-up-bolt", origin: "pack" },
  { name: "", ref: "feat:made-up-feat", origin: "custom" },
  { name: "Saved trait", ref: "species:made-up", id: "species:made-up#darkvision" },
  { name: "Saved trait", ref: "species:made-up", id: "species:made-up#unknown" },
  { name: "Saved: Pick", ref: "feat:made-up-feat", option: "Pick", optionName: "虛構選項" },
  { name: "Saved: Pick", ref: "feat:made-up-feat", origin: "custom", option: "Pick" },
];

describe("printName", () => {
  it.each(rows.map((row, index) => [index, row] as const))("row %i names like the play view", (_, row) => {
    expect(printName(naming, row)).toBe(displayName(naming as unknown as ReferenceContextValue, row));
  });
});
