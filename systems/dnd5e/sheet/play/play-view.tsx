"use client";

import { Suspense, use, useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { NextIntlClientProvider, useLocale, useMessages, useTranslations } from "next-intl";
import type { LoadedSystem } from "@skald/types/system";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@skald/sheet-sdk/components/ui/tabs";
import { useSchemaData, useSchemaStatic } from "@skald/sheet-sdk/modules/character/ui/renderer/schema-context";
import { useRollData } from "@skald/sheet-sdk/modules/character/ui/renderer/roll-data-context";
import { cn } from "@skald/sheet-sdk/lib/utils";
import type { ReferenceContextValue } from "../use-reference-context";
import type { CharacterUpdater } from "../compendium-dialog";
import type { CompendiumStart } from "../compendium-rows";
import { DndEditorHost, EditSlot, PlayContext, usePlay, type PlayContextValue } from "./play-context";
import type { CharacterPatch } from "./play-model";
import { CompactVitals, VitalsBar } from "./vitals-bar";
import { AbilityGrid, SkillList } from "./abilities-panel";
import { CharacterTab } from "./character-tab";
import { CombatTab, FeaturesTab, ItemsTab, SpellsTab } from "./lazy-tabs";
import { loadPlayMessages } from "./play-messages";
import { ZhFallbackNotice } from "../zh-fallback-notice";

/** The few hundred milliseconds a tab takes the first time it opens. */
function TabLoading() {
  return <div className="h-40 animate-pulse rounded-xl bg-muted/40" aria-hidden="true" />;
}

/** Container width from which the abilities and skills stay in a left column (frame 05). */
const WIDE_PX = 880;

/** 角色 comes first and opens by default: play is roleplay first, with combat equal to it. */
type Tab = "character" | "combat" | "skills" | "spells" | "features" | "items";

export interface DndPlayViewProps {
  system: LoadedSystem;
  reference: ReferenceContextValue;
  /** Opens a row's reference; `character` gives the request its level. */
  openReference: (row: Record<string, unknown>, character?: Record<string, unknown>) => void;
  /**
   * Opens the compendium with the sheet's write path, on `start`'s tab (the last tab when absent);
   * absent where the sheet cannot be changed.
   */
  openCompendium: ((update: CharacterUpdater, character?: Record<string, unknown>, start?: CompendiumStart) => void) | null;
}

function useContainerWide(): [React.RefObject<HTMLDivElement | null>, boolean | null] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [wide, setWide] = useState<boolean | null>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const apply = (width: number) => width > 0 && setWide(width >= WIDE_PX);
    apply(element.getBoundingClientRect().width);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (entry) apply(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, wide];
}

const TAB_LIST = "h-auto w-full justify-start gap-1 rounded-none border-b border-border bg-transparent p-0";
const TAB_TRIGGER =
  "relative h-11 flex-none rounded-none border-0 bg-transparent px-4 text-base text-muted-foreground shadow-none data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:text-foreground data-[state=active]:shadow-none dark:data-[state=active]:bg-transparent dark:data-[state=active]:border-0 after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full data-[state=active]:after:bg-accent";

