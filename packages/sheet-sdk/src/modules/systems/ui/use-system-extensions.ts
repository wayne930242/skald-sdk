"use client";

import { useCallback, useEffect, useState } from "react";
import {
  NO_SYSTEM_EXTENSIONS,
  type SystemExtensionPart,
  type SystemExtensionSummary,
} from "../domain/system-extensions";
import { corePorts } from "./core-ports";
import { useHostPort } from "./host-ports";

export interface SystemExtensionsView {
  /** "loading" until the host answered for this System; then "ready" (an empty list included). */
  readonly status: "loading" | "ready";
  readonly extensions: readonly SystemExtensionSummary[];
  /** One part of an extension of this System; null when the caller does not read it. */
  load(extensionSlug: string, part: SystemExtensionPart, locale: string): Promise<unknown>;
  /** One asset of an extension of this System; null when the caller does not read it. */
  loadAsset(extensionSlug: string, name: string): Promise<Blob | null>;
}

const EMPTY: readonly SystemExtensionSummary[] = [];

/**
 * The private extensions of `systemSlug` the signed-in caller reads (ADR 0021), asked of the host
 * once per mount and System. Call it only where extension content is about to be shown (a rules
 * chapter opened, a wizard step listing extension options), never on a sheet's first load. A host
 * that registers no `systemExtensions` port has none; pass null to ask nothing.
 */
export function useSystemExtensions(systemSlug: string | null): SystemExtensionsView {
  const port = useHostPort(corePorts.systemExtensions) ?? NO_SYSTEM_EXTENSIONS;
  const [answer, setAnswer] = useState<{ systemSlug: string; extensions: readonly SystemExtensionSummary[] } | null>(null);

  useEffect(() => {
    if (systemSlug === null) return;
    let live = true;
    port.list(systemSlug).then(
      (extensions) => live && setAnswer({ systemSlug, extensions }),
      () => live && setAnswer({ systemSlug, extensions: EMPTY }),
    );
    return () => {
      live = false;
    };
  }, [port, systemSlug]);

  const load = useCallback(
    (extensionSlug: string, part: SystemExtensionPart, locale: string) =>
      systemSlug === null ? Promise.resolve(null) : port.load(systemSlug, extensionSlug, part, locale).catch(() => null),
    [port, systemSlug],
  );
  const loadAsset = useCallback(
    (extensionSlug: string, name: string) =>
      systemSlug === null ? Promise.resolve(null) : port.loadAsset(systemSlug, extensionSlug, name).catch(() => null),
    [port, systemSlug],
  );

  const current = systemSlug !== null && answer?.systemSlug === systemSlug ? answer.extensions : null;
  return {
    status: systemSlug === null || current !== null ? "ready" : "loading",
    extensions: current ?? EMPTY,
    load,
    loadAsset,
  };
}
