import type { ReactNode } from "react";
import { renderHook } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import zhTW from "@skald/sheet-sdk/messages/zh-TW.json";
import en from "@skald/sheet-sdk/messages/en.json";
import { SystemPluginProvider } from "@skald/sheet-sdk/modules/systems/ui/system-plugin-provider";
import type { LoadedSystem } from "@skald/types/system";
import { useReferenceContext } from "../use-reference-context";

const system = { config: { id: "dnd5e-2024" }, gameData: {} } as unknown as LoadedSystem;
const ENGLISH_REF = { ref: { spell: { fireball: "Fireball" } } };

function setup(locale: "zh-TW" | "en", english: boolean) {
  const read = vi.fn((_slug: string, _locale: string) => ENGLISH_REF);
  const own = locale === "zh-TW" ? { ...zhTW, ref: { spell: { fireball: "火球術" } } } : { ...en, ...ENGLISH_REF };
  const wrapper = ({ children }: { children: ReactNode }) => (
    <NextIntlClientProvider locale={locale} messages={own} timeZone="UTC">
      <SystemPluginProvider catalog={{ getClientSystemMessages: read }}>{children}</SystemPluginProvider>
    </NextIntlClientProvider>
  );
  const { result } = renderHook(() => useReferenceContext(system, null, { english }), { wrapper });
  return { read, context: result.current };
}

describe("useReferenceContext catalogs", () => {
  it("reads only the zh-TW catalog for a zh-TW sheet", () => {
    const { read, context } = setup("zh-TW", false);
    expect(read).not.toHaveBeenCalled();
    expect(context.nameOf("spell:fireball")).toBe("火球術");
  });

  it("reads the English catalog once a dialog needs English names", () => {
    const { read, context } = setup("zh-TW", true);
    expect(read).toHaveBeenCalledWith("dnd5e-2024", "en");
    expect(context.englishNames.spell?.fireball).toBe("Fireball");
  });

  it("uses its own catalog as the English one for an English sheet", () => {
    const { read, context } = setup("en", true);
    expect(read).not.toHaveBeenCalled();
    expect(context.englishNames.spell?.fireball).toBe("Fireball");
  });
});
