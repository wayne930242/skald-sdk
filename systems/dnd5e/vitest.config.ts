/**
 * Every D&D test file runs here. data/dnd5e-2024/zh-availability.json lists the zh-TW files this
 * repository does not carry yet (each holds the English text); a case that reads zh-TW text from
 * one of them skips through `zhWithheld` (__tests__/zh-withheld.ts) and runs again once the file
 * is retranslated and cleared.
 */
export { default } from "../../vitest.shared";
