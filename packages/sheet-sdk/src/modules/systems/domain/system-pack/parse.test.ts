import { describe, expect, it, vi } from "vitest";
import { entrySchema, sectionSchema } from "./envelope";
import { LIMIT_SIZERS, type Sizer } from "./__fixtures__/limit-sizers";
import { FIXTURE_GAME_ICONS, minimalPackContent, sealed, type PackContent } from "./__fixtures__/minimal-pack";
import type { SystemPackIssueCode } from "./format";
import { canonicalJson, systemPackHash } from "./hash";
import { SYSTEM_PACK_LIMITS, type SystemPackLimit } from "./limits";
import { entryBytes, jsonBytes, MAX_SYSTEM_PACK_ISSUES, parseSystemPack } from "./parse";
import { checkRuleBlocks } from "./rule-nodes";

async function issuesOf(content: PackContent | Record<string, unknown>, sealIt = true) {
  const file = sealIt ? await sealed(content) : content;
  return (await parseSystemPack(JSON.stringify(file), { gameIconNames: FIXTURE_GAME_ICONS })).issues;
}

async function expectRefused(content: PackContent, code: SystemPackIssueCode, limit?: SystemPackLimit) {
  const issues = await issuesOf(content);
  expect(issues.map((issue) => issue.code)).toContain(code);
  if (limit) expect(issues.find((issue) => issue.code === code && issue.limit === limit)).toBeDefined();
  return issues;
}

type Section = Record<string, unknown> & { blocks: Record<string, unknown>[] };
const sections = (content: PackContent) => content.rules.sections as Section[];
const firstEntry = (content: PackContent) => content.entries.collections[0].entries[0];

describe("parseSystemPack accepts", () => {
  it("a sealed minimal pack, from text or from a parsed value", async () => {
    const file = await sealed(minimalPackContent());
    const fromText = await parseSystemPack(JSON.stringify(file, null, 2), { gameIconNames: FIXTURE_GAME_ICONS });
    expect(fromText.issues).toEqual([]);
    expect(fromText.pack?.manifest.packId).toBe("test-game");
    const fromValue = await parseSystemPack(file);
    expect(fromValue.issues).toEqual([]);
  });

  it("sheetComponent generic", async () => {
    const content = minimalPackContent();
    content.manifest.sheetComponent = "generic";
    expect(await issuesOf(content)).toEqual([]);
  });

  it("JSON nesting of exactly 64", async () => {
    const content = minimalPackContent();
    // root 1, gameData 2, deep 3: 61 more arrays reach depth 64.
    let deep: unknown = 0;
    for (let level = 0; level < 62; level += 1) deep = [deep];
    content.gameData.deep = deep;
    expect(await issuesOf(content)).toEqual([]);
  });

  it("a hash independent of key order and layout", async () => {
    const content = minimalPackContent();
    const reordered = Object.fromEntries(Object.entries(content).reverse());
    expect(await systemPackHash(reordered)).toBe(await systemPackHash(content));
    expect(canonicalJson({ b: 1, a: [{ d: 1, c: 2 }] })).toBe('{"a":[{"c":2,"d":1}],"b":1}\n');
  });
});

