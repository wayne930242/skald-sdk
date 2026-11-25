import { useTranslations } from "next-intl";
import { Button } from "@skald/sheet-sdk/components/ui/button";
import type { MoveChanges, SubclassParent } from "../domain/subclass";
import type { SubclassCatalog } from "./subclass-context";

/** The changes a move to another parent class would make, applied only when the author confirms. */
export function ReparentConfirm({
  parent,
  changes,
  catalog,
  zh,
  confirm,
  cancel,
}: {
  parent: SubclassParent;
  changes: MoveChanges;
  catalog: SubclassCatalog;
  zh: boolean;
  confirm(): void;
  cancel(): void;
}) {
  const t = useTranslations("homebrew");
  const l = zh ? "zh" : "en";
  const spell = (ref: string) => catalog.spells[ref]?.[l] ?? ref.replace(/^spell:/, "");
  return (
    <div role="alertdialog" aria-labelledby="subclass-move-title" className="-mt-3 space-y-2 rounded border border-destructive/60 p-3 text-sm" data-subclass-move>
      <p id="subclass-move-title" className="font-medium">
        {t("subclass.move.title", { parent: parent.name[l] })}
      </p>
      <ul className="list-disc space-y-1 pl-5">
        {changes.casting && <li data-move-change="casting">{t("subclass.move.casting", { parent: parent.name[l] })}</li>}
        {changes.spells.map((s) => (
          <li key={s.level} data-move-change="spells">
            {t("subclass.move.spells", { level: s.level, spells: s.refs.map(spell).join(t("subclass.move.separator")) })}
          </li>
        ))}
        {changes.features.map((c, i) => (
          <li key={i} data-move-change="feature">
            {t("subclass.move.feature", {
              feature: (zh ? c.feature.nameZh || c.feature.nameEn : c.feature.nameEn || c.feature.nameZh) || "—",
              from: c.from,
              to: c.to,
            })}
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground">{t("subclass.move.restore")}</p>
      <div className="flex gap-2">
        <Button type="button" variant="destructive" onClick={confirm}>
          {t("subclass.move.confirm")}
        </Button>
        <Button type="button" variant="outline" onClick={cancel}>
          {t("cancel")}
        </Button>
      </div>
    </div>
  );
}
