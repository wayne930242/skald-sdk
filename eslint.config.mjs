import { readFileSync } from "node:fs";
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Font-size guard, as in the private source: sheets use the text-3xs / text-2xs / text-xs tokens
// (packages/sheet-sdk/src/styles/sheet-sdk.css @theme), never an arbitrary text-[Npx].
const ARBITRARY_TEXT_SIZE_MESSAGE =
  "Do not use text-[Npx]. Use the text-3xs / text-2xs / text-xs tokens; add a new size to the @theme in sheet-sdk.css.";
const NO_ARBITRARY_TEXT_SIZE = [
  { selector: "Literal[value=/text-\\[\\d/]", message: ARBITRARY_TEXT_SIZE_MESSAGE },
  { selector: "TemplateElement[value.raw=/text-\\[\\d/]", message: ARBITRARY_TEXT_SIZE_MESSAGE },
];

// Systems reach the SDK and each other only through @skald/* packages, and npm only through the
// packages a system declares (plus the shared toolchain). Everything else is a relative import
// inside the system.
const packageNames = (file) => {
  const json = JSON.parse(readFileSync(new URL(file, import.meta.url), "utf8"));
  return Object.keys({ ...json.dependencies, ...json.devDependencies });
};
const escape = (name) => name.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
const PURE_CODE = {
  regex: "^(?:react(?:-dom)?|next(?:-intl)?)(?:/|$)|\\.tsx$",
  message: "Plugin manifests and domain code must not import React, Next.js, or TSX.",
};
// no-restricted-imports in flat config replaces rather than merges, so the manifest and domain
// block repeats the system pattern.
const systemImports = (system) => {
  const allowed = [...packageNames(`./systems/${system}/package.json`), "vitest", "@testing-library/react"]
    .filter((name) => !name.startsWith("@skald/"))
    // A types package names the module it types: @types/mdast for `import type … from "mdast"`.
    .map((name) => escape(name.replace(/^@types\//, "")));
  const pattern = {
    regex: `^(?!\\.|node:|@skald/|(?:${allowed.join("|")})(?:/|$))`,
    message: "A system imports @skald/* packages, its own files, node: builtins, and the npm packages its package.json declares.",
  };
  return [
    {
      files: [`systems/${system}/**/*.{ts,tsx}`],
      ignores: [`systems/${system}/vitest.config.ts`],
      rules: { "no-restricted-imports": ["error", { patterns: [pattern] }] },
    },
    {
      files: [`systems/${system}/plugin.ts`, `systems/${system}/domain/**`],
      rules: { "no-restricted-imports": ["error", { patterns: [pattern, PURE_CODE] }] },
    },
  ];
};

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores(["**/node_modules/**", "**/.next/**", "**/next-env.d.ts", "**/dist/**"]),
  {
    settings: { next: { rootDir: "apps/previewer" } },
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
      }],
    },
  },
  ...systemImports("fate"),
  ...systemImports("dnd5e"),
  {
    files: ["packages/sheet-sdk/src/**/*.tsx", "systems/**/*.tsx", "apps/previewer/**/*.tsx"],
    rules: {
      "no-restricted-syntax": ["error", ...NO_ARBITRARY_TEXT_SIZE],
    },
  },
]);
