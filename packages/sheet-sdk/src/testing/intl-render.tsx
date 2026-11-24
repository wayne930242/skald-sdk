import * as React from "react";
import { render as baseRender, type RenderOptions } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "@skald/sheet-sdk/messages/en.json";

/** The real English messages for a tree under test, in UTC. */
export function EnglishIntlProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      {children}
    </NextIntlClientProvider>
  );
}

/**
 * `render` with the real English messages around the tree, for components that name
 * themselves through next-intl but are not under test for their wording.
 */
export function render(ui: React.ReactElement, options?: Omit<RenderOptions, "wrapper">) {
  return baseRender(ui, {
    ...options,
    wrapper: ({ children }) => <EnglishIntlProvider>{children}</EnglishIntlProvider>,
  });
}