describe("parseSystemPack refuses", () => {
  it("text that is not JSON, and a JSON value that is not an object", async () => {
    expect((await parseSystemPack("{nope")).issues[0].code).toBe("not_json");
    expect((await parseSystemPack("[]")).issues[0].code).toBe("not_json");
  });

  it("another schema id", async () => {
    const content = minimalPackContent();
    content.schema = "skald/pack/v1";
    await expectRefused(content, "unknown_schema");
  });

  it("an unknown key at the top, in the manifest, in the system and on a rule node", async () => {
    for (const mutate of [
      (content: PackContent) => (content.extra = 1),
      (content: PackContent) => (content.manifest.homepage = "https://example.com/"),
      (content: PackContent) => (content.system.organization = {}),
      (content: PackContent) => (sections(content)[0].blocks[0].html = "<b>x</b>"),
    ]) {
      const content = minimalPackContent();
      mutate(content);
      await expectRefused(content, "unknown_key");
    }
  });

  it("a __proto__ key anywhere", async () => {
    const file = await sealed(minimalPackContent());
    const text = JSON.stringify(file).replace('"origins":', '"__proto__":{"polluted":true},"origins":');
    const { issues } = await parseSystemPack(text);
    expect(issues.map((issue) => issue.code)).toEqual(["forbidden_key"]);
    expect(issues[0].path).toEqual(["gameData", "__proto__"]);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("JSON nesting of 65, from text and from a parsed value", async () => {
    const content = minimalPackContent();
    let deep: unknown = 0;
    for (let level = 0; level < 63; level += 1) deep = [deep];
    content.gameData.deep = deep;
    await expectRefused(content, "too_deep", "maxDepth");
    expect((await parseSystemPack(await sealed(content))).issues.map((issue) => issue.code)).toEqual(["too_deep"]);
  });

  it("an HTML-ish or image rule node", async () => {
    for (const node of [
      { type: "html", value: "<script>alert(1)</script>" },
      { type: "image", url: "https://example.com/a.png", alt: "" },
      { type: "code", value: "x" },
    ]) {
      const content = minimalPackContent();
      sections(content)[0].blocks.push(node);
      await expectRefused(content, "rule_node_unknown");
    }
  });

  it("a javascript: or http: external link, and a URL that is not normalised", async () => {
    for (const [url, code] of [
      ["javascript:alert(1)", "link_scheme_forbidden"],
      ["http://example.com/", "link_scheme_forbidden"],
      ["data:text/html,hi", "link_scheme_forbidden"],
      ["https://user:pw@example.com/", "link_url_invalid"],
      ["https://EXAMPLE.com", "link_url_invalid"],
      ["/relative", "link_url_invalid"],
    ] as const) {
      const content = minimalPackContent();
      sections(content)[0].blocks.push({ type: "external", url, children: [] });
      await expectRefused(content, code);
    }
  });

  it("a dangling section or entry link, or a link with a scheme", async () => {
    for (const target of ["nowhere", "entry:moves/missing", "entry:nowhere/strike", "javascript:alert(1)"]) {
      const content = minimalPackContent();
      sections(content)[0].blocks.push({ type: "link", target, children: [] });
      const issues = await expectRefused(content, "link_dangling");
      expect(issues).toHaveLength(1);
    }
  });

  it("a cyclic section tree, a missing parent and duplicate ids", async () => {
    const cyclic = minimalPackContent();
    sections(cyclic)[0].parentId = "combat";
    const issues = await expectRefused(cyclic, "section_cycle");
    expect(issues.filter((issue) => issue.code === "section_cycle")).toHaveLength(2);

    const self = minimalPackContent();
    sections(self)[0].parentId = "basics";
    await expectRefused(self, "section_cycle");

    const orphan = minimalPackContent();
    sections(orphan)[1].parentId = "missing";
    await expectRefused(orphan, "section_parent_missing");

    const twice = minimalPackContent();
    sections(twice)[1].id = "basics";
    await expectRefused(twice, "duplicate_id");

    const entryTwice = minimalPackContent();
    entryTwice.entries.collections[0].entries.push({ ...firstEntry(entryTwice) });
    await expectRefused(entryTwice, "duplicate_id");
  });

  it("url(), @import and escapes in template CSS or its variables", async () => {
    for (const [css, code] of [
      [".skald-user-a { background: url(https://example.com/a.png); }", "css_url_forbidden"],
      [".skald-user-a { background: URL ( x ); }", "css_url_forbidden"],
      [".skald-user-a { background: image-set('a.png' 1x); }", "css_url_forbidden"],
      ["@import 'https://example.com/a.css';", "css_import_forbidden"],
      [".skald-user-a { background: \\75 rl(x); }", "css_escape_forbidden"],
    ] as const) {
      const content = minimalPackContent();
      content.system.template.scopedStyles = { css };
      await expectRefused(content, code);
    }
    const variable = minimalPackContent();
    variable.system.template.scopedStyles = { variables: { "--skald-bg": "url(x)" } };
    await expectRefused(variable, "css_url_forbidden");
  });

  it("a sheetComponent other than generic", async () => {
    for (const component of ["dnd5e", "coc7e", "fate", "custom"]) {
      const content = minimalPackContent();
      content.manifest.sheetComponent = component;
      await expectRefused(content, "sheet_component_forbidden");
    }
  });

  it("a sheet part that does not match its JSON Schema", async () => {
    const content = minimalPackContent();
    delete content.system.template.pages;
    const issues = await expectRefused(content, "sheet_part_invalid");
    expect(issues[0].path.slice(0, 2)).toEqual(["system", "template"]);

    const rules = minimalPackContent();
    (rules.system.dsl as Record<string, unknown>).rollRules = { default: "x" };
    await expectRefused(rules, "sheet_part_invalid");

    const wizard = minimalPackContent();
    wizard.system.wizard = { $schema: "skald/wizard/v1" };
    await expectRefused(wizard, "sheet_part_invalid");
  });

  it("a field migration of another format", async () => {
    const content = minimalPackContent();
    content.system.fieldMigration = { $schema: "skald/field-migration/v9" };
    await expectRefused(content, "invalid_value");
  });

  it("a game icon that does not exist, when the names are given", async () => {
    const content = minimalPackContent();
    const schema = content.system.schema as { fields: Record<string, Record<string, unknown>> };
    schema.fields.might.icon = "game:no-such-icon";
    await expectRefused(content, "game_icon_unknown");
    expect((await parseSystemPack(await sealed(content))).issues).toEqual([]);
  });

  it("text the database cannot store: U+0000 or an unpaired surrogate, in a value or a key", async () => {
    for (const mutate of [
      (content: PackContent) => (content.manifest.description = "a\u0000b"),
      (content: PackContent) => (content.gameData.origins = [{ id: "x", label: "\ud800" }]),
      (content: PackContent) => (content.gameData.origins = [{ ["\udc00k"]: 1 }]),
    ]) {
      const content = minimalPackContent();
      mutate(content);
      await expectRefused(content, "text_invalid");
    }
    const paired = minimalPackContent();
    paired.manifest.description = "A test system 🎲.";
    expect(await issuesOf(paired)).toEqual([]);
  });

  it("an image field whose default value is set, at the top or in a list row", async () => {
    const content = minimalPackContent();
    const schema = content.system.schema as { fields: Record<string, unknown> };
    schema.fields.portrait = { id: "portrait", label: "Portrait", type: "image" };
    schema.fields.gear = {
      id: "gear",
      label: "Gear",
      type: "list",
      rowTemplate: { children: [{ id: "picture", label: "Picture", type: "image" }], layout: { type: "stack" } },
    };
    content.system.defaultData = { name: "", might: 1, portrait: "", gear: [{ picture: null }] };
    expect(await issuesOf(content)).toEqual([]);

    content.system.defaultData = { name: "", might: 1, portrait: "https://example.com/a.png", gear: [{ picture: "data:image/png;base64,AA" }] };
    const issues = await expectRefused(content, "default_image_forbidden");
    expect(issues.filter((issue) => issue.code === "default_image_forbidden").map((issue) => issue.path)).toEqual([
      ["system", "defaultData", "portrait"],
      ["system", "defaultData", "gear", 0, "picture"],
    ]);
  });

  it("a portrait default value whatever its field's type, since the site shows data.portrait as a picture", async () => {
    const content = minimalPackContent();
    const schema = content.system.schema as { fields: Record<string, unknown> };
    schema.fields.portrait = { id: "portrait", label: "Portrait", type: "text" };
    content.system.defaultData = { name: "", might: 1, portrait: "" };
    expect(await issuesOf(content)).toEqual([]);

    for (const portrait of ["https://example.com/a.png", { url: "https://example.com/a.png" }]) {
      content.system.defaultData = { name: "", might: 1, portrait };
      const issues = await expectRefused(content, "default_image_forbidden");
      expect(issues.filter((issue) => issue.code === "default_image_forbidden").map((issue) => issue.path)).toEqual([
        ["system", "defaultData", "portrait"],
      ]);
    }

    delete schema.fields.portrait;
    content.system.defaultData = { name: "", might: 1, portrait: "data:image/png;base64,AA" };
    await expectRefused(content, "default_image_forbidden");
    // Only the top level is read as the card's picture.
    content.system.defaultData = { name: "", might: 1, notes: { portrait: "https://example.com/a.png" } };
    expect(await issuesOf(content)).toEqual([]);
  });

  it("a hash that does not match the content", async () => {
    const file = (await sealed(minimalPackContent())) as PackContent;
    file.manifest.name = "Changed";
    const issues = await issuesOf(file, false);
    expect(issues.map((issue) => issue.code)).toEqual(["hash_mismatch"]);
  });

  it("a missing or malformed hash", async () => {
    const content = minimalPackContent();
    expect((await issuesOf(content, false)).map((issue) => issue.code)).toEqual(["invalid_value"]);
  });
});

describe("the byte measure", () => {
  // Each expected value is octet_length(<value>::jsonb::text) on Postgres 17.
  it("counts what Postgres counts for jsonb text", () => {
    expect(jsonBytes({ a: [1, 2, { b: 1e21, c: 1.5e-7, d: -0, e: 'x\ny\u0001\u001f"\\/' }], "": {}, f: [] })).toBe(
      '{"": {}, "a": [1, 2, {"b": 1000000000000000000000, "c": 0.00000015, "d": 0, "e": "x\\ny\\u0001\\u001f\\"\\\\/"}], "f": []}'.length,
    );
    expect(jsonBytes([1.7976931348623157e308])).toBe(311);
    expect(jsonBytes([5e-324])).toBe(328);
    expect(jsonBytes([1.2345678901234568e22, -1e-7])).toBe("[12345678901234568000000, -0.0000001]".length);
    expect(jsonBytes({ name: "一" })).toBe('{"name": "一"}'.length + 2);
  });

  it("counts an entry as the stored row does: name, summary, tags and blocks, not its id", () => {
    const blocks = [{ type: "text", value: "x" }];
    expect(entryBytes({ name: "Strike", blocks })).toBe(6 + 0 + 2 + jsonBytes(blocks));
    expect(entryBytes({ name: "Strike", summary: "Hit", tags: ["a"], blocks })).toBe(6 + 3 + 5 + jsonBytes(blocks));
  });
});

describe("parseSystemPack limits", () => {
  it("has a test for every limit", () => {
    expect(Object.keys(LIMIT_SIZERS).sort()).toEqual(
      Object.keys(SYSTEM_PACK_LIMITS)
        .filter((limit) => limit !== "maxPackBytes" && limit !== "maxDepth")
        .sort(),
    );
  });

  for (const [limit, size] of Object.entries(LIMIT_SIZERS) as [keyof typeof LIMIT_SIZERS, Sizer][]) {
    it(`accepts ${limit} and refuses ${limit} + 1`, async () => {
      const max = SYSTEM_PACK_LIMITS[limit];
      const atLimit = minimalPackContent();
      size(atLimit, max);
      const atIssues = await issuesOf(atLimit);
      expect(atIssues.filter((issue) => issue.limit === limit)).toEqual([]);

      const over = minimalPackContent();
      size(over, max + 1);
      const issue = (await issuesOf(over)).find((found) => found.limit === limit);
      expect(issue).toMatchObject({ code: "limit_exceeded", limit, max, actual: max + 1 });
    }, 30_000);
  }

  it("refuses a file over maxPackBytes before parsing it", async () => {
    const text = JSON.stringify(await sealed(minimalPackContent()));
    const max = SYSTEM_PACK_LIMITS.maxPackBytes;
    const atLimit = await parseSystemPack(text + " ".repeat(max - text.length));
    expect(atLimit.issues).toEqual([]);
    const over = await parseSystemPack(text + " ".repeat(max + 1 - text.length));
    expect(over.issues).toEqual([
      expect.objectContaining({ code: "limit_exceeded", limit: "maxPackBytes", max, actual: max + 1 }),
    ]);
  }, 30_000);
});

describe("parseSystemPack stays linear and bounded on hostile input", () => {
  const elapsed = async (run: () => Promise<unknown>) => {
    const start = performance.now();
    await run();
    return performance.now() - start;
  };

  it("strips CSS comments in one pass: 2 MB of unterminated comments", async () => {
    const content = minimalPackContent();
    content.system.template.scopedStyles = { css: "/*a".repeat(690_000) };
    let issues: unknown[] = [];
    const ms = await elapsed(async () => {
      issues = await issuesOf(content);
    });
    expect(issues).toEqual([]);
    expect(ms).toBeLessThan(3_000);
  }, 30_000);

  it("refuses a section chain over maxSections before walking it, and walks a chain at the limit in O(n)", async () => {
    const chain = (length: number) => {
      const content = minimalPackContent();
      content.rules.sections = Array.from({ length }, (_, index) => ({
        id: `s${index}`,
        parentId: index === 0 ? null : `s${index - 1}`,
        title: "S",
        blocks: [],
      }));
      return content;
    };
    let over: { code: string; limit?: string }[] = [];
    const overMs = await elapsed(async () => {
      over = await issuesOf(chain(40_000));
    });
    expect(over).toEqual([expect.objectContaining({ code: "limit_exceeded", limit: "maxSections" })]);
    expect(overMs).toBeLessThan(2_000);
    const atMs = await elapsed(async () => {
      expect(await issuesOf(chain(SYSTEM_PACK_LIMITS.maxSections))).toEqual([]);
    });
    expect(atMs).toBeLessThan(2_000);
  }, 30_000);

  it("stops the rule node walk once the issue list is full", async () => {
    const content = minimalPackContent();
    const junk = Array.from({ length: 25_000 }, () => ({ type: "x" }));
    content.rules.sections = Array.from({ length: 20 }, (_, index) => ({
      id: `s${index}`,
      parentId: null,
      title: "S",
      blocks: [{ type: "blockquote", children: junk }],
    }));
    let issues: { code: string }[] = [];
    const ms = await elapsed(async () => {
      issues = await issuesOf(content);
    });
    expect(issues).toHaveLength(MAX_SYSTEM_PACK_ISSUES);
    expect(new Set(issues.map((issue) => issue.code))).toEqual(new Set(["rule_node_unknown"]));
    expect(ms).toBeLessThan(5_000);

    let pushes = 0;
    const context = {
      push: () => (pushes += 1),
      get full() {
        return pushes >= 5;
      },
      resolves: () => true,
    };
    checkRuleBlocks(junk, ["blocks"], context);
    expect(pushes).toBe(5);
  }, 30_000);

  it("refuses node types named like Object.prototype members", async () => {
    for (const type of ["constructor", "toString", "hasOwnProperty", "__defineGetter__"]) {
      const content = minimalPackContent();
      sections(content)[0].blocks.push({ type, children: [] });
      await expectRefused(content, "rule_node_unknown");
    }
  });

  it("measures an already parsed value against maxPackBytes", async () => {
    const content = minimalPackContent();
    const big = "a".repeat(4_000_000);
    for (let index = 0; index < 14; index += 1) content.gameData[`big${index}`] = big;
    const { issues } = await parseSystemPack(await sealed(content));
    expect(issues).toEqual([expect.objectContaining({ code: "limit_exceeded", limit: "maxPackBytes" })]);
  }, 30_000);

  it("parses sections and entries one at a time and stops at the issue cap", async () => {
    const content = minimalPackContent();
    content.rules.sections = Array.from({ length: SYSTEM_PACK_LIMITS.maxSections }, () => ({ id: "X", parentId: 0, title: 0, blocks: 0, junk: 1 }));
    const sectionCalls = vi.spyOn(sectionSchema, "safeParse");
    const sectionIssues = await issuesOf(content);
    expect(sectionIssues).toHaveLength(MAX_SYSTEM_PACK_ISSUES);
    expect(sectionCalls.mock.calls.length).toBeLessThan(MAX_SYSTEM_PACK_ISSUES);
    sectionCalls.mockRestore();

    const entries = minimalPackContent();
    entries.entries.collections = Array.from({ length: 100 }, (_, index) => ({
      id: `c${index}`,
      title: "C",
      entries: Array.from({ length: 200 }, () => ({ id: "X", name: 0, summary: 0, tags: Array(20).fill(0), blocks: 0, junk: 1 })),
    }));
    const entryCalls = vi.spyOn(entrySchema, "safeParse");
    expect(await issuesOf(entries)).toHaveLength(MAX_SYSTEM_PACK_ISSUES);
    expect(entryCalls.mock.calls.length).toBeLessThan(MAX_SYSTEM_PACK_ISSUES);
    entryCalls.mockRestore();
  });
});
