/** Content pack limits (design §1.8), enforced by the proxy, the validator and the snapshot rule. */
export const PACK_LIMITS = {
  /** Largest pack file, UTF-8 bytes. */
  fileBytes: 12_000_000,
  /** Most entries in `payload.entries`. */
  entries: 5_000,
  /** Longest string, in characters. */
  stringChars: 20_000,
  /** Deepest `entries` tree. */
  depth: 12,
  /** Largest total of pack text copied into one character (UTF-8 bytes of the snapshot rows). */
  snapshotBytes: 200 * 1024,
  /**
   * Largest total of the packs of one system cached on one device, UTF-8 bytes (B-025): the
   * product limit on how many packs a user keeps, checked when a pack is added or updated.
   */
  deviceBytes: 48_000_000,
  /** Each enabled pack's link is checked for an update at most this often per device, unless asked. */
  checkIntervalMs: 24 * 60 * 60 * 1000,
} as const;

export const PACK_ID_PATTERN = /^[a-z0-9][a-z0-9/-]{0,199}$/;
