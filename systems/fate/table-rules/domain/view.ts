import type { SecretProjection, TableResource, TableRulesActivation, TableRulesPreview } from "@skald/sheet-sdk/modules/table-rules";

/**
 * The Fate table projection fate_table_view returns, narrowed from JSON. The server decides what
 * a viewer gets: a GM runner's `gmOnly` part is absent for everyone else, so `aspects.gmOnly` and
 * `grants.gmOnly` exist only for them (the kit's SecretProjection), and players get only the
 * wallets, compels and ledger of the PCs they play.
 */
export type FateAspectRef =
  | { readonly kind: "scene"; readonly sceneAspectId: string }
  | { readonly kind: "character"; readonly characterId: string; readonly aspectId: string };

/** `hidden`: a character the viewer cannot read holds it. */
export type FateGrantHolder =
  | { readonly kind: "gm" }
  | { readonly kind: "character"; readonly characterId: string }
  | { readonly kind: "hidden" };

export interface FateSceneAspect {
  readonly id: string;
  readonly kind: "situation" | "boost";
  readonly scope: "scene" | "zone" | "character";
  readonly zoneId: string | null;
  /** Null when the aspect is on a character the viewer cannot read. */
  readonly characterId: string | null;
  readonly text: string;
  readonly revision: number;
}

export interface FateInvokeGrant {
  readonly id: string;
  readonly aspect: FateAspectRef;
  readonly holder: FateGrantHolder;
  readonly remaining: number;
  readonly isBoost: boolean;
  readonly revision: number;
  /** Display hint; the server rechecks the holder. */
  readonly canUse: boolean;
}

export interface FateZone {
  readonly id: string;
  readonly name: string;
  readonly revision: number;
}

export interface FateScene {
  readonly id: string;
  readonly ordinal: number;
  readonly title: string;
  readonly status: "open";
  readonly playSessionId: string;
  readonly revision: number;
  readonly openedAt: string;
  readonly roster: readonly string[];
  readonly zones: readonly FateZone[];
  readonly aspects: SecretProjection<FateSceneAspect, FateSceneAspect>;
  readonly grants: SecretProjection<FateInvokeGrant, FateInvokeGrant>;
}

export type FateWallet = TableResource & {
  readonly characterId: string;
  readonly name: string;
  readonly refreshedPlaySessionId: string | null;
};

export type FateCompelStatus = "pending" | "accepted" | "refused" | "withdrawn" | "expired";

export interface FateCompelOffer {
  readonly id: string;
  readonly sceneId: string;
  readonly targetCharacterId: string;
  readonly targetUserId: string;
  readonly aspect: FateAspectRef;
  readonly trouble: string;
  readonly status: FateCompelStatus;
  readonly revision: number;
  readonly terminalOperationId: string | null;
  readonly createdAt: string;
}

export type FateLedgerKind =
  | "seed" | "session_refresh" | "compel_accept" | "compel_refuse" | "give" | "hand_in"
  | "invoke_paid" | "credit_booked" | "pool_open" | "pool_npc_credit" | "pool_close";

export interface FateLedgerEndpoint {
  readonly kind: "supply" | "wallet" | "pool" | "deferred" | "void";
  readonly characterId: string | null;
}

export interface FateLedgerEntry {
  readonly id: number;
  readonly kind: FateLedgerKind;
  readonly sceneId: string | null;
  readonly playSessionId: string | null;
  readonly from: FateLedgerEndpoint;
  readonly to: FateLedgerEndpoint;
  readonly amount: number;
  readonly reason: string;
  readonly createdAt: string;
}

export interface FateDeferredCreditRow {
  readonly id: string;
  readonly characterId: string;
  readonly beneficiaryKind?: "pc" | "npc";
}

export interface FateGmView {
  readonly gmRevision: number;
  readonly pool: (TableResource & { readonly sceneId: string; readonly base: number; readonly npcCredits: number }) | null;
  readonly pendingCredits: readonly FateDeferredCreditRow[];
  readonly npcCredits: readonly FateDeferredCreditRow[];
}

