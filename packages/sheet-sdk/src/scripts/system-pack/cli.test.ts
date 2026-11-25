import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildSystemPack } from "./build";
import { runSystemPackCli, type SystemPackCliIo } from "./cli";
import { jsonCollection, markdownBlocks, markdownCollection, rulesSections, SystemPackBuildError } from "./markdown";
import { RED_FIXTURES, writeRedFixtures } from "./red-fixtures";

const example = path.join(import.meta.dirname, "example");

function memoryIo() {
  const out: string[] = [];
  const err: string[] = [];
  const io: SystemPackCliIo = {
    log: (line) => out.push(line),
    error: (line) => err.push(line),
    read: (file) => readFileSync(file, "utf8"),
    write: () => {
      throw new Error("write is checked through the real io");
    },
  };
  return { io, out, err };
}

let dir: string;
let built: string;

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "system-pack-cli-"));
  built = path.join(dir, "example.system-pack.json");
  expect(await runSystemPackCli(["build", example, "--out", built])).toBe(0);
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("system-pack build and check", () => {
  it("builds the example into a file that check accepts", async () => {
    const { io, out, err } = memoryIo();
    expect(await runSystemPackCli(["check", built], io)).toBe(0);
    expect(err).toEqual([]);
    expect(out[0]).toMatch(/^ok: .+ \(lantern-bearers 1\.0\.0\)/);
  });

  it("builds the same hash every time", async () => {
    const first = await buildSystemPack(example);
    const second = await buildSystemPack(example);
    expect(first.hash).toBe(second.hash);
    expect(JSON.parse(readFileSync(built, "utf8")).hash).toBe(first.hash);
  });

  it("refuses bad usage with exit code 2", async () => {
    for (const args of [[], ["check"], ["build", example], ["build", example, "--out"], ["lint", built]]) {
      const { io, err } = memoryIo();
      expect(await runSystemPackCli(args, io)).toBe(2);
      expect(err[0]).toMatch(/^usage:/);
    }
  });

  it("exits 1 with the listed code on every red fixture", async () => {
    const files = await writeRedFixtures(built, path.join(dir, "red"));
    expect(files.size).toBe(RED_FIXTURES.length);
    for (const fixture of RED_FIXTURES) {
      const { io, err } = memoryIo();
      expect(await runSystemPackCli(["check", files.get(fixture.name)!], io), fixture.name).toBe(1);
      expect(err.slice(1).some((line) => line.trim().startsWith(`${fixture.code} `)), `${fixture.name}: ${err.join("\n")}`).toBe(true);
    }
  }, 120_000);
});

describe("system-pack Markdown", () => {
  it("builds the section tree from # and ## with ids", () => {
    const sections = rulesSections("# Combat {#combat}\n\nText.\n\n## Order\n\n### Step\n\nMore.\n", "x.md");
    expect(sections.map(({ id, parentId, title }) => ({ id, parentId, title }))).toEqual([
      { id: "combat", parentId: null, title: "Combat" },
      { id: "order", parentId: "combat", title: "Order" },
    ]);
    expect(sections[1].blocks[0]).toEqual({ type: "heading", depth: 3, children: [{ type: "text", value: "Step" }] });
  });

  it("converts links to sections, entries and https URLs, and code to text", () => {
    expect(markdownBlocks("[a](#combat) [b](entry:moves/brace) [c](https://Example.com) `x`", "x.md")).toEqual([
      {
        type: "paragraph",
        children: [
          { type: "link", target: "combat", children: [{ type: "text", value: "a" }] },
          { type: "text", value: " " },
          { type: "link", target: "entry:moves/brace", children: [{ type: "text", value: "b" }] },
          { type: "text", value: " " },
          { type: "external", url: "https://example.com/", children: [{ type: "text", value: "c" }] },
          { type: "text", value: " " },
          { type: "text", value: "x" },
        ],
      },
    ]);
  });

  it("refuses HTML, images, unsafe links, deep headings and stray text", () => {
    for (const [text, message] of [
      ["<b>x</b>", "HTML is not allowed"],
      ["![a](https://example.com/a.png)", "images are not allowed"],
      ["[a](http://example.com/)", "neither #section"],
      ["[a](javascript:alert(1))", "neither #section"],
      ["##### deep", "heading level 5"],
    ] as const) {
      expect(() => markdownBlocks(text, "x.md")).toThrow(message);
    }
    expect(() => rulesSections("Text first.\n\n# A {#a}\n", "x.md")).toThrow(SystemPackBuildError);
    expect(() => rulesSections("## Child first\n", "x.md")).toThrow("needs a # section above it");
    expect(() => rulesSections("# 戰鬥\n", "x.md")).toThrow("needs an id");
  });

  it("reads entry metadata from Markdown and JSON collections", () => {
    const fromMarkdown = markdownCollection("moves", "# Moves\n\n## Brace {#brace}\n\nTags: a, b\nSummary: Hold.\n\nRoll.\n", "m.md");
    expect(fromMarkdown).toEqual({
      id: "moves",
      title: "Moves",
      entries: [
        {
          id: "brace",
          name: "Brace",
          tags: ["a", "b"],
          summary: "Hold.",
          blocks: [{ type: "paragraph", children: [{ type: "text", value: "Roll." }] }],
        },
      ],
    });
    const fromJson = jsonCollection("hazards", { title: "Hazards", entries: [{ id: "pit", name: "Pit", text: "Deep." }] }, "h.json");
    expect(fromJson.entries[0]).toEqual({ id: "pit", name: "Pit", blocks: [{ type: "paragraph", children: [{ type: "text", value: "Deep." }] }] });
    expect(() => jsonCollection("h", { title: "H", entries: [{ id: "a", name: "A", html: "<b>" }] }, "h.json")).toThrow('unknown key "html"');
  });
});
