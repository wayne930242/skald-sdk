"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { TemplateRenderer } from "@skald/sheet-sdk/modules/character/ui/renderer";
import { ClientSystemIntlProvider } from "@skald/sheet-sdk/components/providers/client-system-intl-provider";
import { usesGameIcons } from "@skald/sheet-sdk/lib/game-icons/usage";
import { PrintHygieneProvider } from "./print-hygiene-rules";
import { PrintSheet } from "./kit/print-sheet";
import { PrintFlow } from "./kit/print-flow";
import { PrintAttribution } from "./kit/print-attribution";
import type { PrintDocumentProps } from "@skald/sheet-sdk/modules/systems/ui/system-print";
import en from "./messages/en.json";
import zhTW from "./messages/zh-TW.json";

// Print writes nothing: the renderer gets callbacks that drop every edit, and the pages are inert.
const ignore = () => {};

/**
 * The template's pages at their print size, as the sheet's former 「列印版面預覽」 rendered them:
 * the same props, with every write callback a no-op.
 */
export function TemplatePrintDocument({
  data,
  schema,
  template,
  formulaRuntime,
  editable,
  setupMode,
  handlers,
  optionSources,
}: PrintDocumentProps) {
  return (
    <TemplateRenderer
      schema={schema}
      template={template}
      data={data}
      onChange={ignore}
      setData={ignore}
      handlers={handlers}
      optionSources={optionSources}
      editable={editable}
      setupMode={setupMode}
      viewMode="print"
      onOpenPanel={ignore}
      formulaRuntime={formulaRuntime}
      onSetDerivedOverride={editable ? ignore : undefined}
      onRefreshDerivedOverride={editable ? ignore : undefined}
    />
  );
}

/** game-icons' CC BY 3.0 notice, once at the end of the print, for a template that uses them. */
function GameIconsAttribution({ locale }: { locale: string }) {
  return (
    <ClientSystemIntlProvider systemMessages={locale === "zh-TW" ? zhTW : en}>
      <GameIconsNotice />
    </ClientSystemIntlProvider>
  );
}

function GameIconsNotice() {
  const t = useTranslations("sheetPrint");
  return <PrintAttribution>{t("gameIcons")}</PrintAttribution>;
}

/**
 * Generic print for every System without its own: empty fields are omitted unless the blanks are
 * kept. The template pages flow on the print kit: the skald.tw footer on every sheet and its band
 * kept free (a long template may take one more sheet for it, boss decision D5).
 */
export function GenericPrintDocument(props: PrintDocumentProps) {
  const gameIcons = useMemo(() => usesGameIcons(props.schema), [props.schema]);
  return (
    <PrintSheet paper={props.paper} blanks={props.blanks}>
      {/* the template pages draw their own boxes on screen */}
      <PrintFlow paper={props.paper} paperOnScreen={false}>
        <PrintHygieneProvider omitEmpty={!props.blanks}>
          <TemplatePrintDocument {...props} />
        </PrintHygieneProvider>
        {gameIcons && <GameIconsAttribution locale={props.locale} />}
      </PrintFlow>
    </PrintSheet>
  );
}
