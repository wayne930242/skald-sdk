import type {
  JsonObject,
  TemplateArtifactValidationResult,
  TemplateArtifactValidator,
  TemplateValidationIssue,
} from "@skald/sheet-sdk/modules/sheet-schema";
import { TemplateStructureValidator } from "@skald/sheet-sdk/modules/templates/domain/validators/artifact-validators";
import { FormulaArtifactValidator } from "@skald/sheet-sdk/modules/templates/domain/validators/formula/compile";
import { ScopedCssArtifactValidator } from "@skald/sheet-sdk/modules/templates/domain/scoped-css/compile";
import { TemplateMacroArtifactValidator } from "@skald/sheet-sdk/modules/templates/domain/validators/template-macro-artifact-validator";
import type { BuiltinLocalSystemData } from "@skald/sheet-sdk/modules/systems";
import { buildBuiltinTemplateSource } from "./builtin-template-source";

export interface TemplateArtifactComparison {
  status: "match" | "mismatch";
  slug: string;
  versionId: string;
  sourceMatch: boolean;
  artifactMatch: boolean;
  localSourceHash: string;
  databaseSourceHash: string;
  localArtifactHash: string;
  databaseArtifactHash: string;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const entries = Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`);
  return `{${entries.join(",")}}`;
}

const utf8 = new TextEncoder();

/** Postgres jsonb object key order: shorter keys first, then by UTF-8 bytes. */
function compareJsonbKeys(left: string, right: string): number {
  const a = utf8.encode(left);
  const b = utf8.encode(right);
  if (a.length !== b.length) return a.length - b.length;
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
}

/**
 * `value` with every object's keys in the order Postgres jsonb stores them.
 * Publish compiles the draft source read back from jsonb, and a compiled
 * artifact can follow key order (the wizard's program list does).
 */
function inJsonbKeyOrder<T>(value: T): T {
  if (Array.isArray(value)) return value.map(inJsonbKeyOrder) as T;
  if (value === null || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort(compareJsonbKeys)
      .map((key) => [key, inJsonbKeyOrder(record[key])]),
  ) as T;
}

async function hashJson(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export async function compareTemplateArtifactHashes(input: {
  slug: string;
  versionId: string;
  localSource: unknown;
  databaseSource: unknown;
  localArtifact: unknown;
  databaseArtifact: unknown;
}): Promise<TemplateArtifactComparison> {
  const [
    localSourceHash,
    databaseSourceHash,
    localArtifactHash,
    databaseArtifactHash,
  ] = await Promise.all([
    hashJson(input.localSource),
    hashJson(input.databaseSource),
    hashJson(input.localArtifact),
    hashJson(input.databaseArtifact),
  ]);
  const sourceMatch = localSourceHash === databaseSourceHash;
  const artifactMatch = localArtifactHash === databaseArtifactHash;
  return {
    status: sourceMatch && artifactMatch ? "match" : "mismatch",
    slug: input.slug,
    versionId: input.versionId,
    sourceMatch,
    artifactMatch,
    localSourceHash,
    databaseSourceHash,
    localArtifactHash,
    databaseArtifactHash,
  };
}

function sheetArtifactValidators(): [
  TemplateStructureValidator,
  FormulaArtifactValidator,
  ScopedCssArtifactValidator,
] {
  return [
    new TemplateStructureValidator(),
    new FormulaArtifactValidator(),
    new ScopedCssArtifactValidator(),
  ];
}

/** Throws on any error issue; merges an artifact result into `compiledArtifact`. */
function collectArtifact(
  result: TemplateValidationIssue[] | TemplateArtifactValidationResult,
  compiledArtifact: JsonObject,
): void {
  const issues = Array.isArray(result) ? result : result.issues;
  const errors = issues.filter((issue) => issue.severity === "error");
  if (errors.length > 0) {
    throw new Error(
      `Local built-in artifact validation failed: ${errors
        .map((issue) => `${issue.code}:${issue.path.join(".")}`)
        .join(", ")}`,
    );
  }
  if (!Array.isArray(result)) {
    Object.assign(compiledArtifact, result.compiledArtifact ?? {});
  }
}

/**
 * The sheet part of a built-in's compiled artifact (structure, formulas,
 * scoped CSS), synchronously. It leaves out template macros and the wizard;
 * `compileBuiltinPublishedArtifact` compiles everything Publish compiles.
 */
export function compileBuiltinFixtureArtifact(
  slug: string,
  data: BuiltinLocalSystemData,
): { source: JsonObject; compiledArtifact: JsonObject } {
  const source = buildBuiltinTemplateSource(slug, data) as JsonObject;
  const compiledArtifact: JsonObject = {};
  for (const validator of sheetArtifactValidators()) {
    collectArtifact(validator.validate(source), compiledArtifact);
  }
  return { source, compiledArtifact };
}

/**
 * The compiled artifact Publish produces for a built-in source: the artifact
 * validators of `TemplateValidationService`, with the wizard checked against
 * the System's local game data and roll macros. Like Publish, it compiles the
 * source in the key order the database stores it.
 */
export async function compileBuiltinPublishedArtifact(
  slug: string,
  data: BuiltinLocalSystemData,
  createWizardValidator: () => TemplateArtifactValidator,
): Promise<{ source: JsonObject; compiledArtifact: JsonObject }> {
  const source = inJsonbKeyOrder(buildBuiltinTemplateSource(slug, data) as JsonObject);
  const compiledArtifact: JsonObject = {};
  const validators: TemplateArtifactValidator[] = [
    ...sheetArtifactValidators(),
    new TemplateMacroArtifactValidator(),
    createWizardValidator(),
  ];
  for (const validator of validators) {
    collectArtifact(await validator.validate(source), compiledArtifact);
  }
  return { source, compiledArtifact };
}
