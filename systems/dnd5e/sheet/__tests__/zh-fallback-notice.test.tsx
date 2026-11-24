import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import { anyZhWithheld } from "../../__tests__/zh-withheld";
import en from "@skald/sheet-sdk/messages/en.json";
import zhTW from "@skald/sheet-sdk/messages/zh-TW.json";
import availability from "@skald/system-dnd5e/data/dnd5e-2024/zh-availability.json";
import { ZhFallbackNotice } from "../zh-fallback-notice";

/**
 * Open-source plan T6 / §2 step 3b: the public export replaces each withheld zh-TW data file with
 * its English text and lists it in `zh-availability.json`; one notice tells a zh-TW reader so.
 * Skald withholds nothing, so its sheet never shows it.
 */

const withheld = { version: 1, locale: "zh-TW", fallback: "en", withheld: ["corpus/zh-TW/spells.json"] };

function renderIn(locale: "en" | "zh-TW", props: Parameters<typeof ZhFallbackNotice>[0] = {}) {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === "en" ? en : zhTW} timeZone="UTC">
      <ZhFallbackNotice {...props} />
    </NextIntlClientProvider>,
  );
}

describe("ZhFallbackNotice", () => {
  // The public repo withholds zh-TW files until they are retranslated, and shows the notice.
  it.skipIf(anyZhWithheld)("lists nothing in Skald's own data, so the private sheet shows no notice", () => {
    expect(availability).toEqual({ version: 1, locale: "zh-TW", fallback: "en", withheld: [] });
    const { container } = renderIn("zh-TW");
    expect(container).toBeEmptyDOMElement();
  });

  it("tells a zh-TW reader that the withheld text shows in English", () => {
    renderIn("zh-TW", { availability: withheld });
    expect(screen.getByRole("note")).toHaveTextContent(zhTW.sheetUi.zhFallbackNotice);
  });

  it("stays out of every other locale", () => {
    const { container } = renderIn("en", { availability: withheld });
    expect(container).toBeEmptyDOMElement();
  });
});
