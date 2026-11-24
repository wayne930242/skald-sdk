import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { expect, it, vi } from "vitest";
import type { PrintDocumentProps } from "@skald/sheet-sdk/modules/systems/ui/system-print";
import { loadFatePresetCatalog, loadFatePresetLabels } from "../../domain/presets";
import { FatePrintDocument } from "../fate-print-document";
import { loadFatePrintMessages } from "../print-messages";

vi.mock("../../domain/presets", { spy: true });
vi.mock("../print-messages", { spy: true });

it("only reports ready once messages, catalog, labels and the current portrait settle", async () => {
  const messages = await loadFatePrintMessages("en");
  const catalog = await loadFatePresetCatalog();
  const labels = await loadFatePresetLabels("en");
  const pendingMessages = Promise.withResolvers<typeof messages>();
  const pendingCatalog = Promise.withResolvers<typeof catalog>();
  const pendingLabels = Promise.withResolvers<typeof labels>();
  const messagesLoader = vi.mocked(loadFatePrintMessages).mockReturnValue(pendingMessages.promise);
  const catalogLoader = vi.mocked(loadFatePresetCatalog).mockReturnValue(pendingCatalog.promise);
  const labelsLoader = vi.mocked(loadFatePresetLabels).mockReturnValue(pendingLabels.promise);
  const onReadyChange = vi.fn();
  const meta = { id: "fate-condensed", name: "Fate Condensed", version: "2.0.0" };
  const props: Omit<PrintDocumentProps, "data"> = {
    schema: { ...meta, $schema: "skald/schema/v1", fields: {} },
    template: { ...meta, $schema: "skald/template/v1", schemaId: meta.id, schemaVersion: meta.version, pages: [] },
    locale: "en", paper: "A4", blanks: false, editable: true, setupMode: false, onReadyChange,
  };
  const doc = (portrait: string) => (
    <NextIntlClientProvider locale="en" messages={{}} timeZone="UTC">
      <FatePrintDocument {...props} data={{ portrait, highConcept: "Sky pilot", aspects: { aspects: [
        { id: "highConcept", kind: "highConcept", text: "private words", secret: true, labelOverride: "private label" },
      ] } }} />
    </NextIntlClientProvider>
  );
  try {
    let result!: ReturnType<typeof render>;
    await act(async () => { result = render(doc("/portrait.png")); });
    const { rerender, container } = result;
    await act(async () => pendingMessages.resolve(messages));
    expect(onReadyChange.mock.calls.every(([ready]) => ready === false)).toBe(true);
    expect(container.querySelector(".fate-print")).toBeNull();
    await act(async () => pendingCatalog.resolve(catalog));
    expect(container.querySelector(".fate-print")).toBeNull();
    await act(async () => pendingLabels.resolve(labels));
    const firstPortrait = await screen.findByRole("img", { name: "Portrait" });
    expect(onReadyChange).toHaveBeenLastCalledWith(false, expect.any(String));
    expect(onReadyChange.mock.calls.every(([ready]) => ready === false)).toBe(true);
    expect(container.innerHTML).not.toMatch(/private words|private label|Sky pilot/);
    expect(screen.getByText("Secret")).toBeVisible();
    fireEvent.load(firstPortrait);
    await waitFor(() => expect(onReadyChange).toHaveBeenLastCalledWith(true, undefined));

    rerender(doc("/missing.png"));
    expect(onReadyChange).toHaveBeenLastCalledWith(false, expect.any(String));
    fireEvent.error(screen.getByRole("img", { name: "Portrait" }));
    await waitFor(() => expect(onReadyChange).toHaveBeenLastCalledWith(true, "Portrait could not load; it will not print."));
    expect(screen.queryByRole("img")).toBeNull();
  } finally {
    messagesLoader.mockRestore();
    catalogLoader.mockRestore();
    labelsLoader.mockRestore();
  }
});

it("gives continuation notes the full width when nothing is left beside them", async () => {
  const geometry = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    if (this.matches(".fate-print-content")) return new DOMRect(0, 0, 800, 1000);
    if (this.matches(".fate-print-notes")) return new DOMRect(0, 0, 400, 1100);
    return new DOMRect();
  });
  try {
    const { container } = render(<NextIntlClientProvider locale="en" messages={{}} timeZone="UTC">
      <FatePrintDocument data={{ notes: "Long notes" }} locale="en" paper="A4" blanks={false} editable={false} setupMode={false}
        schema={{ fields: {} } as PrintDocumentProps["schema"]} template={{} as PrintDocumentProps["template"]} />
    </NextIntlClientProvider>);
    await waitFor(() => expect(container.querySelector("[data-continuation] .fate-print-columns")).toHaveAttribute("data-full-width", "true"));
    expect(container.querySelector("[data-continuation] [data-fate-print-left]")).toBeNull();
  } finally {
    geometry.mockRestore();
  }
});
