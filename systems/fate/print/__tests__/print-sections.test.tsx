import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { expect, it } from "vitest";
import { loadFatePresetCatalog, loadFatePresetLabels } from "../../domain/presets";
import { loadFatePrintMessages } from "../print-messages";
import { buildFatePrintModel } from "../print-model";
import { FatePrintAspects, FatePrintHarm, FatePrintIdentity, FatePrintStunts } from "../print-sections";

const [catalog, labels, messages] = await Promise.all([
  loadFatePresetCatalog(), loadFatePresetLabels("en"), loadFatePrintMessages("en"),
]);

function renderSection(node: React.ReactNode) {
  return render(<NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">{node}</NextIntlClientProvider>);
}

function project(data: Parameters<typeof buildFatePrintModel>[0], blanks = false) {
  return { model: buildFatePrintModel(data, undefined, catalog, blanks), labels, blanks };
}

it.each([true, false])("leaves Fate Points empty for pencil and keeps a named character's refresh (blanks=%s)", blanks => {
  const { container } = renderSection(<FatePrintIdentity {...project({ name: "Morgan", fatePoints: 7, refresh: 3 }, blanks)} portrait={null} />);
  expect(container.querySelector(".fate-print-points")).toHaveTextContent(/^Fate Points$/);
  expect(container.querySelector(".fate-print-refresh")).toHaveTextContent("3");
  const circles = container.querySelectorAll(".fate-print-circles [data-track-cell]");
  expect(circles).toHaveLength(3);
  for (const circle of circles) expect(circle).toBeEmptyDOMElement();
});

it("uses a number-only meter for refresh above six", () => {
  const { container } = renderSection(<FatePrintIdentity {...project({ refresh: 8 })} portrait={null} />);
  expect(container.querySelector(".fate-print-refresh")).toHaveTextContent("8");
  expect(container.querySelectorAll(".fate-print-circles [data-track-cell]")).toHaveLength(0);
});

it("segments the blank stunt area and moves the populated ledger under the banner", () => {
  const blank = project({}, true).model;
  const { container, rerender } = renderSection(<FatePrintStunts model={blank} from={0} to={0} />);
  expect(container.querySelectorAll(".fate-print-stunt-lines > div")).toHaveLength(3);
  const ledger = container.querySelector(".fate-print-accounting")!;
  expect(ledger).toHaveTextContent(/stunts:.*free.*refresh cost:.*base refresh:.*earned:/i);
  expect(ledger.textContent).not.toMatch(/\d/);
  expect(ledger.querySelectorAll(".fate-print-ledger-gap")).toHaveLength(5);
  const populated = project({ stunts: { stunts: [{ id: "one", type: "custom", customText: "Once around" }] } }).model;
  rerender(<NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
    <FatePrintStunts model={populated} from={0} to={1} />
  </NextIntlClientProvider>);
  expect(container).toHaveTextContent(/base refresh.*earned/i);
  expect(container.querySelector(".fate-print-accounting")).toHaveTextContent(/stunts: 1 \(3 free\) · refresh cost: 0/i);
  expect(container.querySelectorAll(".fate-print-ledger-gap")).toHaveLength(0);
});

it("leaves unmarked single condition boxes unnumbered, preserving marks and multi-box indices", () => {
  const props = project({ fateV2: {
    preset: { id: "condensed-standard", version: 1, selection: { injuries: "conditions" } },
    harm: { conditions: { "scared:1": { text: "Startled" } } },
  } });
  const { container } = renderSection(<FatePrintHarm {...props} model={{ ...props.model, conditions: [
    ...props.model.conditions,
    { id: "multi", value: 1, boxes: [{ index: 1, marked: false, text: "" }, { index: 2, marked: false, text: "" }] },
  ] }} />);
  expect(container.querySelector('[data-fate-print-condition="hurt"] .fate-print-box')).toBeEmptyDOMElement();
  expect(container.querySelector('[data-fate-print-condition="scared"] .fate-print-box')).toHaveTextContent("×");
  expect([...container.querySelectorAll('[data-fate-print-condition="multi"] .fate-print-box')].map(el => el.textContent)).toEqual(["1", "2"]);
});

it("prints one Stress label with unified stress, retaining both split track labels", () => {
  const unified = project({ fateV2: { preset: { id: "condensed-standard", version: 1, selection: { stress: "unified" } } } });
  const { getAllByText, container } = renderSection(<>
    <FatePrintHarm {...unified} />
    <FatePrintHarm {...project({})} />
  </>);
  expect(getAllByText("Stress", { exact: true })).toHaveLength(2);
  for (const id of ["physical", "mental"]) {
    expect(container.querySelector(`[data-fate-print-stress="${id}"] dt`)).toHaveTextContent(labels.tracks[id]);
  }
});

it("only prints free invokes for visible aspects with a positive count", () => {
  const { container } = renderSection(<FatePrintAspects {...project({ aspects: { format: 2, aspects: [
    { id: "highConcept", kind: "highConcept", text: "Sky pilot", freeInvokes: 0 },
    { id: "deck", kind: "situation", text: "Deck fire", freeInvokes: 2 },
    { id: "trouble", kind: "trouble", text: "Hidden debt", labelOverride: "Hidden label", secret: true, freeInvokes: 3 },
  ] } })} />);
  expect([...container.querySelectorAll("small")].map(el => el.textContent)).toEqual([expect.stringMatching(/free invokes.*2/i)]);
  expect(container.querySelector('[data-fate-print-aspect="trouble"] dd')).toHaveTextContent(/^Secret$/);
  expect(container.innerHTML).not.toMatch(/Hidden debt|Hidden label/);
});

it("prints all fixed aspect slots with blanks on or off", () => {
  const data = { aspects: { format: 2, aspects: [] } };
  const doc = (blanks: boolean) => <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
    <FatePrintAspects {...project(data, blanks)} />
  </NextIntlClientProvider>;
  const { container, rerender } = render(doc(true));
  for (const blanks of [true, false]) {
    rerender(doc(blanks));
    expect([...container.querySelectorAll("[data-fate-print-aspect]")].map(el => el.textContent)).toEqual([
      "High Concept", "Trouble", "Relationship", "Free Aspect", "Free Aspect", "Situation AspectFree invokes",
    ]);
    expect(container.querySelectorAll(".fate-print-line")).toHaveLength(6);
    expect(container.querySelectorAll(".fate-print-invokes [data-track-cell]")).toHaveLength(3);
  }
});
