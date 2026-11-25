// @vitest-environment node
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it, vi } from "vitest";
import appSchema from "@skald/system-dnd5e/data/dnd5e-2024/schemas/content-pack.v2.schema.json";
import committedSchema from "@skald/system-dnd5e/data/dnd5e-2024/schemas/pack.v1.schema.json";
import { overlayGameData } from "../../domain/overlay";
import { createPackSource, applyOverlay, type ResolvedReference } from "../../../reference/sources";
import { runPackCli, type PackCliIo } from "../cli";
import type { OpenPack } from "../format";
import { loadBuiltinIdentity, loadOpenPackSchemaCheck } from "../load";
import { openPackSchema } from "../schema";
import { openPackText, sealOpenPack } from "../seal";
import { openPayloadSha, validateOpenPackText, type ValidateOpenPackDeps } from "../validate-open-pack";
import { packsView } from "../view";

// Loads the built-in names (the tier A catalog and the reference indexes) once; slow on a loaded machine.
vi.setConfig({ testTimeout: 30_000 });

const examplePath = new URL("../example/lantern-table.pack.json", import.meta.url);
const exampleText = readFileSync(examplePath, "utf8");
const example = (): OpenPack => JSON.parse(exampleText) as OpenPack;

let deps: ValidateOpenPackDeps;
let refs: Set<string>;
beforeAll(async () => {
  const [schema, identity] = await Promise.all([loadOpenPackSchemaCheck(), loadBuiltinIdentity()]);
  refs = identity.refs;
  deps = { builtinRefs: identity.refs, builtinNameKeys: identity.nameKeys, schema };
});

async function check(pack: OpenPack, { reseal = true } = {}) {
  const text = openPackText(reseal ? await sealOpenPack(pack) : pack);
  return validateOpenPackText(text, deps);
}

describe("the SDK pack format (skald/pack/v1)", () => {
  it("commits the schema built from the app's pack schema", () => {
    expect(committedSchema).toEqual(openPackSchema(appSchema as Record<string, unknown>));
  });

  it("loads the example pack as written, sealed, with nothing dropped", async () => {
    const pack = example();
    expect(pack.manifest.payloadSha256).toBe(await openPayloadSha(pack.payload));
    const result = await validateOpenPackText(exampleText, deps);
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    expect(result.name).toBe("Lantern Table house rules");
    expect(result.report).toMatchObject({ counts: { feat: 1 }, dropped: [], droppedByName: [], droppedOverlays: [], builtinMismatch: false });
    expect(result.pack.entries).toEqual([expect.objectContaining({ ref: "feat:lantern-watcher", meta: { category: "general", grants: {}, repeatable: false } })]);
    expect(await createPackSource(result.pack.entries, result.pack.zhTW).resolve("feat:lantern-watcher", "en")).toMatchObject({ name: "Lantern Watcher" });
    expect(overlayGameData({ feats: [] }, result.pack, "en").feats).toEqual([expect.objectContaining({ ref: "feat:lantern-watcher" })]);
    expect(result.pack.entries[0]).not.toHaveProperty("source");
    expect(result.pack.zhTW["feat:lantern-watcher"].name).toBe("守燈人");
    expect(result.pack.wizard.feats.map((item) => item.ref)).toEqual(["feat:lantern-watcher"]);
    expect(Object.keys(result.pack.overlays ?? {})).toEqual(["spell:light"]);
  });

  it("refuses a payload changed after sealing", async () => {
    const pack = example();
    (pack.payload.entries[0].entries as string[])[0] = "Changed after sealing.";
    expect(await check(pack, { reseal: false })).toEqual({ ok: false, error: "shaMismatch" });
  });

  it("takes any short source label, or none, and needs no pins, counts or optional sections", async () => {
    const pack = example();
    pack.payload = { entries: pack.payload.entries.map((entry) => ({ ...entry, source: "my-table.2026" })) };
    expect((await check(pack)).ok).toBe(true);
    delete pack.payload.entries[0].source;
    delete pack.payload.entries[0].meta;
    expect((await check(pack)).ok).toBe(true);
    pack.payload.entries[0].source = "not a label!";
    expect(await check(pack)).toMatchObject({ ok: false, error: "schema", detail: expect.stringContaining("source") });
  });

  it("refuses fields of the app's own format and a ref that is not kind:id", async () => {
    const withPins = example();
    (withPins.manifest as unknown as Record<string, unknown>).counts = { feat: 1 };
    expect(await check(withPins)).toMatchObject({ ok: false, error: "schema" });
    const wrongRef = example();
    wrongRef.payload.entries[0].ref = "feat:other";
    expect(await check(wrongRef)).toEqual({ ok: false, error: "schema", detail: "ref feat:other" });
  });

  it("tells the app's format and a later version apart from this one", async () => {
    const appFormat = { ...example(), $schema: "skald/content-pack/v2" };
    expect(await validateOpenPackText(JSON.stringify(appFormat), deps)).toEqual({ ok: false, error: "wrongSystem" });
    const later = { ...example(), $schema: "skald/pack/v2" };
    expect(await validateOpenPackText(JSON.stringify(later), deps)).toEqual({ ok: false, error: "unsupportedVersion" });
    const otherSystem = example();
    otherSystem.manifest.systemId = "fate-condensed";
    expect(await check(otherSystem)).toEqual({ ok: false, error: "wrongSystem" });
  });

  it("drops what the app drops: a built-in ref, a built-in name and an overlay on no built-in entry", async () => {
    const pack = example();
    pack.payload.entries[0].name = "Alert";
    pack.payload.entries.push({ kind: "spell", id: "light", name: "Lantern Light", entries: ["Text."] });
    pack.payload.overlays = { ...pack.payload.overlays, "feat:lantern-watcher": { en: { entries: ["Text."] } } };
    const result = await check(pack);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.report).toMatchObject({
      counts: {},
      dropped: ["spell:light"],
      droppedByName: [{ ref: "feat:lantern-watcher", builtinRef: "feat:alert" }],
      droppedOverlays: ["feat:lantern-watcher"],
    });
    expect(result.pack.zhTW).toEqual({});
    expect(result.pack.wizard.feats).toEqual([]);
  });

  it("warns, and still loads, when requiresBuiltin names other built-in data", async () => {
    const pinned = await sealOpenPack(example(), { builtinRefs: refs });
    const ok = await validateOpenPackText(openPackText(pinned), deps);
    expect(ok.ok && ok.report.builtinMismatch).toBe(false);
    const stale = await sealOpenPack({ ...example(), manifest: { ...example().manifest, requiresBuiltin: "0".repeat(64) } });
    const warned = await validateOpenPackText(openPackText(stale), deps);
    expect(warned.ok && warned.report.builtinMismatch).toBe(true);
  });

  it("shows an overlay as the pack's own wording, with the SRD text kept for the toggle", async () => {
    const result = await validateOpenPackText(exampleText, deps);
    if (!result.ok) throw new Error(result.error);
    const view = await packsView([result.pack]);
    expect(view?.supplier["spell:light"]).toBe("lantern-table");
    const srd = { ref: "spell:light", kind: "spell", id: "light", name: "Light", blocks: ["SRD text."], higherLevel: [], meta: {} } as unknown as ResolvedReference;
    const shown = applyOverlay(srd, view!.content.overlays!["spell:light"], "en");
    expect(shown).toMatchObject({ textSource: "pack", srdBlocks: ["SRD text."] });
  });
});

