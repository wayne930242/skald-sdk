/**
 * The sheet parts of a pack against Skald's published JSON Schemas (`data/schemas/`), compiled as
 * the system submission validator compiles them. The schemas load on first use, so a page that
 * only reads pack types does not bundle them.
 */
import type { SystemPackIssue, SystemPackIssuePath } from "./format";

interface AjvError {
  // ajv v6 names the location dataPath, v8 instancePath; read both.
  dataPath?: string;
  instancePath?: string;
  message?: string;
  params?: { additionalProperty?: string };
}

type CompiledCheck = ((value: unknown) => boolean | PromiseLike<unknown>) & { errors?: AjvError[] | null };

/** The parts that have a JSON Schema, by where they sit in the pack. */
export type SheetPartName = "schema" | "template" | "lookupTables" | "rollRules" | "aliases" | "rollMacros" | "wizard";

interface SheetPartChecks {
  first: Record<SheetPartName, CompiledCheck>;
  every: Record<SheetPartName, CompiledCheck>;
}

/** The every-problem pass grows faster than the value; larger parts report the first problem only. */
const DETAIL_PASS_MAX_BYTES = 262_144;
const MAX_ISSUES_PER_PART = 20;

let loaded: Promise<SheetPartChecks> | undefined;

async function loadSchemas(): Promise<Record<SheetPartName, object>> {
  const [schema, template, lookupTables, rollRules, aliases, rollMacros, wizard] = await Promise.all([
    import("@skald/sheet-sdk/data/schemas/schema.schema.json"),
    import("@skald/sheet-sdk/data/schemas/template.schema.json"),
    import("@skald/sheet-sdk/data/schemas/lookup-tables.schema.json"),
    import("@skald/sheet-sdk/data/schemas/roll-rules.schema.json"),
    import("@skald/sheet-sdk/data/schemas/aliases.schema.json"),
    import("@skald/sheet-sdk/data/schemas/roll-macros.schema.json"),
    import("@skald/sheet-sdk/data/schemas/wizard.schema.json"),
  ]);
  const json = (module: { default: object }) => module.default;
  return {
    schema: json(schema),
    template: json(template),
    lookupTables: json(lookupTables),
    rollRules: json(rollRules),
    aliases: json(aliases),
    rollMacros: json(rollMacros),
    wizard: json(wizard),
  };
}

/** The part of ajv v6 used here. */
type AjvConstructor = new (options: { allErrors: boolean; jsonPointers: boolean }) => { compile(schema: object): unknown };

function compileAll(Ajv: AjvConstructor, schemas: Record<SheetPartName, object>, allErrors: boolean): Record<SheetPartName, CompiledCheck> {
  const ajv = new Ajv({ allErrors, jsonPointers: true });
  const compiled = {} as Record<SheetPartName, CompiledCheck>;
  for (const name of Object.keys(schemas) as SheetPartName[]) {
    compiled[name] = ajv.compile(schemas[name]) as CompiledCheck;
  }
  return compiled;
}

function checks(): Promise<SheetPartChecks> {
  loaded ??= Promise.all([import("ajv"), loadSchemas()]).then(([module, schemas]) => {
    // ajv v6 is CommonJS: its constructor is the interop default, or the module itself.
    const Ajv = (module as unknown as { default?: AjvConstructor }).default ?? (module as unknown as AjvConstructor);
    return {
      first: compileAll(Ajv, schemas, false),
      every: compileAll(Ajv, schemas, true),
    };
  });
  return loaded;
}

function pointerSegments(pointer: string): string[] {
  if (!pointer) return [];
  return pointer
    .split("/")
    .slice(1)
    .map((segment) => segment.replace(/~1/g, "/").replace(/~0/g, "~"));
}

/** Checks one part; `bytes` is its JSON size, which decides whether every problem is listed. */
export async function checkSheetPart(
  name: SheetPartName,
  value: unknown,
  path: SystemPackIssuePath,
  bytes: number,
): Promise<SystemPackIssue[]> {
  const { first, every } = await checks();
  if (first[name](value) === true) return [];
  const check = bytes <= DETAIL_PASS_MAX_BYTES ? every[name] : first[name];
  if (check !== first[name]) check(value);
  return (check.errors ?? []).slice(0, MAX_ISSUES_PER_PART).map((error) => {
    const at = pointerSegments(error.instancePath ?? error.dataPath ?? "");
    const extra = error.params?.additionalProperty;
    return {
      code: "sheet_part_invalid" as const,
      path: [...path, ...at, ...(extra ? [extra] : [])],
      message: `${name}: ${error.message ?? "does not match its JSON Schema"}${extra ? ` (${extra})` : ""}`,
    };
  });
}
