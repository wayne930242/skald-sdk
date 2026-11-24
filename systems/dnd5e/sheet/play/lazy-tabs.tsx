"use client";

import { lazy, type ComponentType } from "react";

type Loaded<P> = { default: ComponentType<P> };

/**
 * A play tab loaded when it first opens: the view opens on 角色, so the other tabs stay out of
 * the sheet's first load (D&D sheet extra over CoC ≤ 60 KB). `preload` loads it ahead; once
 * loaded, the lazy component's thenable answers at once, so the tab renders without a fallback.
 */
function lazyTab<P extends object>(load: () => Promise<ComponentType<P>>) {
  let loaded: Loaded<P> | null = null;
  let pending: Promise<Loaded<P>> | null = null;
  const preload = () => (pending ??= load().then((component) => (loaded = { default: component })));
  const Tab = lazy<ComponentType<P>>(() => {
    const thenable = {
      then(resolve: (value: Loaded<P>) => void, reject: (reason: unknown) => void) {
        if (loaded) resolve(loaded);
        else preload().then(resolve, reject);
      },
    };
    return thenable as unknown as Promise<Loaded<P>>;
  });
  return { Tab, preload };
}

const combat = lazyTab(() => import("./combat-tab").then((module) => module.CombatTab));
const spells = lazyTab(() => import("./spells-tab").then((module) => module.SpellsTab));
const features = lazyTab(() => import("./features-tab").then((module) => module.FeaturesTab));
// 物品 also needs the item catalog (shop, equip slots, carried weight): it loads with the tab.
const items = lazyTab(() => import("./items-tab-intl").then((module) => module.loadItemsTab()));

export const CombatTab = combat.Tab;
export const SpellsTab = spells.Tab;
export const FeaturesTab = features.Tab;
export const ItemsTab = items.Tab;

/** Loads every lazy play tab. */
export function preloadPlayTabs(): Promise<unknown> {
  return Promise.all([combat.preload(), spells.preload(), features.preload(), items.preload()]);
}
