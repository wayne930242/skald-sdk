/**
 * What a pack check reads besides the pack: the compiled SDK format schema and the built-in
 * identity (every built-in ref, and the English name keys). Both load on demand; Skald's app
 * reads the identity in its validation worker, the CLI and the previewer read it directly.
 */
import Ajv from "ajv";
import { loadReferenceNames } from "../../reference/load-corpus";
import { nameKey } from "../domain/identity";
import type { PackSchemaCheck } from "../domain/validate-pack";
import { OPEN_PACK_SCHEMA_ID } from "./format";

/** Compiles `pack.v1.schema.json` with `game-items.schema.json` registered. */
export async function loadOpenPackSchemaCheck(): Promise<PackSchemaCheck> {
  const [gameItems, v1] = await Promise.all([
    import("@skald/system-dnd5e/data/dnd5e-2024/schemas/game-items.schema.json"),
    import("@skald/system-dnd5e/data/dnd5e-2024/schemas/pack.v1.schema.json"),
  ]);
  const validate = new Ajv({ allErrors: false }).addSchema(gameItems.default ?? gameItems).compile(v1.default ?? v1);
  return (value) => {
    if ((value as { $schema?: unknown } | null)?.$schema !== OPEN_PACK_SCHEMA_ID) return { ok: false, detail: "/$schema" };
    if (validate(value)) return { ok: true };
    const first = validate.errors?.[0];
    return { ok: false, detail: first ? `${first.dataPath || "/"} ${first.message ?? ""}`.trim().slice(0, 300) : "invalid" };
  };
}

/**
 * Every built-in ref, as `manifest.requiresBuiltin` lists them: the English names catalog
 * (`ref.<kind>.<id>`, tier A) plus the lazy names (the reference catalog of tables and chapters,
 * and the creature and magic item indexes). For the kinds compared by name (`identity.ts`), each
 * English name key with the first ref that has it.
 */
export async function loadBuiltinIdentity(): Promise<{ refs: Set<string>; nameKeys: Map<string, string> }> {
  const [messages, lazy] = await Promise.all([import("@skald/system-dnd5e/data/dnd5e-2024/messages/en.json"), loadReferenceNames("en")]);
  const catalog = ((messages.default ?? messages) as { ref?: Record<string, Record<string, unknown>> }).ref ?? {};
  const refs = new Set<string>();
  const nameKeys = new Map<string, string>();
  for (const names of [catalog, lazy]) {
    for (const [kind, ids] of Object.entries(names)) {
      for (const [id, name] of Object.entries(ids ?? {})) {
        refs.add(`${kind}:${id}`);
        const key = typeof name === "string" ? nameKey(kind, id, name) : null;
        if (key && !nameKeys.has(key)) nameKeys.set(key, `${kind}:${id}`);
      }
    }
  }
  return { refs, nameKeys };
}