export interface FateTableView {
  readonly activation: TableRulesActivation;
  readonly revision: number;
  readonly playSession: { readonly id: string; readonly ordinal: number; readonly startedAt: string } | null;
  readonly scene: FateScene | null;
  readonly wallets: readonly FateWallet[];
  readonly offers: readonly FateCompelOffer[];
  readonly ledger: readonly FateLedgerEntry[];
  /** GM runners only. */
  readonly gm?: FateGmView;
}

class FateViewError extends Error {}

function fail(path: string): never {
  throw new FateViewError(`fate view: ${path}`);
}

function record(value: unknown, path: string): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : fail(path);
}

function text(value: unknown, path: string): string {
  return typeof value === "string" ? value : fail(path);
}

function nullableText(value: unknown, path: string): string | null {
  return value === null || value === undefined ? null : text(value, path);
}

function count(value: unknown, path: string): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : fail(path);
}

function flag(value: unknown, path: string): boolean {
  return typeof value === "boolean" ? value : fail(path);
}

function list<T>(value: unknown, path: string, item: (entry: unknown, path: string) => T): T[] {
  return Array.isArray(value) ? value.map((entry, index) => item(entry, `${path}[${index}]`)) : fail(path);
}

function oneOf<T extends string>(value: unknown, options: readonly T[], path: string): T {
  return typeof value === "string" && (options as readonly string[]).includes(value) ? value as T : fail(path);
}

function aspectRef(value: unknown, path: string): FateAspectRef {
  const row = record(value, path);
  if (row.kind === "scene") return { kind: "scene", sceneAspectId: text(row.sceneAspectId, `${path}.sceneAspectId`) };
  if (row.kind === "character") {
    return { kind: "character", characterId: text(row.characterId, `${path}.characterId`), aspectId: text(row.aspectId, `${path}.aspectId`) };
  }
  return fail(`${path}.kind`);
}

function holder(value: unknown, path: string): FateGrantHolder {
  const row = record(value, path);
  if (row.kind === "gm" || row.kind === "hidden") return { kind: row.kind };
  if (row.kind === "character") return { kind: "character", characterId: text(row.characterId, `${path}.characterId`) };
  return fail(`${path}.kind`);
}

function sceneAspect(value: unknown, path: string): FateSceneAspect {
  const row = record(value, path);
  return {
    id: text(row.id, `${path}.id`),
    kind: oneOf(row.kind, ["situation", "boost"], `${path}.kind`),
    scope: oneOf(row.scope, ["scene", "zone", "character"], `${path}.scope`),
    zoneId: nullableText(row.zoneId, `${path}.zoneId`),
    characterId: nullableText(row.characterId, `${path}.characterId`),
    text: text(row.text, `${path}.text`),
    revision: count(row.revision, `${path}.revision`),
  };
}

function grant(value: unknown, path: string): FateInvokeGrant {
  const row = record(value, path);
  return {
    id: text(row.id, `${path}.id`),
    aspect: aspectRef(row.aspect, `${path}.aspect`),
    holder: holder(row.holder, `${path}.holder`),
    remaining: count(row.remaining, `${path}.remaining`),
    isBoost: flag(row.isBoost, `${path}.isBoost`),
    revision: count(row.revision, `${path}.revision`),
    canUse: flag(row.canUse, `${path}.canUse`),
  };
}

function zone(value: unknown, path: string): FateZone {
  const row = record(value, path);
  return { id: text(row.id, `${path}.id`), name: text(row.name, `${path}.name`), revision: count(row.revision, `${path}.revision`) };
}

function wallet(value: unknown, path: string): FateWallet {
  const row = record(value, path);
  const characterId = text(row.characterId, `${path}.characterId`);
  return {
    id: characterId,
    unit: "fatePoint",
    canView: true,
    canOperate: flag(row.canOperate, `${path}.canOperate`),
    revision: count(row.revision, `${path}.revision`),
    value: count(row.available, `${path}.available`),
    characterId,
    name: text(row.name, `${path}.name`),
    refreshedPlaySessionId: nullableText(row.refreshedPlaySessionId, `${path}.refreshedPlaySessionId`),
  };
}

