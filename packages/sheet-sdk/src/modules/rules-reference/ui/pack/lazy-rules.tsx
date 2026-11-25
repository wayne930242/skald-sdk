"use client";
import { lazy, Suspense, useState } from "react";
import { useTranslations } from "next-intl";

const Dialog = lazy(() => import("./system-rules-dialog").then(m => ({ default: m.SystemRulesDialog })));
export function LazyRulesDialog(props: React.ComponentProps<typeof Dialog>) {
  return props.open && <Suspense fallback={null}><Dialog {...props} /></Suspense>;
}
export function PackRulesButton({ systemId }: { systemId: string }) {
  const t = useTranslations("packRules");
  const [open, setOpen] = useState(false);
  return <><button className="rounded border px-3 py-2" onClick={() => setOpen(true)}>{t("title")}</button>
    <LazyRulesDialog systemId={systemId} open={open} onOpenChange={setOpen} /></>;
}
