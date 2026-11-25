/**
 * The red set: one broken file per refusal the `check` command must report, each made from a
 * valid built pack (the example). `bun scripts/system-pack/red-fixtures.ts <built pack> <dir>`
 * writes them, one `<name>.system-pack.json` each, so `check` can be run on every one of them.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { SYSTEM_PACK_LIMITS, systemPackHash, type SystemPackIssueCode } from "@skald/sheet-sdk/modules/systems";
import { LIMIT_SIZERS } from "@skald/sheet-sdk/modules/systems/domain/system-pack/__fixtures__/limit-sizers";
import type { PackContent } from "@skald/sheet-sdk/modules/systems/domain/system-pack/__fixtures__/minimal-pack";

export interface RedFixture {
  name: string;
  code: SystemPackIssueCode;
  /** The file text, from a valid pack's parsed content. */
  text(pack: PackContent): Promise<string>;
}

type Section = Record<string, unknown> & { blocks: Record<string, unknown>[] };

function copy(pack: PackContent): PackContent {
  return structuredClone(pack);
}

async function seal(pack: Record<string, unknown>): Promise<string> {
  const { hash: _old, ...content } = pack;
  return JSON.stringify({ ...content, hash: await systemPackHash(content) });
}

/** A fixture made by changing a copy of the pack and sealing it again. */
function changed(name: string, code: SystemPackIssueCode, change: (pack: PackContent) => void): RedFixture {
  return {
    name,
    code,
    text: async (pack) => {
      const next = copy(pack);
      change(next);
      return seal(next);
    },
  };
}

const firstSection = (pack: PackContent) => pack.rules.sections[0] as Section;

export const RED_FIXTURES: RedFixture[] = [
  changed("unknown-key", "unknown_key", (pack) => (pack.organization = {})),
  {
    name: "proto-key",
    code: "forbidden_key",
    text: async (pack) => (await seal(pack)).replace('"gameData":{', '"gameData":{"__proto__":{"polluted":true},'),
  },
  changed("depth-65", "too_deep", (pack) => {
    let deep: unknown = 0;
    for (let level = 0; level < 63; level += 1) deep = [deep];
    pack.gameData.deep = deep;
  }),
  changed("html-node", "rule_node_unknown", (pack) => firstSection(pack).blocks.push({ type: "html", value: "<script>alert(1)</script>" })),
  changed("javascript-link", "link_scheme_forbidden", (pack) =>
    firstSection(pack).blocks.push({ type: "external", url: "javascript:alert(1)", children: [] }),
  ),
  changed("http-link", "link_scheme_forbidden", (pack) =>
    firstSection(pack).blocks.push({ type: "external", url: "http://example.com/", children: [] }),
  ),
  changed("dangling-section-link", "link_dangling", (pack) =>
    firstSection(pack).blocks.push({ type: "link", target: "nowhere", children: [] }),
  ),
  changed("dangling-entry-link", "link_dangling", (pack) =>
    firstSection(pack).blocks.push({ type: "link", target: "entry:nowhere/none", children: [] }),
  ),
  changed("cyclic-tree", "section_cycle", (pack) => {
    const [top, child] = pack.rules.sections;
    top.parentId = child.id;
  }),
  changed("css-url", "css_url_forbidden", (pack) => {
    pack.system.template.scopedStyles = { css: ".skald-user-a { background: url(https://example.com/a.png); }" };
  }),
  changed("sheet-component", "sheet_component_forbidden", (pack) => (pack.manifest.sheetComponent = "dnd5e")),
  changed("portrait-default", "default_image_forbidden", (pack) => {
    pack.system.defaultData = { ...(pack.system.defaultData as Record<string, unknown>), portrait: "https://example.com/a.png" };
  }),
  {
    name: "hash-mismatch",
    code: "hash_mismatch",
    text: async (pack) => {
      const next = copy(pack);
      next.manifest.name = `${String(next.manifest.name)} (edited)`;
      return JSON.stringify(next);
    },
  },
  ...Object.entries(LIMIT_SIZERS).map(([limit, size]) =>
    changed(`limit-${limit}`, "limit_exceeded", (pack) => size(pack, SYSTEM_PACK_LIMITS[limit as keyof typeof LIMIT_SIZERS] + 1)),
  ),
  {
    name: "limit-maxDepth",
    code: "too_deep",
    text: async (pack) => {
      const next = copy(pack);
      let deep: unknown = 0;
      for (let level = 0; level < SYSTEM_PACK_LIMITS.maxDepth; level += 1) deep = { d: deep };
      next.gameData.deep = deep;
      return seal(next);
    },
  },
  {
    name: "limit-maxPackBytes",
    code: "limit_exceeded",
    text: async (pack) => {
      const text = await seal(pack);
      return text + " ".repeat(SYSTEM_PACK_LIMITS.maxPackBytes + 1 - Buffer.byteLength(text));
    },
  },
];

/** Writes every red fixture made from the built pack at `packFile` into `dir`; returns name → file. */
export async function writeRedFixtures(packFile: string, dir: string): Promise<Map<string, string>> {
  const pack = JSON.parse(readFileSync(packFile, "utf8")) as PackContent;
  mkdirSync(dir, { recursive: true });
  const files = new Map<string, string>();
  for (const fixture of RED_FIXTURES) {
    const file = path.join(dir, `${fixture.name}.system-pack.json`);
    writeFileSync(file, await fixture.text(pack));
    files.set(fixture.name, file);
  }
  return files;
}

if (import.meta.main) {
  const [packFile, dir] = process.argv.slice(2);
  if (!packFile || !dir) {
    console.error("usage: red-fixtures <built pack> <dir>");
    process.exit(2);
  }
  for (const [name, file] of await writeRedFixtures(packFile, dir)) {
    const code = RED_FIXTURES.find((fixture) => fixture.name === name)?.code;
    console.log(`${code}\t${file}`);
  }
}
