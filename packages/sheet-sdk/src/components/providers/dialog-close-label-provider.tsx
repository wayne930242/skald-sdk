"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useTranslations } from "next-intl";

const DialogCloseLabelContext = createContext("Close");

export function DialogCloseLabelProvider({ children }: { children: ReactNode }) {
  const t = useTranslations("common");
  return <DialogCloseLabelContext value={t("close")}>{children}</DialogCloseLabelContext>;
}

export function useDialogCloseLabel() {
  return useContext(DialogCloseLabelContext);
}
