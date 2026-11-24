import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SnapshotText } from "../snapshot-text";

describe("SnapshotText (P7)", () => {
  it("keeps paragraphs, bullets and bold item names from saved pack text", () => {
    const text = "You gain advantage. On a hit, more.\nSecond paragraph.\n• Heavenly Wings. You sprout wings.\n• Inner Radiance. You shed light.\nAfter the list.";
    const { container } = render(<SnapshotText text={text} />);
    const root = container.querySelector("[data-snapshot-text]")!;
    expect([...root.children].map((node) => node.tagName)).toEqual(["P", "P", "UL", "P"]);
    const items = root.querySelectorAll("li");
    expect(items).toHaveLength(2);
    expect(items[0].querySelector("strong")?.textContent).toBe("Heavenly Wings.");
    expect(items[0].textContent).toBe("Heavenly Wings. You sprout wings.");
    expect(root.querySelector("p strong")).toBeNull();
  });

  it("bolds a title that ends in its own mark, and drops the period older snapshots put after a fullwidth one (B-001)", () => {
    const text = "• 屬性值：. 力量、智力\n• 專長： 警覺\n• Feat: Alert";
    const { container } = render(<SnapshotText text={text} />);
    const items = [...container.querySelectorAll("li")];
    expect(items.map((node) => node.querySelector("strong")?.textContent)).toEqual(["屬性值：", "專長：", "Feat:"]);
    expect(items.map((node) => node.textContent)).toEqual(["屬性值：力量、智力", "專長：警覺", "Feat: Alert"]);
  });

  it("bolds a zh head written with a fullwidth colon and no space, and reads older snapshots with today's heads (B-001, PT2R-F005)", () => {
    const text = "• 戲法：自選三道法師戲法。之後 再說\n• 戲法. 自選三道\n• 你可施放此法術。之後的回合\n• Cantrips. Choose three.";
    const { container } = render(<SnapshotText text={text} />);
    const items = [...container.querySelectorAll("li")];
    expect(items.map((node) => node.querySelector("strong")?.textContent ?? null)).toEqual(["戲法：", "戲法：", null, "Cantrips."]);
    expect(items.map((node) => node.textContent)).toEqual([
      "戲法：自選三道法師戲法。之後 再說",
      "戲法：自選三道",
      "你可施放此法術。之後的回合",
      "Cantrips. Choose three.",
    ]);
  });

  it("an older snapshot's paragraph head reads with 「：」 too (PT2R-F005)", () => {
    const { container } = render(<SnapshotText text={"戲法. 自選三道法師戲法。\nCantrips. Choose three."} />);
    expect([...container.querySelectorAll("p")].map((node) => node.textContent)).toEqual(["戲法：自選三道法師戲法。", "Cantrips. Choose three."]);
  });

  it("renders markup in the text as text", () => {
    const { container } = render(<SnapshotText text={"<b>x</b>"} />);
    expect(container.querySelector("b")).toBeNull();
    expect(container.textContent).toBe("<b>x</b>");
  });
});
