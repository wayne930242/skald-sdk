import { useTranslations } from "next-intl";
import type { RulesTitle } from "@skald/sheet-sdk/modules/systems/ui/core-ports";

export function EntryList({ items, hasMore, page, changePage, select }: {
  items: RulesTitle[]; hasMore: boolean; page: number; changePage: (page: number) => void; select: (key: string) => void;
}) {
  const t = useTranslations("packRules");
  return <><ul>{items.map(item => <li key={item.key}><button className="py-1 underline" onClick={() => select(item.key)}>{item.title}</button></li>)}</ul>
    <div className="flex gap-4">
      {page > 0 && <button onClick={() => changePage(page - 1)}>{t("previous")}</button>}
      {hasMore && <button onClick={() => changePage(page + 1)}>{t("next")}</button>}
    </div></>;
}
