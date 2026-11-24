/**
 * A content pack link: a Google Drive file shared as "anyone with the link"
 * (design §9). Only the file id is taken from the pasted text; the server
 * fetches its own download URL built from that id, so nothing else in the
 * pasted link reaches a request.
 */

/** Hosts a pasted link may name; the proxy follows redirects only to these and Google's download hosts. */
export const DRIVE_LINK_HOSTS = ["drive.google.com", "drive.usercontent.google.com", "docs.google.com"] as const;

/** Longest link accepted, the same bound as the link table's check constraint. */
export const MAX_LINK_CHARS = 2048;

const FILE_ID = /^[A-Za-z0-9_-]{10,200}$/;

/**
 * The Drive file id of a share or download link, or null:
 * `drive.google.com/file/d/<id>/…`, `drive.google.com/open?id=<id>`,
 * `drive.google.com/uc?id=<id>`, `drive.usercontent.google.com/download?id=<id>`,
 * `docs.google.com/uc?id=<id>`.
 */
export function extractDriveFileId(value: unknown): string | null {
  if (typeof value !== "string" || value.length > MAX_LINK_CHARS) return null;
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.port !== "" || url.username !== "" || url.password !== "") return null;
  if (!(DRIVE_LINK_HOSTS as readonly string[]).includes(url.hostname)) return null;
  const segments = url.pathname.split("/").filter(Boolean);
  let id: string | null = null;
  if (url.hostname === "drive.google.com" && segments[0] === "file" && segments[1] === "d") id = segments[2] ?? null;
  else if (
    (url.hostname === "drive.google.com" && (segments[0] === "open" || segments[0] === "uc") && segments.length === 1) ||
    (url.hostname === "docs.google.com" && segments[0] === "uc" && segments.length === 1) ||
    (url.hostname === "drive.usercontent.google.com" && segments[0] === "download" && segments.length === 1)
  ) {
    id = url.searchParams.get("id");
  }
  return id && FILE_ID.test(id) ? id : null;
}

/**
 * The link saved for file `id`: one canonical form whatever case, port or
 * query the pasted link had, so the link table's check always accepts it.
 */
export function canonicalDriveLink(id: string): string {
  if (!FILE_ID.test(id)) throw new Error("not a Drive file id");
  return `https://drive.google.com/file/d/${id}/view`;
}

/** The one URL the proxy fetches for file `id`. */
export function driveDownloadUrl(id: string): string {
  if (!FILE_ID.test(id)) throw new Error("not a Drive file id");
  return `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`;
}
