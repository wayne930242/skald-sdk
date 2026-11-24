/**
 * Genre themes (類型主題): the look of a table session, chosen per game system.
 *
 * Add a genre here, give it a token block in styles/genre-themes.css, and
 * the GM's picker and the contrast test pick it up.
 */

export const GENRE_IDS = ["neutral", "hardboiled", "cozy", "eastern"] as const;

/** `neutral` is no theme: the shell's own look */
export type GenreId = (typeof GENRE_IDS)[number];

export function isGenreId(value: unknown): value is GenreId {
  return typeof value === "string" && (GENRE_IDS as readonly string[]).includes(value);
}
