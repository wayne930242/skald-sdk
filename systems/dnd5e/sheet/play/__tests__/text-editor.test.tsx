import type { ReactNode } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { zhWithheld } from "../../../__tests__/zh-withheld";
import appZh from "@skald/sheet-sdk/messages/zh-TW.json";
import systemZh from "@skald/system-dnd5e/data/dnd5e-2024/messages/zh-TW.json";
import { loadEditMessages } from "../edit-messages";
import { RowTextDialog, type RowTextDialogProps } from "../text-editor";

/** plan-uat2 §3.4: 「編輯文字」 writes the player's own text, and only a change. */

beforeAll(() => loadEditMessages("zh-TW"));

const srdRow = { id: "f1", name: "回氣", ref: "classFeature:fighter/second-wind-l1", origin: "srd", text: "", playerText: "" };
const RULES = "你可以用附贈動作恢復生命值。";

function wrapper({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="zh-TW" messages={{ ...appZh, ...systemZh }} timeZone="UTC">
      {children}
    </NextIntlClientProvider>
  );
}

async function open(props: Partial<RowTextDialogProps>) {
  const onSave = vi.fn();
  const onClose = vi.fn();
  const all: RowTextDialogProps = { name: "回氣", row: srdRow, shown: RULES, onSave, onClose, ...props };
  let rerender: (props: Partial<RowTextDialogProps>) => void = () => {};
  await act(async () => {
    const view = render(<RowTextDialog {...all} />, { wrapper });
    rerender = (next) => view.rerender(<RowTextDialog {...all} {...next} />);
  });
  await screen.findByRole("dialog", { name: "編輯回氣的文字" });
  return { onSave, onClose, rerender };
}

const box = () => screen.getByRole("textbox", { name: "編輯回氣的文字" });
const save = () => screen.getByRole("button", { name: "儲存" });

describe("the row text editor", () => {
  it.skipIf(zhWithheld("messages/edit/zh-TW.json"))("saving an SRD row's rules text unchanged writes nothing: the row keeps reading the corpus", async () => {
    const { onSave, onClose } = await open({});
    expect(box()).toHaveValue(RULES);
    fireEvent.click(save());
    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it.skipIf(zhWithheld("messages/edit/zh-TW.json"))("saves a changed text into playerText", async () => {
    const { onSave } = await open({});
    fireEvent.change(box(), { target: { value: "附贈動作回 1d10＋等級。" } });
    fireEvent.click(save());
    expect(onSave).toHaveBeenCalledWith("playerText", "附贈動作回 1d10＋等級。");
  });

  it.skipIf(zhWithheld("messages/edit/zh-TW.json"))("waits for the rules text: no empty editor and no save while it loads", async () => {
    const { onSave, rerender } = await open({ shown: null, loading: true });
    expect(box()).toBeDisabled();
    expect(save()).toBeDisabled();
    fireEvent.click(save());
    expect(onSave).not.toHaveBeenCalled();
    await act(async () => rerender({ shown: RULES, loading: false }));
    expect(box()).toBeEnabled();
    expect(box()).toHaveValue(RULES);
    expect(screen.getByText("已帶入規則全文，可自行精簡或改寫。")).toBeInTheDocument();
  });
});
