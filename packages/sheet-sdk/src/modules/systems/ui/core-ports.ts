import type { AnchorHTMLAttributes, ComponentType } from "react";
import type { DiceRoll } from "@skald/dice";
import type { ExcelFormulaEvaluator } from "@skald/dice/formula";
import type { GameIconSource } from "@skald/sheet-sdk/lib/game-icons/client";
import { defineHostPort } from "./host-ports";
import type { PdfRenderer } from "./system-print";

/** Who is rolling at which table: the session a roll is posted to. */
export interface BoundRollSession {
  currentUserId: string;
  currentUserName: string;
  currentUserAvatarUrl: string | null;
  currentTableId: string;
}

/** Posts `roll` to the session's chat; resolves false when it was not posted. */
export type RollSessionTransport = (roll: DiceRoll, session: BoundRollSession) => Promise<boolean>;

/** Uploading a character's portrait image as the signed-in user. */
export interface PortraitUploadPort {
  /** Calls `listener` when who is signed in changes; returns the unsubscribe. */
  subscribe(listener: () => void): () => void;
  /** Whether someone is signed in now: the upload is stored under their account. */
  isSignedIn(): boolean;
  /** Stores `file` as `characterId`'s portrait and resolves with its public URL. */
  upload(characterId: string, file: File): Promise<string>;
}

/** A link to a page of the host app; `href` is the path without the locale prefix. */
export type NavigationLink = ComponentType<AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }>;

/** Starts the Excel engine for `{{excel:…}}` formulas (loaded on demand). */
export type ExcelFormulaEvaluatorFactory = () => Promise<ExcelFormulaEvaluator>;

/**
 * The ports sheet code reads from its host. The app registers every one of them
 * (`app/[locale]/host-ports.tsx`, checked by a test); another host registers those it can
 * serve, and the rest show as unavailable.
 */
export const corePorts = {
  /** Posts a roll to the bound table session's chat. */
  rollSessionSender: defineHostPort<RollSessionTransport>("rollSessionSender"),
  portraitUpload: defineHostPort<PortraitUploadPort>("portraitUpload"),
  navigationLink: defineHostPort<NavigationLink>("navigationLink"),
  /** game-icons.net SVGs, fetched on demand (the 6.7 MB set never ships to the browser). */
  gameIconSource: defineHostPort<GameIconSource>("gameIconSource"),
  /** Renders the serialized print pages to a PDF (下載 PDF). */
  pdfRenderer: defineHostPort<PdfRenderer>("pdfRenderer"),
  excelFormulaEvaluator: defineHostPort<ExcelFormulaEvaluatorFactory>("excelFormulaEvaluator"),
} as const;

export type CorePortId = keyof typeof corePorts;
