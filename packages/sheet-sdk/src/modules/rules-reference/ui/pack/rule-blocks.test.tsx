import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RuleBlocks } from "./rule-blocks";

const children = [{ type: "text" as const, value: "<img src=x>" }];
describe("RuleBlocks", () => {
  it("renders text literally and gives only normalized HTTPS links a destination", () => {
    const html = renderToStaticMarkup(<RuleBlocks navigate={() => {}} blocks={[
      { type: "external", url: "https://example.org/", children },
      { type: "external", url: "javascript:alert(1)", children },
    ]} />);
    expect(html).toContain('href="https://example.org/"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("<img");
    expect(html.match(/&lt;img/g)).toHaveLength(2);
  });
});
