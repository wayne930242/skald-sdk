import type { Json } from "@skald/types";

export type JsonObject = { [key: string]: Json | undefined };

export interface TemplateValidationIssue {
  category: "template" | "formula" | "css" | "migration" | "character";
  code: string;
  severity: "warning" | "error";
  path: string[];
  message: string;
  characterId?: string;
  details?: JsonObject;
}

export interface TemplateValidationCharacter {
  id: string;
  templateVersionId: string;
  data: JsonObject;
  preservedData: JsonObject;
  derivedOverrides: JsonObject;
  /** `characters.yjs_state` as read (bytea hex string, bytes, or null). */
  yjsState: unknown;
  /** `characters.yjs_clock` read together with `yjsState`. */
  yjsClock: number | null;
}

export interface TemplateValidationContext {
  templateId: string;
  /**
   * The built-in System slug when the template is a built-in one (no owner
   * and `metadata.builtinSystemSlug`). Only built-in templates may run System
   * Converters; absent means user-owned.
   */
  builtinSystemSlug?: string | null;
  draft: {
    id: string;
    revision: number;
    contentHash: string;
    baseVersionId: string | null;
    source: JsonObject;
  };
  characters: TemplateValidationCharacter[];
}

export interface TemplateValidationCandidate {
  characterId: string;
  sourceDataHash: string;
  candidateDataHash: string;
  candidateData: JsonObject;
  preservedData: JsonObject;
  /**
   * The Character's Yjs history reconciled to `candidateData`, written with it
   * by Publish; null when the Character has no Yjs state.
   */
  candidateYjsState: Uint8Array | null;
  /** Publish is stale when `characters.yjs_clock` moved past this value. */
  sourceYjsClock: number;
  /** JSON bytes of data and preserved data plus the Yjs state bytes. */
  candidateBytes: number;
}

export interface TemplateValidationSummary {
  runId: string;
  status: "succeeded" | "failed";
  draftRevision: number;
  draftContentHash: string;
  affectedCharacterCount: number;
  candidateCount: number;
  issueCount: number;
  totalCandidateBytes: number;
  /**
   * True when the static checks found an error, so Validate did not dry-run
   * the wizard (S10): no wizard issues then does not mean the wizard passed.
   * Not persisted; it only travels with the result of one Validate.
   */
  wizardDryRunSkipped: boolean;
}

export interface TemplateArtifactValidator {
  validate(source: JsonObject):
    | TemplateArtifactValidationResult
    | TemplateValidationIssue[]
    | Promise<TemplateArtifactValidationResult | TemplateValidationIssue[]>;
}

export interface TemplateArtifactValidationResult {
  issues: TemplateValidationIssue[];
  compiledArtifact?: JsonObject;
  compilerVersions?: JsonObject;
  validateCharacter?: (
    character: TemplateArtifactCharacterState
  ) => TemplateValidationIssue[] | Promise<TemplateValidationIssue[]>;
}

export interface TemplateArtifactCharacterState {
  data: JsonObject;
  preservedData: JsonObject;
  derivedOverrides: JsonObject;
}

export interface TemplateValidationRepository {
  loadContext(templateId: string): Promise<TemplateValidationContext>;
  hashJson(value: JsonObject): Promise<string>;
  createRun(
    context: TemplateValidationContext,
    requestedBy: string | null
  ): Promise<string>;
  completeRun(
    runId: string,
    result: {
      status: "succeeded" | "failed";
      issues: TemplateValidationIssue[];
      candidates: TemplateValidationCandidate[];
      affectedCharacterCount: number;
      totalCandidateBytes: number;
      compiledArtifact: JsonObject;
      compilerVersions: JsonObject;
    }
  ): Promise<void>;
  failRun(runId: string): Promise<void>;
}
