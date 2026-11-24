import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import systemZh from "@skald/system-dnd5e/data/dnd5e-2024/messages/zh-TW.json";
import appZh from "@skald/sheet-sdk/messages/zh-TW.json";
import { localizeEntry } from "../../reference/sources";
import { ReferenceDialog } from "../reference-dialog";
import type { ReferenceContextValue } from "../use-reference-context";

const alarm = localizeEntry(
  {
    ref: "spell:alarm",
    kind: "spell",
    id: "alarm",
    name: "Alarm",
    entries: ["You set an alarm against intrusion."],
    meta: { level: 1, components: { v: true, s: true, m: true, mText: "a bell and silver wire" } },
  } as never,
  { name: "警報術", entries: ["你設下防止入侵的警報。"], material: "一個鈴鐺和一段銀線" },
  "zh-TW",
  "srd",
);

const context = {
  locale: "zh-TW",
  names: { spell: { alarm: "警報術" } },
  englishNames: { spell: { alarm: "Alarm" } },
  nameOf: () => "警報術",
  resolveRef: (ref: string) => ref,
  sources: { resolve: async () => alarm },
  gameSpells: new Map(),
  packRefs: new Set(),
  packSupplier: () => undefined,
  packText: null,
  token: (value: unknown) => String(value),
} as unknown as ReferenceContextValue;

describe("ReferenceDialog", () => {
  it("shows the requested entry when it mounts with the request (the sheet loads it on first open)", async () => {
    render(
      <NextIntlClientProvider locale="zh-TW" messages={{ ...appZh, ...systemZh }} timeZone="UTC">
        <ReferenceDialog request={{ mode: "ref", ref: "spell:alarm" }} context={context} onClose={() => {}} />
      </NextIntlClientProvider>,
    );
    expect(await screen.findByText("你設下防止入侵的警報。")).toBeInTheDocument();
    expect(screen.getByText(/一個鈴鐺和一段銀線/)).toBeInTheDocument();
  });
});

/** A class entry with its progression table (made-up rows), for the level highlight (T2b-F F005). */
const sampleClass = localizeEntry(
  {
    ref: "class:wizard",
    kind: "class",
    id: "wizard",
    name: "Wizard",
    entries: [{ type: "table", colLabels: ["Level", "Class Features"], rows: [[1, "Alpha"], [2, "Beta"], [3, "Gamma"]] }],
    meta: {},
  } as never,
  undefined,
  "zh-TW",
  "srd",
);
const classContext = { ...context, nameOf: () => "法師", sources: { resolve: async () => sampleClass } } as unknown as ReferenceContextValue;

describe("ReferenceDialog level highlight (T2b-F F005)", () => {
  it.each([
    ["a row", { mode: "row", row: { list: "features", name: "法師", ref: "class:wizard", origin: "srd", text: "" }, level: 2 }],
    ["a ref", { mode: "ref", ref: "class:wizard", level: 2 }],
  ] as const)("highlights the character's level when %s opens a class", async (_, request) => {
    render(
      <NextIntlClientProvider locale="zh-TW" messages={{ ...appZh, ...systemZh }} timeZone="UTC">
        <ReferenceDialog request={request} context={classContext} onClose={() => {}} />
      </NextIntlClientProvider>,
    );
    expect(await screen.findByText("Beta")).toBeInTheDocument();
    expect(document.querySelector("tr[data-highlight]")).toHaveTextContent("Beta");
  });
});
