/**
 * Validation of an untrusted pack in the SDK format (`format.ts`): size, JSON, format and system,
 * the JSON Schema, the payload checksum, then the same ref and name rules as the app's own packs
 * (`domain/validate-pack.ts`, which this calls with the pack in the app's shape). The result is the
 * `ValidatedPack` every pack reader takes, plus the manifest's `name`.
 */
import { canonicalJson, sha256Hex } from "../domain/canonical-json";
import { PACK_LIMITS } from "../domain/limits";
import { PACK_SYSTEM_ID } from "../domain/pack-system";
import type { PackErrorCode, PackOverlay, PackReport, ValidatedPack } from "../domain/types";
import { builtinRefsSha, PACK_SCHEMA_ID, validatePackText, type PackSchemaCheck } from "../domain/validate-pack";
import { OPEN_PACK_READ_VERSIONS, openPackVersion, type OpenPack } from "./format";

export interface ValidateOpenPackDeps {
  /** Every built-in ref (`kind:id`). */
  builtinRefs: ReadonlySet<string>;
  /** The built-in English name keys (`domain/identity.ts`) → their ref. */
  builtinNameKeys?: ReadonlyMap<string, string>;
  /** The compiled `pack.v1.schema.json` (`load.ts`). */
  schema: PackSchemaCheck;
}

export type OpenPackValidation =
  | { ok: true; pack: ValidatedPack; report: PackReport; name: string }
  | { ok: false; error: PackErrorCode; detail?: string };

/** The checksum of `payload` that `manifest.payloadSha256` must hold. */
export function openPayloadSha(payload: unknown): Promise<string> {
  return sha256Hex(canonicalJson(payload));
}

/** The pack in the app's own shape, for the app's ref rules; its integrity was checked already. */
async function appShape(pack: OpenPack, builtinRefs: ReadonlySet<string>) {
  const entries = pack.payload.entries.map(({ source: _label, ref, meta, ...entry }) => ({
    ...entry,
    ref: ref ?? `${entry.kind}:${entry.id}`,
    meta: meta ?? {},
  }));
  // An overlay in this format is the pack's own wording: no book (`source` absent).
  const overlays: Record<string, PackOverlay> = { ...pack.payload.overlays };
  const payload = { entries, zhTW: pack.payload.zhTW ?? {}, wizard: pack.payload.wizard ?? {}, overlays };
  const counts: Record<string, number> = {};
  for (const entry of entries) counts[entry.kind] = (counts[entry.kind] ?? 0) + 1;
  return {
    $schema: PACK_SCHEMA_ID,
    manifest: {
      systemId: pack.manifest.systemId,
      packId: pack.manifest.packId,
      packVersion: pack.manifest.packVersion,
      notice: pack.manifest.notice,
      counts,
      // No pin: checked against the current built-in refs, so no mismatch warning.
      requiresBuiltin: pack.manifest.requiresBuiltin ?? (await builtinRefsSha(builtinRefs)),
      payloadSha256: await sha256Hex(canonicalJson(payload)),
    },
    payload,
  };
}

/**
 * A pack without `requiresBuiltin` is checked against the current built-in refs and never warns
 * that it was built for another data version.
 */
export async function validateOpenPackText(text: string, deps: ValidateOpenPackDeps): Promise<OpenPackValidation> {
  if (new TextEncoder().encode(text).length > PACK_LIMITS.fileBytes) return { ok: false, error: "tooLarge" };
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, error: "notJson" };
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, error: "notJson" };
  const raw = value as { $schema?: unknown; manifest?: { systemId?: unknown } };
  const version = openPackVersion(raw.$schema);
  if (version === null || raw.manifest?.systemId !== PACK_SYSTEM_ID) return { ok: false, error: "wrongSystem" };
  if (!OPEN_PACK_READ_VERSIONS.includes(version)) {
    return { ok: false, error: version > Math.max(...OPEN_PACK_READ_VERSIONS) ? "unsupportedVersion" : "wrongSystem" };
  }
  const checked = deps.schema(value);
  if (!checked.ok) return { ok: false, error: "schema", detail: checked.detail };
  const pack = value as OpenPack;
  for (const entry of pack.payload.entries) {
    if (entry.ref !== undefined && entry.ref !== `${entry.kind}:${entry.id}`) return { ok: false, error: "schema", detail: `ref ${entry.ref}` };
  }
  if ((await openPayloadSha(pack.payload)) !== pack.manifest.payloadSha256) return { ok: false, error: "shaMismatch" };

  const result = await validatePackText(canonicalJson(await appShape(pack, deps.builtinRefs)), {
    builtinRefs: deps.builtinRefs,
    builtinNameKeys: deps.builtinNameKeys,
    schema: () => ({ ok: true }),
  });
  if (!result.ok) return result;
  return {
    ...result,
    report: { ...result.report, bytes: new TextEncoder().encode(text).length },
    name: pack.manifest.name,
  };
}
