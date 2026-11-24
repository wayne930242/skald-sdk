import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const PLAY = join(__dirname, "..");
const LAZY = ["combat-tab", "spells-tab", "features-tab", "items-tab"];

/**
 * The play view opens on 角色; the other tabs load when they first open, so the D&D sheet's extra
 * over CoC stays under 60 KB (first-load.md § T4f). Only the lazy tabs may import each other.
 */
describe("lazy play tabs", () => {
  it("imports the tabs past 角色 only through lazy-tabs.tsx", () => {
    const offenders: string[] = [];
    for (const file of readdirSync(PLAY)) {
      if (!/\.tsx?$/.test(file) || file === "lazy-tabs.tsx" || LAZY.some((tab) => file.startsWith(tab))) continue;
      const text = readFileSync(join(PLAY, file), "utf8");
      for (const tab of LAZY) {
        if (new RegExp(`^\\s*(?:import|export)\\b[^;]*from\\s+"\\./${tab}"`, "m").test(text)) offenders.push(`${file} → ${tab}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