function PlayLayout() {
  const t = useTranslations("play");
  const [ref, wide] = useContainerWide();
  const { values, editable } = usePlay();
  // The starting shop (plan-uat2 §3.5): a new character opens on 物品, whose tab opens the shop.
  const [tab, setTab] = useState<Tab>(() => (editable && values.startingShop === true ? "items" : "character"));
  const stickyRef = useRef<HTMLDivElement | null>(null);
  const panelsRef = useRef<HTMLDivElement | null>(null);
  const tabsRef = useRef<HTMLDivElement | null>(null);
  // A new tab starts at its top: when the page was scrolled past it, bring it back under the bar.
  const changeTab = (value: string) => {
    setTab(value as Tab);
    requestAnimationFrame(() => {
      const panels = wide ? tabsRef.current : panelsRef.current;
      const sticky = stickyRef.current;
      if (!panels || !sticky) return;
      const gap = panels.getBoundingClientRect().top - sticky.getBoundingClientRect().bottom;
      if (gap < 0) window.scrollBy({ top: gap - 8 });
    });
  };
  const shown: Tab = wide && tab === "skills" ? "combat" : tab;
  const tabs: Tab[] = wide
    ? ["character", "combat", "spells", "features", "items"]
    : ["character", "combat", "skills", "spells", "features", "items"];
  // A phone has six tabs: they share the width, and scroll sideways when a locale's labels are longer.
  const list = (
    <TabsList className={cn(TAB_LIST, !wide && "flex overflow-x-auto overscroll-x-contain [scrollbar-width:none]")} aria-label={t("tabs.label")}>
      {tabs.map((id) => (
        <TabsTrigger key={id} value={id} className={cn(TAB_TRIGGER, !wide && "min-w-11 flex-[1_0_auto] px-2.5 text-sm")}>
          {t(`tabs.${id}`)}
        </TabsTrigger>
      ))}
    </TabsList>
  );
  const panels = (
    <div ref={panelsRef}>
      <TabsContent value="character">
        <CharacterTab />
      </TabsContent>
      <TabsContent value="combat">
        <Suspense fallback={<TabLoading />}><CombatTab compact={!wide} /></Suspense>
      </TabsContent>
      {!wide && (
        <TabsContent value="skills" className="space-y-3">
          <EditSlot part="abilities"><AbilityGrid /></EditSlot>
          <EditSlot part="skills"><SkillList /></EditSlot>
        </TabsContent>
      )}
      <TabsContent value="spells">
        <Suspense fallback={<TabLoading />}><SpellsTab /></Suspense>
      </TabsContent>
      <TabsContent value="features">
        <Suspense fallback={<TabLoading />}><FeaturesTab /></Suspense>
      </TabsContent>
      <TabsContent value="items" className="space-y-3">
        <EditSlot part="items" />
        <Suspense fallback={<TabLoading />}><ItemsTab /></Suspense>
      </TabsContent>
    </div>
  );
  return (
    <div ref={ref} className="@container shell-wrap space-y-2 pb-8 pt-2" data-dnd-play-view data-layout={wide === null ? "pending" : wide ? "wide" : "compact"}>
      <EditSlot part="banner" />
      <ZhFallbackNotice />
      {wide === null ? null : wide ? (
        <>
          <div ref={stickyRef} className="sticky top-[var(--sheet-sticky-top,0px)] z-20 -mx-1 bg-background/95 px-1 pb-3 pt-1 backdrop-blur supports-[backdrop-filter]:bg-background/80">
            <VitalsBar />
          </div>
          <div className="grid grid-cols-[minmax(19rem,23rem)_minmax(0,1fr)] items-start gap-4">
            <aside className="space-y-3">
              <EditSlot part="abilities"><AbilityGrid /></EditSlot>
              <EditSlot part="skills"><SkillList /></EditSlot>
            </aside>
            <Tabs ref={tabsRef} value={shown} onValueChange={changeTab} className="gap-3">
              {list}
              {panels}
            </Tabs>
          </div>
        </>
      ) : (
        <Tabs value={shown} onValueChange={changeTab} className="gap-3">
          <div ref={stickyRef} className="sticky top-[var(--sheet-sticky-top,0px)] z-20 -mx-2 space-y-1 bg-background/95 px-2 pt-1 backdrop-blur supports-[backdrop-filter]:bg-background/80">
            <CompactVitals />
            {list}
          </div>
          {panels}
        </Tabs>
      )}
    </div>
  );
}

/**
 * The D&D 2024 sheet in play (direction B, frames 05–08): the vitals stay on top, abilities and
 * skills in the left column (a tab on a phone), the rest in tabs. Taps roll or record what was
 * spent, and the lists take everyday edits (plan-uat2 §3.2). Edit mode is the same layout with the
 * structural fields unlocked (`EditSlot`, §3.1). Rendered by TemplateRenderer inside its schema,
 * data and roll contexts.
 */
export function DndPlayView(props: DndPlayViewProps) {
  return (
    <Suspense fallback={null}>
      <PlayViewBody {...props} />
    </Suspense>
  );
}

function PlayViewBody({ system, reference, openReference, openCompendium }: DndPlayViewProps) {
  const locale = useLocale();
  const play = use(loadPlayMessages(locale));
  const messages = useMessages();
  const data = useSchemaData();
  const { schema, editable, setData, onBlur } = useSchemaStatic();
  const values = useRollData(data);

  const canWrite = editable && !!setData;
  const write = useCallback(
    (patch: CharacterPatch) => {
      if (!canWrite || !setData) return;
      setData((previous) => ({ ...previous, ...patch }));
      onBlur?.();
    },
    [canWrite, setData, onBlur],
  );
  const update = useMemo<PlayContextValue["update"]>(
    () =>
      canWrite && setData
        ? (updater) => {
            setData(updater);
            onBlur?.();
          }
        : null,
    [canWrite, setData, onBlur],
  );

  const context = useMemo<PlayContextValue>(
    () => ({
      values,
      data,
      editable: canWrite,
      write,
      update,
      reference,
      openReference: (row) => openReference(row, data),
      openCompendium: openCompendium && update ? (start) => openCompendium(update, data, start) : null,
      system,
      schema,
    }),
    [values, data, canWrite, write, update, reference, openReference, openCompendium, system, schema],
  );

  const merged = useMemo(
    () => ({ ...messages, play }),
    [messages, play],
  );

  return (
    <NextIntlClientProvider locale={locale} messages={merged}>
      <PlayContext.Provider value={context}>
        <DndEditorHost>
          <PlayLayout />
        </DndEditorHost>
      </PlayContext.Provider>
    </NextIntlClientProvider>
  );
}