const compelStatuses: readonly FateCompelStatus[] = ["pending", "accepted", "refused", "withdrawn", "expired"];

function offer(value: unknown, path: string): FateCompelOffer {
  const row = record(value, path);
  return {
    id: text(row.id, `${path}.id`),
    sceneId: text(row.sceneId, `${path}.sceneId`),
    targetCharacterId: text(row.targetCharacterId, `${path}.targetCharacterId`),
    targetUserId: text(row.targetUserId, `${path}.targetUserId`),
    aspect: aspectRef(row.aspect, `${path}.aspect`),
    trouble: text(row.trouble, `${path}.trouble`),
    status: oneOf(row.status, compelStatuses, `${path}.status`),
    revision: count(row.revision, `${path}.revision`),
    terminalOperationId: nullableText(row.terminalOperationId, `${path}.terminalOperationId`),
    createdAt: text(row.createdAt, `${path}.createdAt`),
  };
}

const ledgerKinds: readonly FateLedgerKind[] = [
  "seed", "session_refresh", "compel_accept", "compel_refuse", "give", "hand_in",
  "invoke_paid", "credit_booked", "pool_open", "pool_npc_credit", "pool_close",
];

function endpoint(value: unknown, path: string): FateLedgerEndpoint {
  const row = record(value, path);
  return {
    kind: oneOf(row.kind, ["supply", "wallet", "pool", "deferred", "void"], `${path}.kind`),
    characterId: nullableText(row.characterId, `${path}.characterId`),
  };
}

function ledgerEntry(value: unknown, path: string): FateLedgerEntry {
  const row = record(value, path);
  return {
    id: count(row.id, `${path}.id`),
    kind: oneOf(row.kind, ledgerKinds, `${path}.kind`),
    sceneId: nullableText(row.sceneId, `${path}.sceneId`),
    playSessionId: nullableText(row.playSessionId, `${path}.playSessionId`),
    from: endpoint(row.from, `${path}.from`),
    to: endpoint(row.to, `${path}.to`),
    amount: count(row.amount, `${path}.amount`),
    reason: text(row.reason, `${path}.reason`),
    createdAt: text(row.createdAt, `${path}.createdAt`),
  };
}

function credit(value: unknown, path: string): FateDeferredCreditRow {
  const row = record(value, path);
  const kind = row.beneficiaryKind === undefined ? undefined : oneOf(row.beneficiaryKind, ["pc", "npc"], `${path}.beneficiaryKind`);
  return { id: text(row.id, `${path}.id`), characterId: text(row.characterId, `${path}.characterId`), ...(kind ? { beneficiaryKind: kind } : {}) };
}

export function parseTableRulesActivation(value: unknown, path = "activation"): TableRulesActivation {
  const row = record(value, path);
  const revision = count(row.revision, `${path}.revision`);
  if (row.status === "inactive") return { status: "inactive", revision };
  if (row.status === "active") return { status: "active", revision, protocolVersion: count(row.protocolVersion, `${path}.protocolVersion`) };
  return fail(`${path}.status`);
}

