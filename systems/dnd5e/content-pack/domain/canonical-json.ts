/**
 * The pipeline's canonical JSON (`scripts/dnd5e-2024/lib/canonical-json.ts`):
 * object keys sorted by UTF-16 code unit, no spaces, one trailing LF. A pack's
 * `payloadSha256` is the SHA-256 of `canonicalJson(payload)`.
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

/** SHA-256 hex of the UTF-8 bytes of `text` (Web Crypto: browser, worker and Node). */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
