// @vitest-environment node
// (build-rules resolves its paths from its own import.meta.url, which the jsdom environment serves over http:)
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  buildCorpus,
  convert,
  pinned,
  encode,
  englishSource,
  rulesArtifact,
} from "../scripts/fate-condensed/build-rules";
import { sheetRuleTargets } from "./rule-ids";
import { loadRules } from "./load-rules";

// Paths come from build-rules, which keeps its depth in the public tree (systems/fate/scripts/).
const en = readFileSync(englishSource, "utf8");
describe("pinned Fate rules", () => {
  it("regenerates the English artifact offline, byte for byte", () => {
    expect(encode(buildCorpus("en", en))).toBe(
      readFileSync(rulesArtifact("en"), "utf8"),
    );
  });
  it("rejects tampering, missing sections, dangling references and unfamiliar markup", () => {
    expect(() => pinned("en", en + " ")).toThrow(/hash/i);
    expect(() => buildCorpus("en", en.replace("## Licensing", ""), false)).toThrow(
      /Missing heading: edition.license/,
    );
    expect(() => convert("[bad](#absent)", new Map())).toThrow(/link/i);
    expect(() => convert("<Bad />", new Map())).toThrow(/markup/i);
    expect(() => convert("[unsafe](javascript:alert)", new Map())).toThrow(/unsafe/i);
  });
  it.each(["en", "zh-TW"] as const)(
    "loads complete sheet targets and tables for %s",
    async (locale) => {
      const corpus = await loadRules(locale);
      const ids = corpus.sections.map((s) => s.id);
      for (const id of Object.values(sheetRuleTargets)) expect(ids).toContain(id);
      const json = JSON.stringify(corpus.sections);
      expect(json.match(/"type":"table"/g)).toHaveLength(locale === "en" ? 6 : 2);
      expect(json.match(/"type":"dice"/g)).toHaveLength(locale === "en" ? 33 : 58);
      expect(corpus.unresolved).toEqual(locale === "en" ? [{ line: 922, text: "page 72" }] : []);
      expect(corpus.source.sha256).toBe(
        locale === "en"
          ? "f8700ffad782561c2313cdbee140fff21614a1f9b396f6d3011a4fa76ad4614f"
          : "c98607fba1dcba5d369892d29d709cb2cdc80cb150b9aa0df0e792ac5d180a73",
      );
      for (const target of json.matchAll(/"target":"([^"]+)"/g)) expect(ids).toContain(target[1]);
      expect(Object.keys(corpus.anchors)).toHaveLength(locale === "en" ? 29 : 0);
      expect(corpus.notices).toContain(
        "This work is based on Fate Condensed (found at http://www.faterpg.com/), a product of Evil Hat Productions, LLC, developed, authored, and edited by PK Sullivan, Ed Turner, Leonard Balsera, Fred Hicks, Richard Bellingham, Robert Hanz, Ryan Macklin, and Sophie Lagacé, and licensed for our use under the Creative Commons Attribution 3.0 Unported license (http://creativecommons.org/licenses/by/3.0/).",
      );
      expect(corpus.sections.find((s) => s.id === "aspects.invoke")?.title).toBe(
        locale === "en" ? "Invokes" : "援引",
      );
      expect(corpus.notices.join(" ")).toContain(
        "Traditional Chinese translation © Wei Hung, licensed CC-BY-3.0.",
      );
    },
  );
});
