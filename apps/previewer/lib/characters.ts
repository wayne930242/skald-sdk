/**
 * Local characters: a sample JSON per system (apps/previewer/characters), a blank sheet, and the
 * character this browser last edited (localStorage). A character is a JSON object over the
 * system's default data, the shape Skald stores.
 */
import fateSample from "../characters/fate-condensed.json";
import dndSample from "../characters/dnd5e-2024.json";

export type CharacterData = Record<string, unknown>;
export type CharacterSource = "blank" | "sample" | "saved";

const SAMPLES: Readonly<Record<string, CharacterData>> = {
  "fate-condensed": fateSample,
  "dnd5e-2024": dndSample,
};

const storageKey = (slug: string) => `skald-previewer:${slug}:character`;

const isCharacter = (value: unknown): value is CharacterData =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export function readStoredCharacter(slug: string): CharacterData | null {
  try {
    const raw = window.localStorage.getItem(storageKey(slug));
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return isCharacter(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function storeCharacter(slug: string, data: CharacterData): void {
  try {
    window.localStorage.setItem(storageKey(slug), JSON.stringify(data));
  } catch (error) {
    // A full or disabled storage keeps the edit on screen only; say so in the console.
    console.error("[previewer] could not save the character to localStorage", error);
  }
}

/** The character a source names, over the system's default data. */
export function characterFrom(source: Exclude<CharacterSource, "saved">, slug: string, defaultData: CharacterData): CharacterData {
  return source === "sample" ? { ...defaultData, ...structuredClone(SAMPLES[slug] ?? {}) } : structuredClone(defaultData);
}

/** What the sheet opens with: the saved character, else the sample. */
export function initialCharacter(slug: string, defaultData: CharacterData): { key: number; source: CharacterSource; data: CharacterData } {
  const stored = readStoredCharacter(slug);
  return stored
    ? { key: 0, source: "saved", data: stored }
    : { key: 0, source: "sample", data: characterFrom("sample", slug, defaultData) };
}

/** A JSON file's character, or null when the file holds something else. */
export function parseCharacterJson(text: string): CharacterData | null {
  try {
    const parsed: unknown = JSON.parse(text);
    return isCharacter(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
