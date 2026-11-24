"use client";

import { Component, lazy, Suspense, useMemo, type ComponentType, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { SchemaI18nProvider, useSchemaI18n } from "@skald/sheet-sdk/lib/i18n/use-schema-i18n";
import { loadFateMessages } from "./plugin";
import { defineFieldRenderer, type SystemPluginRenderUi } from "@skald/sheet-sdk/modules/systems/ui/system-plugin-ui";

class FieldError extends Component<{children: ReactNode; message: string}, {failed: boolean}> {
  state = {failed: false};
  static getDerivedStateFromError() { return {failed: true}; }
  render() { return this.state.failed ? <span role="alert">{this.props.message}</span> : this.props.children; }
}

function compat<P extends object>(load: () => Promise<ComponentType<P>>) {
  function localized(locale: string) {
    return lazy(async () => {
      const [Renderer, fallback] = await Promise.all([load(), loadFateMessages(locale)]);
      function LocalizedField(props: P) {
        const host = useSchemaI18n();
        const messages = useMemo(() => ({...fallback, ...host.messages}), [host.messages]);
        return <SchemaI18nProvider messages={messages}><Renderer {...props} /></SchemaI18nProvider>;
      }
      return {default: LocalizedField};
    });
  }
  const en = localized("en"), zh = localized("zh-TW");
  return function CompatField(props: P) {
    const {locale} = useSchemaI18n();
    const t = useTranslations("common");
    const Field = locale === "zh-TW" ? zh : en;
    return <FieldError key={locale} message={t("error")}><Suspense fallback={<span role="status">{t("loading")}</span>}><Field {...props} /></Suspense></FieldError>;
  };
}

const FateAspectListFieldRenderer = compat(() => import("./sheet/aspect-list-field").then(m => m.FateAspectListFieldRenderer));
const FateRefreshFieldRenderer = compat(() => import("./sheet/refresh-field").then(m => m.FateRefreshFieldRenderer));
const FateResetButtonRenderer = compat(() => import("./sheet/reset-button").then(m => m.FateResetButtonRenderer));
const FateSkillPyramidFieldRenderer = compat(() => import("./sheet/skill-pyramid-field").then(m => m.FateSkillPyramidFieldRenderer));
const FateStressTrackFieldRenderer = compat(() => import("./sheet/stress-track-field").then(m => m.FateStressTrackFieldRenderer));
const FateStuntListFieldRenderer = compat(() => import("./sheet/stunt-list-field").then(m => m.FateStuntListFieldRenderer));

export const fateCompatRenderUi: SystemPluginRenderUi = {
  fieldRenderers: [
    defineFieldRenderer("fate-aspect-list", FateAspectListFieldRenderer),
    defineFieldRenderer("fate-refresh", FateRefreshFieldRenderer),
    defineFieldRenderer("fate-reset-button", FateResetButtonRenderer),
    defineFieldRenderer("fate-skill-pyramid", FateSkillPyramidFieldRenderer),
    defineFieldRenderer("fate-stress-track", FateStressTrackFieldRenderer),
    defineFieldRenderer("fate-stunt-list", FateStuntListFieldRenderer),
  ],
};
