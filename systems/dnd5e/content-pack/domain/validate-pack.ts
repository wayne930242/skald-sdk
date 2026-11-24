/**
 * Validation of an untrusted content pack file (design §1.8, §5b): size,
 * JSON, schema, integrity, then ref rules the schema cannot express. A ref
 * equal to a built-in ref is dropped (built-in wins), and so is a repeated
 * ref; both are reported. `payloadSha256` is integrity, not authenticity.
 *
 * Versions (plan T2b §3, `data/dnd5e-2024/schemas/README.md`): the current
 * major (v2) and the previous one (v1, read with `overlays: {}`) are read;
 * a later major is `unsupportedVersion`. An overlay key that names no
 * built-in ref is dropped and reported. So is an entry whose kind and English name equal a
 * built-in entry's (`identity.ts`, B-025), with its zh-TW layer and wizard items.
 */
import { canonicalJson, sha256Hex } from "./canonical-json";
import { PACK_LIMITS } from "./limits";
import type {
  PackEntry,
  PackOverlay,
  PackReport,
  PackValidation,
  PackWizardItem,
  PackZhEntry,
  ValidatedPack,
} from "./types";
import { nameKey } from "./identity";
import { normalizePack } from "./normalize-pack";
import { PACK_SYSTEM_ID } from "./pack-system";

/** The pack format the pipeline writes. */
export const PACK_SCHEMA_ID = "skald/content-pack/v2";
/** The previous major, still read. */
export const PACK_SCHEMA_V1_ID = "skald/content-pack/v1";
export { PACK_SYSTEM_ID };
/** Majors this app reads. */
export const PACK_READ_VERSIONS: readonly number[] = [1, 2];

/** The major of a `skald/content-pack/v<N>` id, or null for any other value. */
export function packSchemaVersion(id: unknown): number | null {
  const match = typeof id === "string" ? /^skald\/content-pack\/v([1-9][0-9]{0,5})$/.exec(id) : null;
  return match ? Number(match[1]) : null;
}

/**
 * The compiled schema of the pack's own major (`content-pack.schema.json` for v1,
 * `content-pack.v2.schema.json` for v2), chosen by `$schema`; the detail names the first failing path.
 */
export type PackSchemaCheck = (value: unknown) => { ok: true; normalized?: unknown } | { ok: false; detail: string };

export interface ValidatePackDeps {
  /** Every built-in ref (`kind:id`). */
  builtinRefs: ReadonlySet<string>;
  /**
   * The built-in entries' English name keys (`identity.ts`) → their ref: a pack entry with one of
   * them is dropped (built-in wins, B-025). Absent: refs only.
   */
  builtinNameKeys?: ReadonlyMap<string, string>;
  schema: PackSchemaCheck;
}

/** SHA-256 of the sorted built-in ref list, as the pipeline writes `manifest.requiresBuiltin`. */
export async function builtinRefsSha(refs: ReadonlySet<string>): Promise<string> {
  return sha256Hex(canonicalJson([...refs].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))));
}

function utf8Bytes(text: string): number {
  let bytes = 0;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && index + 1 < text.length) {
      bytes += 4;
      index += 1;
    } else bytes += 3;
  }
  return bytes;
}

export async function validatePackText(text: string, deps: ValidatePackDeps): Promise<PackValidation> {
  const bytes = utf8Bytes(text);
  if (bytes > PACK_LIMITS.fileBytes) return { ok: false, error: "tooLarge" };
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, error: "notJson" };
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, error: "notJson" };
  const raw = value as { $schema?: unknown; manifest?: { systemId?: unknown } };
  const version = packSchemaVersion(raw.$schema);
  if (version === null || raw.manifest?.systemId !== PACK_SYSTEM_ID) return { ok: false, error: "wrongSystem" };
  if (version > Math.max(...PACK_READ_VERSIONS)) return { ok: false, error: "unsupportedVersion" };
  if (!PACK_READ_VERSIONS.includes(version)) return { ok: false, error: "wrongSystem" };
  const checked = deps.schema(value);
  if (!checked.ok) return { ok: false, error: "schema", detail: checked.detail };

  const pack = (checked.normalized ?? value) as {
    manifest: ValidatedPack["manifest"];
    payload: {
      entries: PackEntry[];
      zhTW: Record<string, PackZhEntry>;
      wizard: Record<string, PackWizardItem[]>;
      overlays?: Record<string, PackOverlay>;
    };
  };
  if ((await sha256Hex(canonicalJson(pack.payload))) !== pack.manifest.payloadSha256) {
    return { ok: false, error: "shaMismatch" };
  }

  const dropped = new Set<string>();
  const kept = new Set<string>();
  const droppedByName = new Map<string, string>();
  const entries: PackEntry[] = [];
  for (const entry of pack.payload.entries) {
    if (entry.ref !== `${entry.kind}:${entry.id}`) return { ok: false, error: "schema", detail: `ref ${entry.ref}` };
    if (deps.builtinRefs.has(entry.ref) || kept.has(entry.ref)) {
      dropped.add(entry.ref);
      continue;
    }
    const key = deps.builtinNameKeys && nameKey(entry.kind, entry.id, entry.name);
    const builtinRef = key ? deps.builtinNameKeys?.get(key) : undefined;
    if (builtinRef !== undefined) {
      if (!droppedByName.has(entry.ref)) droppedByName.set(entry.ref, builtinRef);
      continue;
    }
    kept.add(entry.ref);
    entries.push(entry);
  }

  const zhTW: Record<string, PackZhEntry> = {};
  for (const [ref, overlay] of Object.entries(pack.payload.zhTW)) {
    if (kept.has(ref)) zhTW[ref] = overlay;
  }

  // A wizard item rides with its corpus entry: no item may replace a built-in pick or repeat one.
  const wizard: Record<string, PackWizardItem[]> = {};
  for (const [key, items] of Object.entries(pack.payload.wizard)) {
    const ids = new Set<string>();
    wizard[key] = items.filter((item) => {
      const ref = typeof item.ref === "string" ? item.ref : undefined;
      if (ref && (deps.builtinRefs.has(ref) || !kept.has(ref))) {
        if (!droppedByName.has(ref)) dropped.add(ref);
        return false;
      }
      if (ids.has(item.id)) {
        dropped.add(ref ?? `${key}:${item.id}`);
        return false;
      }
      ids.add(item.id);
      return true;
    });
  }

  // v1 has no overlays. A key must name a built-in ref; an overlay never adds an entry.
  const overlays: Record<string, PackOverlay> = {};
  const droppedOverlays: string[] = [];
  for (const [ref, overlay] of Object.entries(pack.payload.overlays ?? {})) {
    if (deps.builtinRefs.has(ref)) overlays[ref] = overlay;
    else droppedOverlays.push(ref);
  }

  const counts: Record<string, number> = {};
  for (const entry of entries) counts[entry.kind] = (counts[entry.kind] ?? 0) + 1;
  const report: PackReport = {
    bytes,
    counts,
    dropped: [...dropped].sort(),
    droppedByName: [...droppedByName].map(([ref, builtinRef]) => ({ ref, builtinRef })).sort((a, b) => (a.ref < b.ref ? -1 : 1)),
    droppedOverlays: droppedOverlays.sort(),
    builtinMismatch: (await builtinRefsSha(deps.builtinRefs)) !== pack.manifest.requiresBuiltin,
  };
  return { ok: true, pack: normalizePack({ manifest: pack.manifest, entries, zhTW, wizard, overlays }), report };
}
