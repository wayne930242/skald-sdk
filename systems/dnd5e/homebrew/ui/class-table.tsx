import { useTranslations } from "next-intl";
import { EntriesRenderer } from "../../reference/entries-renderer";
import type { HomebrewItemInput } from "../domain/types";

const noRefs = { resolveRef: () => null };
type Block = { type?: string };

/** The live 1–20 progression table and each generated feature, as the reference renders them. */
export function ClassPreview({ rows, zh }: { rows: HomebrewItemInput[]; zh: boolean }) {
  const t = useTranslations("homebrew");
  const [head, ...features] = rows;
  const entries = (r: HomebrewItemInput) => ((zh && r.payload.zhTW ? r.payload.zhTW.entries : r.payload.entry!.entries) ?? []) as Block[];
  const name = (r: HomebrewItemInput) => (zh && r.payload.zhTW?.name) || r.payload.entry!.name;
  const table = entries(head).filter((b) => b?.type === "table");
  return (
    <section className="space-y-3 rounded bg-muted p-3 sm:p-4" data-class-preview>
      <h4 className="text-sm text-muted-foreground">{t("class.table")}</h4>
      <div className="overflow-x-auto" data-class-table>
        <EntriesRenderer context={noRefs} entries={table} />
      </div>
      <h4 className="text-sm text-muted-foreground">{t("preview")}</h4>
      {features
        .filter((r) => r.payload.entry?.meta?.generated)
        .map((r) => (
          <article key={r.key} className="min-w-0 break-words">
            <strong>{name(r)}</strong>
            <EntriesRenderer context={noRefs} entries={entries(r)} />
          </article>
        ))}
    </section>
  );
}
