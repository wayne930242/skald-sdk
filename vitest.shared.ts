/**
 * The vitest setup the packages share. Each package runs its own tests from its own directory
 * (`bun run test` at the root runs them all), so a test that reads data relative to
 * `process.cwd()` finds it under the package, as it does in the private source repo.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));
const at = (...segments: string[]) => path.join(root, ...segments);

/** The same @skald/* specifiers tsconfig.base.json maps, for vite. */
export const skaldAliases = [
  { find: /^@skald\/types$/, replacement: at("packages/types/src/public.ts") },
  { find: /^@skald\/types\/(.*)$/, replacement: at("packages/types/src/$1") },
  { find: /^@skald\/dice$/, replacement: at("packages/dice/src/index.ts") },
  { find: /^@skald\/dice\/(.*)$/, replacement: at("packages/dice/src/$1") },
  { find: /^@skald\/formula$/, replacement: at("packages/formula/src/index.ts") },
  { find: /^@skald\/formula\/(.*)$/, replacement: at("packages/formula/src/$1") },
  { find: /^@skald\/sheet-sdk\/(.*)$/, replacement: at("packages/sheet-sdk/src/$1") },
  { find: /^@skald\/system-fate\/(.*)$/, replacement: at("systems/fate/$1") },
  { find: /^@skald\/system-dnd5e\/(.*)$/, replacement: at("systems/dnd5e/$1") },
];

export default defineConfig({
  plugins: [react()],
  resolve: { alias: skaldAliases },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: [at("vitest.setup.ts")],
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["**/node_modules/**", "**/.next/**"],
  },
});
