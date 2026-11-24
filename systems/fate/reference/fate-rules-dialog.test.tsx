import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import messages from "@skald/sheet-sdk/messages/en.json";
import { FateRulesDialog } from "./fate-rules-dialog";
import * as loader from "./load-rules";

it("retries a failed chunk, opens a sheet target, switches in place, searches prose and explains English-only fallback", async () => {
  const load = vi.spyOn(loader, "loadRules").mockRejectedValueOnce(Error("chunk failed"));
  try {
    render(
      <NextIntlClientProvider locale="en" timeZone="UTC" messages={messages}>
        <FateRulesDialog initialSection="aspects.invoke" onClose={() => {}} />
      </NextIntlClientProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: "Invokes" })).toBeVisible();
    // The current contents row reads on the accent fill: its text takes the accent foreground.
    const current = screen.getByRole("navigation").querySelector("[aria-current]");
    expect(current).toHaveTextContent("Invokes");
    expect(current?.className).toContain("aria-[current]:text-accent-foreground");
    expect(load.mock.calls.map((c) => c[0])).toEqual(["en", "en"]);
    fireEvent.click(screen.getByRole("button", { name: "中文" }));
    expect(await screen.findByRole("heading", { name: "援引" })).toBeVisible();
    expect(screen.getByText(/要解鎖形象的真正力量/)).toBeVisible();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "要解鎖形象的真正力量" } });
    expect(screen.getByRole("navigation").querySelectorAll("button")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "English" }));
    fireEvent.click(await screen.findByRole("button", { name: "Credits" }));
    fireEvent.click(screen.getByRole("button", { name: "中文" }));
    expect(await screen.findByRole("heading", { name: "入門導引" })).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("本節僅有英文版");
  } finally {
    load.mockRestore();
  }
});
