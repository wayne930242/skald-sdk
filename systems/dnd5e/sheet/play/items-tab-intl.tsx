"use client";

import { EditIntl } from "./edit-messages";
import { EconomyIntl } from "../economy/economy-intl";
import { ItemsTab as Items } from "./items-tab";
import { loadCatalog } from "../economy/catalog";

/** The 物品 tab with the lazy labels it reads (`play.items`, `edit.*`, `economy.*`). */
export function ItemsTab() {
  return (
    <EditIntl>
      <EconomyIntl>
        <Items />
      </EconomyIntl>
    </EditIntl>
  );
}

/** The tab once the item catalog it reads has loaded (lazy-tabs). */
export function loadItemsTab(): Promise<typeof ItemsTab> {
  return loadCatalog().then(() => ItemsTab);
}
