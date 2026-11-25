import { useTranslations } from "next-intl";
import { EntriesRenderer } from "../../reference/entries-renderer";
import type { HomebrewItemInput } from "../domain/types";

const noRefs = { resolveRef: () => null };

/**
 * A subclass as a reader meets it: one header block (name and description, without the generated
 * feature list), then each feature. The intro row repeats the header for the level-up helper, so it
 * is not shown again.
 */
export function SubclassPreview({ rows, zh }: { rows: HomebrewItemInput[]; zh: boolean }) {
  const t = useTranslations("homebrew");
  const [head, ...features] = rows;
  const name = (r: HomebrewItemInput) => (zh && r.payload.zhTW?.name) || r.payload.entry!.name;
  const entries = (r: HomebrewItemInput) => ((zh && r.payload.zhTW ? r.payload.zhTW.entries : r.payload.entry!.entries) ?? []) as unknown[];
  return (
    <section className="space-y-3 rounded bg-muted p-3 sm:p-4" data-subclass-preview>
      <h4 className="text-sm text-muted-foreground">{t("preview")}</h4>
      <header className="min-w-0 break-words" data-subclass-preview-head>
        <strong className="font-heading text-lg lining-nums">{name(head)}</strong>
        <EntriesRenderer context={noRefs} entries={entries(head).slice(0, -1)} />
      </header>
      {features
        .filter((r) => r.payload.entry?.meta?.generated !== "intro")
        .map((r) => (
          <article key={r.key} className="min-w-0 break-words" data-subclass-preview-feature>
            <strong>
              {name(r)}{" "}
              <span className="text-xs font-normal text-muted-foreground">{t("subclass.level", { level: Number(r.payload.entry!.meta!.level) })}</span>
            </strong>
            <EntriesRenderer context={noRefs} entries={entries(r)} />
          </article>
        ))}
    </section>
  );
}