/** Narrow fate_table_view's JSON; throws on anything else (the kit reports `invalid`). */
export function parseFateTableView(raw: unknown): FateTableView {
  const root = record(raw, "view");
  const gmOnly = root.gmOnly === undefined ? undefined : record(root.gmOnly, "gmOnly");
  const rawScene = root.scene === null || root.scene === undefined ? null : record(root.scene, "scene");
  const scene: FateScene | null = rawScene && {
    id: text(rawScene.id, "scene.id"),
    ordinal: count(rawScene.ordinal, "scene.ordinal"),
    title: text(rawScene.title, "scene.title"),
    status: oneOf(rawScene.status, ["open"], "scene.status"),
    playSessionId: text(rawScene.playSessionId, "scene.playSessionId"),
    revision: count(rawScene.revision, "scene.revision"),
    openedAt: text(rawScene.openedAt, "scene.openedAt"),
    roster: list(rawScene.roster, "scene.roster", text),
    zones: list(rawScene.zones, "scene.zones", zone),
    aspects: {
      public: list(rawScene.aspects, "scene.aspects", sceneAspect),
      ...(gmOnly ? { gmOnly: list(gmOnly.secretAspects, "gmOnly.secretAspects", sceneAspect) } : {}),
    },
    grants: {
      public: list(rawScene.grants, "scene.grants", grant),
      ...(gmOnly ? { gmOnly: list(gmOnly.secretGrants, "gmOnly.secretGrants", grant) } : {}),
    },
  };
  const rawSession = root.playSession === null || root.playSession === undefined ? null : record(root.playSession, "playSession");
  let gm: FateGmView | undefined;
  if (gmOnly) {
    const rawPool = gmOnly.pool === null || gmOnly.pool === undefined ? null : record(gmOnly.pool, "gmOnly.pool");
    gm = {
      gmRevision: count(gmOnly.gmRevision, "gmOnly.gmRevision"),
      pool: rawPool && {
        id: text(rawPool.sceneId, "gmOnly.pool.sceneId"),
        unit: "fatePoint",
        canView: true,
        canOperate: true,
        revision: count(rawPool.revision, "gmOnly.pool.revision"),
        value: count(rawPool.available, "gmOnly.pool.available"),
        sceneId: text(rawPool.sceneId, "gmOnly.pool.sceneId"),
        base: count(rawPool.base, "gmOnly.pool.base"),
        npcCredits: count(rawPool.npcCredits, "gmOnly.pool.npcCredits"),
      },
      pendingCredits: list(gmOnly.pendingCredits, "gmOnly.pendingCredits", credit),
      npcCredits: list(gmOnly.npcCredits, "gmOnly.npcCredits", credit),
    };
  }
  return {
    activation: parseTableRulesActivation(root.activation),
    revision: count(root.revision, "revision"),
    playSession: rawSession && {
      id: text(rawSession.id, "playSession.id"),
      ordinal: count(rawSession.ordinal, "playSession.ordinal"),
      startedAt: text(rawSession.startedAt, "playSession.startedAt"),
    },
    scene,
    wallets: list(root.wallets, "wallets", wallet),
    offers: list(root.offers, "offers", offer),
    ledger: list(root.ledger, "ledger", ledgerEntry),
    ...(gm ? { gm } : {}),
  };
}

export interface FateActivationCandidate {
  readonly characterId: string;
  readonly name: string;
  readonly userId: string;
  /** Already has a wallet (an earlier activation): kept, not reseeded. */
  readonly enrolled: boolean;
  readonly fatePoints: number;
  readonly refresh: number;
}

export interface FateSceneCandidate {
  readonly characterId: string;
  readonly name: string;
  readonly userId: string;
  readonly selectedByDefault: boolean;
  readonly enrolled: boolean;
  readonly fatePoints: number;
}

export type FateScenePreviewDetails =
  | {
    readonly change: "open";
    readonly playSessionId: string;
    readonly nextOrdinal: number;
    readonly candidates: readonly FateSceneCandidate[];
    readonly npcCredits: readonly { readonly creditId: string; readonly characterId: string; readonly name: string }[];
  }
  | {
    readonly change: "close";
    readonly sceneId: string;
    readonly ordinal: number;
    readonly pendingOffers: readonly { readonly offerId: string; readonly targetCharacterId: string }[];
    readonly pendingCredits: readonly { readonly creditId: string; readonly characterId: string; readonly beneficiaryKind: "pc" | "npc" }[];
    readonly activeGrants: number;
    readonly activeBoosts: number;
    readonly poolAvailable: number;
  };

function preview<Details>(raw: unknown, details: (value: unknown) => Details): TableRulesPreview<Details> {
  const root = record(raw, "preview");
  return { token: text(root.token, "preview.token"), details: details(root.details) };
}

