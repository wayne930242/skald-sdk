/**
 * The JSON Schema of `skald/pack/v1` (`data/dnd5e-2024/schemas/pack.v1.schema.json`), built from
 * the app's pack schema (`content-pack.v2.schema.json`) so entry kinds, text blocks, `meta`,
 * zh-TW layers, overlays, wizard items and limits stay identical. A test fails when the committed
 * file differs from `openPackSchema()`; `bun run pack schema` (SDK repository root) prints the current one.
 */
import { OPEN_PACK_SCHEMA_ID, OPEN_PACK_SOURCE_PATTERN } from "./format";

type Json = Record<string, unknown>;

const at = (value: Json, ...path: string[]): Json =>
  path.reduce((node, key) => {
    const child = node[key];
    if (!child || typeof child !== "object" || Array.isArray(child)) throw new Error(`the app's pack schema has no ${path.join("/")}`);
    return child as Json;
  }, value);

function pick(value: Json, keys: readonly string[]): Json {
  return Object.fromEntries(keys.filter((key) => key in value).map((key) => [key, value[key]]));
}

/** Manifest fields the SDK format keeps from the app's format, unchanged. */
const KEPT_MANIFEST = ["systemId", "packId", "packVersion", "notice", "payloadSha256", "requiresBuiltin", "generatedAt"] as const;
/** Entry fields it keeps. */
const KEPT_ENTRY = ["kind", "id", "ref", "name", "entries", "meta", "lore"] as const;

export function openPackSchema(app: Json): Json {
  const schema = structuredClone(app);
  const props = at(schema, "properties");
  const manifest = at(props, "manifest");
  const payload = at(props, "payload");
  const payloadProps = at(payload, "properties");
  const entry = at(payloadProps, "entries", "items");
  const wizard = at(payloadProps, "wizard");
  const overlay = at(schema, "definitions", "overlay");

  schema.$id = "https://skald.local/schemas/dnd5e-2024/pack.v1.schema.json";
  schema.title = "Skald D&D 2024 content pack (SDK format v1)";
  schema.description =
    "A content pack in the SDK format. A validator must also enforce the 12 MB UTF-8 file limit, ref = kind:id, the payload checksum, and the rules on refs and names that equal built-in ones (docs/content-packs.md).";
  props.$schema = { const: OPEN_PACK_SCHEMA_ID };

  manifest.properties = {
    ...pick(at(manifest, "properties"), KEPT_MANIFEST),
    packVersion: { maxLength: 150, minLength: 1, type: "string" },
    name: { maxLength: 200, minLength: 1, type: "string" },
    locales: { items: { enum: ["en", "zh-TW"] }, minItems: 1, type: "array", uniqueItems: true },
  };
  manifest.required = ["systemId", "packId", "packVersion", "name", "notice", "payloadSha256"];

  payload.required = ["entries"];
  entry.properties = {
    ...pick(at(entry, "properties"), KEPT_ENTRY),
    source: { pattern: OPEN_PACK_SOURCE_PATTERN, type: "string" },
  };
  entry.required = ["kind", "id", "name", "entries"];
  delete wizard.required;
  overlay.properties = pick(at(overlay, "properties"), ["en", "zhTW"]);
  overlay.required = ["en"];
  return schema;
}
