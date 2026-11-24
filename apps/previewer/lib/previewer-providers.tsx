"use client";

import type { AnchorHTMLAttributes, ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import { Toaster } from "@skald/sheet-sdk/components/ui/sonner";
import { TooltipProvider } from "@skald/sheet-sdk/components/ui/tooltip";
import { bindHostPort, HostPortsProvider, type HostPortBinding } from "@skald/sheet-sdk/modules/systems/ui/host-ports";
import { corePorts } from "@skald/sheet-sdk/modules/systems/ui/core-ports";
import { SystemPluginProvider } from "@skald/sheet-sdk/modules/systems/ui/system-plugin-provider";
import type { GameIconSource } from "@skald/sheet-sdk/lib/game-icons/client";
import { dndPackSourcePort } from "@skald/system-dnd5e/sheet/pack-source-port";
import sdkEn from "@skald/sheet-sdk/messages/en.json";
import sdkZhTW from "@skald/sheet-sdk/messages/zh-TW.json";
import previewerEn from "../messages/en.json";
import previewerZhTW from "../messages/zh-TW.json";
import {
  getSystemConfig,
  getSystemMessages,
  getSystemSkillLabel,
  loadSystemMessages,
  PLUGIN_UI_CATALOG,
  type Locale,
} from "./systems";
import { previewerPackSource } from "./content-packs";

const MESSAGES: Record<Locale, Record<string, unknown>> = {
  en: { ...sdkEn, ...previewerEn },
  "zh-TW": { ...sdkZhTW, ...previewerZhTW },
};

/** Icons from this app's own route, which reads the SDK's icons.json (app/api/game-icons). */
const localGameIcons: GameIconSource = {
  fetchIcon: (name) =>
    fetch(`/api/game-icons/${encodeURIComponent(name)}`).then((response) => (response.ok ? response.text() : null)),
};

/** A plain link: the previewer has no other pages for a sheet to link to. */
function PlainLink(props: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return <a {...props} />;
}

/**
 * The host ports the previewer serves: only harmless local ones, and D&D's content packs from local
 * files kept in memory (`content-packs.ts`). Table sessions, portrait upload, PDF download and the
 * Excel engine stay unregistered, so their controls show as unavailable, as they would in any host
 * that lacks them.
 */
const PREVIEWER_PORTS: readonly HostPortBinding[] = [
  bindHostPort(corePorts.gameIconSource, localGameIcons),
  bindHostPort(corePorts.navigationLink, PlainLink),
  bindHostPort(dndPackSourcePort, previewerPackSource),
];

const DATA_CATALOG = {
  ...PLUGIN_UI_CATALOG,
  getBuiltinSystemConfig: getSystemConfig,
  getClientSystemMessages: getSystemMessages,
  preloadClientSystemMessages: loadSystemMessages,
  getSystemSkillLabel,
};

export function PreviewerProviders({ locale, children }: { locale: Locale; children: ReactNode }) {
  return (
    <NextIntlClientProvider locale={locale} messages={MESSAGES[locale]} timeZone="UTC">
      <HostPortsProvider ports={PREVIEWER_PORTS}>
        <SystemPluginProvider catalog={DATA_CATALOG}>
          <TooltipProvider>{children}</TooltipProvider>
        </SystemPluginProvider>
      </HostPortsProvider>
      <Toaster />
    </NextIntlClientProvider>
  );
}