export function parseFateActivationPreview(raw: unknown): TableRulesPreview<{
  readonly revision: number;
  readonly candidates: readonly FateActivationCandidate[];
}> {
  return preview(raw, (value) => {
    const row = record(value, "details");
    return {
      revision: count(row.revision, "details.revision"),
      candidates: list(row.candidates, "details.candidates", (entry, path) => {
        const c = record(entry, path);
        return {
          characterId: text(c.characterId, `${path}.characterId`),
          name: text(c.name, `${path}.name`),
          userId: text(c.userId, `${path}.userId`),
          enrolled: flag(c.enrolled, `${path}.enrolled`),
          fatePoints: count(c.fatePoints, `${path}.fatePoints`),
          refresh: count(c.refresh, `${path}.refresh`),
        };
      }),
    };
  });
}

export function parseFateScenePreview(raw: unknown): TableRulesPreview<FateScenePreviewDetails> {
  return preview(raw, (value): FateScenePreviewDetails => {
    const row = record(value, "details");
    if (row.change === "open") {
      return {
        change: "open",
        playSessionId: text(row.playSessionId, "details.playSessionId"),
        nextOrdinal: count(row.nextOrdinal, "details.nextOrdinal"),
        candidates: list(row.candidates, "details.candidates", (entry, path) => {
          const c = record(entry, path);
          return {
            characterId: text(c.characterId, `${path}.characterId`),
            name: text(c.name, `${path}.name`),
            userId: text(c.userId, `${path}.userId`),
            selectedByDefault: flag(c.selectedByDefault, `${path}.selectedByDefault`),
            enrolled: flag(c.enrolled, `${path}.enrolled`),
            fatePoints: count(c.fatePoints, `${path}.fatePoints`),
          };
        }),
        npcCredits: list(row.npcCredits, "details.npcCredits", (entry, path) => {
          const c = record(entry, path);
          return { creditId: text(c.creditId, `${path}.creditId`), characterId: text(c.characterId, `${path}.characterId`), name: text(c.name, `${path}.name`) };
        }),
      };
    }
    if (row.change === "close") {
      return {
        change: "close",
        sceneId: text(row.sceneId, "details.sceneId"),
        ordinal: count(row.ordinal, "details.ordinal"),
        pendingOffers: list(row.pendingOffers, "details.pendingOffers", (entry, path) => {
          const c = record(entry, path);
          return { offerId: text(c.offerId, `${path}.offerId`), targetCharacterId: text(c.targetCharacterId, `${path}.targetCharacterId`) };
        }),
        pendingCredits: list(row.pendingCredits, "details.pendingCredits", (entry, path) => {
          const c = record(entry, path);
          return {
            creditId: text(c.creditId, `${path}.creditId`),
            characterId: text(c.characterId, `${path}.characterId`),
            beneficiaryKind: oneOf(c.beneficiaryKind, ["pc", "npc"], `${path}.beneficiaryKind`),
          };
        }),
        activeGrants: count(row.activeGrants, "details.activeGrants"),
        activeBoosts: count(row.activeBoosts, "details.activeBoosts"),
        poolAvailable: count(row.poolAvailable, "details.poolAvailable"),
      };
    }
    return fail("details.change");
  });
}

/** The card owner's carry-out input: the booked balance only (no grants, credits, offers or receipts). */
export interface FateSettledSnapshot {
  readonly characterId: string;
  readonly fatePoints: number;
  readonly walletRevision: number;
  readonly tableRevision: number;
  readonly activation: TableRulesActivation;
  /** The table was deleted (after deactivation); this read is all that is left of it. */
  readonly tableDeleted: boolean;
}

export function parseFateSettledSnapshot(raw: unknown): FateSettledSnapshot {
  const row = record(raw, "snapshot");
  return {
    characterId: text(row.characterId, "snapshot.characterId"),
    fatePoints: count(row.fatePoints, "snapshot.fatePoints"),
    walletRevision: count(row.walletRevision, "snapshot.walletRevision"),
    tableRevision: count(row.tableRevision, "snapshot.tableRevision"),
    activation: parseTableRulesActivation(row.activation, "snapshot.activation"),
    tableDeleted: flag(row.tableDeleted, "snapshot.tableDeleted"),
  };
}

/** A command's committed result: a JSON object (the receipt's `result`). */
export function parseFateCommandResult(raw: unknown): Readonly<Record<string, unknown>> {
  return record(raw, "result");
}
