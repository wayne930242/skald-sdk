/**
 * The pack's seal: `hash` is the SHA-256 of the canonical JSON of every other top-level key, so the
 * file's own layout (indentation, key order) does not change it. Canonical JSON is the one the
 * `skald/pack/v1` format uses: `JSON.stringify` of objects rebuilt with their keys sorted by UTF-16
 * code unit, no spaces, one trailing LF. JavaScript lists integer-like keys ("9", "10") first and
 * in numeric order whatever the insertion order, so those come before the others, as in that format.
 */

export function canonicalJson(value: unknown): string {
  return (
    JSON.stringify(value, (_key, child: unknown) => {
      if (child && typeof child === "object" && !Array.isArray(child)) {
        return Object.fromEntries(Object.entries(child).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
      }
      return child;
    }) + "\n"
  );
}

/** SHA-256 hex of the UTF-8 bytes of `text` (Web Crypto: browser, worker, Node and Bun). */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** The hash of a pack: over every key but `hash` itself. */
export function systemPackHash(pack: Record<string, unknown>): Promise<string> {
  const { hash: _hash, ...content } = pack;
  return sha256Hex(canonicalJson(content));
}
