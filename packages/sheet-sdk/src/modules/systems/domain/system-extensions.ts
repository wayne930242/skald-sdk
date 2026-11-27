/**
 * Private extensions of a public System (ADR 0021): text, data and assets a public plugin may show
 * only to the accounts that read the extension. The plugin never knows the private content; it
 * knows the extension-point ids in its own public data, asks its host which extensions the caller
 * reads, and loads the parts it needs, keyed by those ids. A host without extensions (the SDK
 * previewer, a test) answers that there are none, and the plugin shows its public fallbacks.
 */

/** The data parts an extension can provide; `rules` and `names` are per locale. */
export const SYSTEM_EXTENSION_PARTS = ["rules", "names", "gameData"] as const;
export type SystemExtensionPart = (typeof SYSTEM_EXTENSION_PARTS)[number];

export function isSystemExtensionPart(value: string): value is SystemExtensionPart {
  return (SYSTEM_EXTENSION_PARTS as readonly string[]).includes(value);
}

/** An extension the caller reads, and what it provides. */
export interface SystemExtensionSummary {
  readonly slug: string;
  readonly parts: readonly SystemExtensionPart[];
  /** Names of the binary or large assets it serves (a map SVG, …). */
  readonly assets: readonly string[];
}

/**
 * What a host lends a System plugin for its extensions. Every answer belongs to the signed-in
 * caller and may change on the next call (a grant is revoked at once), so callers never cache it
 * across sessions. A failure reads as "not available", never as an error the sheet must handle.
 */
export interface SystemExtensionsPort {
  /** The extensions of `systemSlug` the caller reads; empty for none and on any failure. */
  list(systemSlug: string): Promise<readonly SystemExtensionSummary[]>;
  /** One part of an extension, for `locale`; null when the caller does not read it, or on failure. */
  load(systemSlug: string, extensionSlug: string, part: SystemExtensionPart, locale: string): Promise<unknown>;
  /** One asset of an extension; null when the caller does not read it, or on failure. */
  loadAsset(systemSlug: string, extensionSlug: string, name: string): Promise<Blob | null>;
}

/** The port of a host that serves no extensions: the SDK previewer, tests. */
export const NO_SYSTEM_EXTENSIONS: SystemExtensionsPort = {
  list: async () => [],
  load: async () => null,
  loadAsset: async () => null,
};