describe("the pack command", () => {
  function io(files: Record<string, string>) {
    const out: string[] = [];
    const err: string[] = [];
    const value: PackCliIo = {
      log: (line) => out.push(line),
      error: (line) => err.push(line),
      read: (file) => {
        if (!(file in files)) throw new Error("no such file");
        return files[file];
      },
      write: (file, text) => {
        files[file] = text;
      },
    };
    return { value, out, err, files };
  }

  it("checks the example and refuses it once tampered", async () => {
    const run = io({ "pack.json": exampleText, "tampered.json": exampleText.replace("many long nights", "many short nights") });
    expect(await runPackCli(["check", "pack.json"], run.value)).toBe(0);
    expect(run.out[0]).toContain("ok: Lantern Table house rules (lantern-table 1.0.0)");
    expect(await runPackCli(["check", "tampered.json"], run.value)).toBe(1);
    expect(run.err.at(-1)).toContain("checksum");
  });

  it("seals a pack in place, pins the built-in data on request, and checks the result", async () => {
    const draft = { ...example(), manifest: { ...example().manifest, payloadSha256: "" } };
    const run = io({ "draft.json": JSON.stringify(draft) });
    expect(await runPackCli(["check", "draft.json"], run.value)).toBe(1);
    expect(await runPackCli(["seal", "draft.json", "--pin"], run.value)).toBe(0);
    const sealed = JSON.parse(run.files["draft.json"]) as OpenPack;
    expect(sealed.manifest.payloadSha256).toBe(example().manifest.payloadSha256);
    expect(sealed.manifest.requiresBuiltin).toMatch(/^[a-f0-9]{64}$/);
    expect(run.out.some((line) => line.startsWith("ok: "))).toBe(true);
  });

  it("prints the committed schema and refuses bad usage", async () => {
    const run = io({});
    expect(await runPackCli(["schema"], run.value)).toBe(0);
    expect(JSON.parse(run.out.join("\n"))).toEqual(committedSchema);
    expect(await runPackCli(["check"], run.value)).toBe(2);
    expect(await runPackCli(["check", "missing.json"], run.value)).toBe(2);
    expect(await runPackCli(["check", "x.json", "--pin"], run.value)).toBe(2);
  });
});
