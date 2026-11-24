// B-021: the shared roll options dialog grew a frame that D&D fills with its own body. CoC and
// KC show the same dialog as before: these snapshots were taken before the frame was split out.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "@skald/sheet-sdk/messages/en.json";
import zh from "@skald/sheet-sdk/messages/zh-TW.json";
import { RollOptionsDialog } from "@skald/sheet-sdk/modules/rolls/ui/dice/roll-options-dialog";

afterEach(cleanup);

const CASES = [
  { name: "bonus dice and difficulty with a target", props: { targetValue: 55, showBonusDice: true, showDifficulty: true } },
  { name: "bonus dice only", props: { showBonusDice: true, showDifficulty: false } },
  { name: "difficulty only, no target", props: { showBonusDice: false, showDifficulty: true } },
] as const;

describe("CoC roll options dialog DOM (pinned)", () => {
  for (const locale of ["en", "zh-TW"] as const) {
    for (const { name, props } of CASES) {
      it(`${locale}: ${name}`, () => {
        render(
          <NextIntlClientProvider locale={locale} messages={locale === "en" ? en : zh} timeZone="UTC">
            <RollOptionsDialog open onOpenChange={vi.fn()} name="Spot Hidden" range={{ min: -2, max: 2 }} onRoll={vi.fn()} {...props} />
          </NextIntlClientProvider>,
        );
        const dialog = document.body.querySelector("[data-roll-options-dialog]");
        expect(dialog?.outerHTML.replace(/radix-[^"]+/g, "radix-id")).toMatchSnapshot();
      });
    }
  }
});
