import { expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { HostPortsProvider, bindHostPort } from "@skald/sheet-sdk/modules/systems/ui/host-ports";
import messages from "@skald/system-dnd5e/data/dnd5e-2024/messages/homebrew/en.json";
import example from "../../../content-pack/open/example/lantern-table.pack.json";
import { validateOpenPackText } from "../../../content-pack/open/validate-open-pack";
import { loadBuiltinIdentity, loadOpenPackSchemaCheck } from "../../../content-pack/open/load";
import { createMemoryHomebrewStore } from "../../testing/memory-store";
import { dndHomebrewStorePort } from "../../store-port";
import { HomebrewWorkspace } from "../workspace";

const t = messages.homebrew.transfer;
const button = (name: string) => screen.findByRole("button", { name }, {timeout: 10000});
function mount() {
  const store = createMemoryHomebrewStore();
  render(<NextIntlClientProvider locale="en" messages={messages} timeZone="UTC"><HostPortsProvider ports={[bindHostPort(dndHomebrewStorePort, store)]}><HomebrewWorkspace /></HostPortsProvider></NextIntlClientProvider>);
  return store;
}
async function choose(file: { size: number; text: () => Promise<string> }) {
  const input = await screen.findByLabelText(t.file);
  await act(async () => { fireEvent.change(input, {target: {files: [file]}}); });
}
it("rejects oversized files without reading and routes app packs to Drive", async () => {
  const store = mount();
  fireEvent.click(await button(t.import));
  const text = vi.fn();
  await choose({size: 1_048_577, text});
  expect(await screen.findByRole("alert")).toHaveTextContent(t.tooLarge);
  expect(text).not.toHaveBeenCalled();
  await choose({size: 32, text: async () => '{"$schema":"skald/content-pack/v2"}'});
  expect(await screen.findByText(t.driveOnly)).toBeVisible();
  expect(store.snapshot().packs).toHaveLength(0);
});
it("imports a feat and overlay, replaces or copies, and exports the selected copy", async () => {
  const store = mount();
  for (const action of [t.confirm, `Replace ${example.manifest.name}`, t.copy]) {
    fireEvent.click(await button(t.import));
    await choose({size: 5000, text: async () => JSON.stringify(example)});
    fireEvent.click(await button(action));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(store.snapshot().items.map(i => i.kind).sort()).toEqual(action === t.copy ? ["feat","feat","overlay","overlay"] : ["feat","overlay"]);
  }
  expect(store.snapshot().packs.map(p => p.packId)).toEqual(["lantern-table", "lantern-table-2"]);
  let downloaded: Blob | undefined;
  vi.stubGlobal("URL", class extends URL {
    static createObjectURL(blob: Blob) { downloaded = blob; return "blob:test"; }
    static revokeObjectURL() {}
  });
  let filename: string | undefined;
  const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function(this: HTMLAnchorElement) { filename = this.download; });
  try {
    fireEvent.click(await button(t.export));
    await waitFor(() => expect(click).toHaveBeenCalled());
    expect(filename).toBe("lantern-table-2.pack.json");
    const text = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsText(downloaded!);
    });
    const {refs, nameKeys} = await loadBuiltinIdentity();
    expect(await validateOpenPackText(text, {builtinRefs: refs, builtinNameKeys: nameKeys, schema: await loadOpenPackSchemaCheck()})).toMatchObject({ok: true});
  } finally { click.mockRestore(); vi.unstubAllGlobals(); }
}, 15000);
