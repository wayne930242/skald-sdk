import type { FateStuntType } from "@skald/types/schema";

/** The host owns the raw record. Fate commands must retain unrecognized keys. */
export type FateCharacterData = Record<string, unknown>;

export const FATE_ASPECT_FORMAT = 2;
export const FATE_DEFAULT_REFRESH = 3;
export const FATE_FREE_STUNTS = 3;

export const FATE_PERMANENT_ASPECT_SLOTS = {
  highConcept: "highConcept",
  trouble: "trouble",
  relationship: "relationship",
  freeAspect1: "free",
  freeAspect2: "free",
} as const;

export type FateAspectKind = (typeof FATE_PERMANENT_ASPECT_SLOTS)[keyof typeof FATE_PERMANENT_ASPECT_SLOTS] | "situation" | "boost";

export interface FateAspectRow extends Record<string, unknown> {
  id: string;
  kind: FateAspectKind;
  text: string;
  freeInvokes: number;
  secret: boolean;
  labelOverride?: string;
  createdSceneId?: string;
}

export interface FateAspectList extends Record<string, unknown> {
  format: typeof FATE_ASPECT_FORMAT;
  aspects: unknown[]; // Includes opaque rows from other versions.
}

export type FateAction = "overcome" | "createAdvantage" | "attack" | "defend";

/** Local row shape; the shared v1 wire types stay unchanged. */
export interface FateStuntRow extends Record<string, unknown> {
  id: string;
  type: FateStuntType;
  customText?: string;
  quality?: string;
  skill?: string;
  action?: string;
  circumstance?: string;
  feat?: string;
  limitation?: string;
  title?: string;
  because?: string;
  effect?: string;
  limit?: string;
  skillId?: string;
  oncePerSession?: boolean;
  usedSessionId?: string;
}

export type FateTrack = "physical" | "mental";
export type FateSplitStressField = `${FateTrack}Stress`;
export type FateSeverity = "mild" | "moderate" | "severe";
export const FATE_CONSEQUENCE_FIELDS = {
  mild: "mildConsequence",
  moderate: "moderateConsequence",
  severe: "severeConsequence",
} as const satisfies Record<FateSeverity, string>;

export type FateRecoveryBoundary = "scene" | "session" | "majorMilestone";
export interface FateRecovery {
  boundary: FateRecoveryBoundary;
  /** The partial interval at treatment cannot count; use explicit boundary sequence numbers. */
  treatedAtSequence: number;
}

export interface FateInjuryMetadata {
  injuryId: string;
  /** Exact persisted text. Generic v1 text edits cannot carry metadata forward to a changed injury. */
  injuryText: string;
  externalClaim?: boolean;
  recovery?: FateRecovery;
}

export interface FateInjury {
  text: string;
  metadata?: FateInjuryMetadata;
}

export interface FateExtremeInjury {
  aspectId: string;
  text: string;
  operationId: string;
  majorMilestoneSequence: number;
}

export interface FateHarmState {
  unifiedStress?: number[];
  consequences?: Partial<Record<FateSeverity, FateInjuryMetadata>>;
  extraMild?: Partial<Record<FateTrack, FateInjury>>;
  extreme?: FateExtremeInjury;
  conditions?: Record<string, FateInjury>;
}

export interface FateRefreshState {
  base: number;
  earned: number;
  /** Effective refresh override, not a different count of free stunts. */
  override?: number;
}

export interface FateBoundaryState {
  id: string;
  sequence: number;
}

export type FateLedgerReason =
  | "adjustment" | "invokePaid" | "invokeFree" | "invokeReverse" | "compel"
  | "concession" | "hostileInvokeCredit" | "sessionStart" | "sceneEnd"
  | "stuntPurchase" | "milestoneMinor" | "milestoneMajor";

export interface FateLedgerEntry {
  operationId: string;
  reason: FateLedgerReason;
  timestamp: string;
  delta: number;
  freeInvokeDelta?: number;
  actorId?: string;
  rollId?: string;
  aspectId?: string;
}

export interface FateMilestoneEntry {
  id: string;
  kind: "minor" | "major";
  timestamp: string;
  operationId: string;
  skillPointDelta: number;
  refreshDelta: number;
}

export interface FatePresetState {
  id: string;
  version: number;
  selection: Record<string, string>;
  overrides: Record<string, unknown>;
}

export interface FateGearState {
  weapon?: number;
  armor?: number;
  scaleTierId?: string;
}

export interface FateOperationReceipt {
  id: string;
  status: "local" | "pending" | "posted" | "rejected" | "unknown" | "reversed";
  /** Later commands own payload validation; IDs must be injected outside their updater. */
  payload?: Record<string, unknown>;
}

/** Only the fateV2 root is new; absence of each section is valid (including v1 cards). */
export interface FateV2State extends Record<string, unknown> {
  refresh?: FateRefreshState;
  harm?: FateHarmState;
  session?: FateBoundaryState;
  scene?: FateBoundaryState;
  majorMilestoneSequence?: number;
  ledger?: FateLedgerEntry[];
  milestones?: FateMilestoneEntry[];
  bankedSkillRanks?: number;
  preset?: FatePresetState;
  gear?: FateGearState;
  receipts?: Record<string, FateOperationReceipt>;
  /** Unknown v1 keyed-stress members carried over when an edited track becomes an array. */
  legacyStress?: Partial<Record<FateSplitStressField, Record<string, unknown>>>;
}
