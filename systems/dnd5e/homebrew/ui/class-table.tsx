import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { EntriesRenderer, InlineText } from "../../reference/entries-renderer";
import type { HomebrewItemInput } from "../domain/types";

const noRefs = { resolveRef: () => null };
type Block = { type?: string };
type TableNode = { colLabels?: string[]; rows?: unknown[][]; colGroups?: Array<{ entry?: string; span?: number; start?: number }> };

/** The generated table's column kinds (the generator's `TableKey`s) that have a short mobile header. */
export const SHORT_KEYS = ["level", "proficiency", "features", "cantrips", "prepared", "weaponMastery", "slots", "slotLevel", "slotGroup"] as const;
export type ShortKey = (typeof SHORT_KEYS)[number];
/** The full labels the table was generated with, per layer: English (`EN_TABLE_LABELS`) and zh-TW. */
export type TableLabels = { en: Readonly<Record<ShortKey, string>>; zh: Readonly<Record<ShortKey, string>> };

const layerOf = (zh: boolean, r: HomebrewItemInput) => (zh && r.payload.zhTW ? "zh" : "en");
const entries = (zh: boolean, r: HomebrewItemInput) =>
  ((layerOf(zh, r) === "zh" ? r.payload.zhTW!.entries : r.payload.entry!.entries) ?? []) as Block[];
const nameOf = (zh: boolean, r: HomebrewItemInput) => (zh && r.payload.zhTW?.name) || r.payload.entry!.name;

/** Whether a scroll box has more content to the right, for the edge fade and the swipe hint. */
function useScrollCue() {
  const ref = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setMore(el.scrollWidth - el.clientWidth - el.scrollLeft > 1);
    update();
    el.addEventListener("scroll", update, { passive: true });
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      observer?.disconnect();
    };
  }, []);
  return { ref, more };
}

/**
 * The 1–20 progression table: a header tint, the level column kept in view while the table scrolls
 * sideways, short headers on narrow screens, a fade and a hint while more columns sit to the right.
 */
export function ProgressionTable({ table, labels }: { table: TableNode; labels: Readonly<Record<ShortKey, string>> }) {
  const t = useTranslations("homebrew.class");
  const { ref, more } = useScrollCue();
  const colLabels = table.colLabels ?? [];
  const short = (label: string) => {
    const key = SHORT_KEYS.find((k) => labels[k] === label);
    return key ? t(`tableShort.${key}`) : label;
  };
  const header = (label: string) => {
    const brief = short(label);
    return brief === label ? (
      label
    ) : (
      <>
        <span className="sm:hidden">{brief}</span>
        <span className="hidden sm:inline">{label}</span>
      </>
    );
  };
  const groups = [...(table.colGroups ?? [])].sort((a, b) => Number(a.start ?? 0) - Number(b.start ?? 0));
  const groupCells: ReactNode[] = [];
  let column = 0;
  for (const g of groups) {
    const start = Number(g.start ?? 0);
    const span = Math.max(1, Number(g.span ?? 1));
    if (start > column) groupCells.push(<th key={`gap-${column}`} colSpan={start - column} className={column === 0 ? "sticky left-0 z-[1] bg-muted" : ""} />);
    groupCells.push(
      <th key={`group-${start}`} colSpan={span} className="px-2 pt-1 text-center text-xs font-semibold">
        {header(String(g.entry ?? ""))}
      </th>,
    );
    column = start + span;
  }
  if (groups.length && column < colLabels.length) groupCells.push(<th key="rest" colSpan={colLabels.length - column} />);
  const featuresAt = colLabels.findIndex((l) => l === labels.features);
  return (
    <div className="space-y-1">
      <div className="relative rounded border bg-background" data-class-table>
        <div ref={ref} className="overflow-x-auto" data-progression-scroll>
          <table className="w-full border-collapse text-sm lining-nums tabular-nums">
            <thead className="bg-muted">
              {groupCells.length > 0 && <tr>{groupCells}</tr>}
              <tr>
                {colLabels.map((label, i) => (
                  <th
                    key={i}
                    scope="col"
                    className={`border-b px-2 py-1 text-left align-bottom font-semibold ${i === 0 ? "sticky left-0 z-[1] bg-muted" : ""} ${
                      i === featuresAt ? "min-w-[14ch]" : ""
                    }`}
                  >
                    {header(label)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(table.rows ?? []).map((row, r) => (
                <tr key={r} className="border-b last:border-b-0">
                  {row.map((cell, i) =>
                    i === 0 ? (
                      <th key={i} scope="row" className="sticky left-0 z-[1] bg-background px-2 py-1 text-left font-medium">
                        {String(cell)}
                      </th>
                    ) : (
                      <td key={i} className={`px-2 py-1 align-top ${i === featuresAt ? "min-w-[14ch]" : ""}`}>
                        {typeof cell === "string" ? <InlineText text={cell} context={noRefs} /> : String(cell)}
                      </td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {more && <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-8 rounded-r bg-gradient-to-l from-background" data-scroll-fade />}
      </div>
      {more && (
        <p className="text-xs text-muted-foreground" data-scroll-hint>
          {t("tableScroll")}
        </p>
      )}
    </div>
  );
}

/** The class row's live progression table. */
export function ClassTable({ head, zh, labels }: { head: HomebrewItemInput; zh: boolean; labels: TableLabels }) {
  const table = entries(zh, head).find((b) => b?.type === "table") as TableNode | undefined;
  if (!table) return null;
  return <ProgressionTable table={table} labels={labels[layerOf(zh, head)]} />;
}

/** Each generated feature, as the reference renders it. */
export function GeneratedFeatures({ rows, zh }: { rows: HomebrewItemInput[]; zh: boolean }) {
  const t = useTranslations("homebrew");
  return (
    <section className="space-y-3 rounded bg-muted p-3 sm:p-4" data-class-features-preview>
      <h4 className="text-sm text-muted-foreground">{t("preview")}</h4>
      {rows
        .filter((r) => r.payload.entry?.meta?.generated)
        .map((r) => (
          <article key={r.key} className="min-w-0 break-words">
            <strong>{nameOf(zh, r)}</strong>
            <EntriesRenderer context={noRefs} entries={entries(zh, r)} />
          </article>
        ))}
    </section>
  );
}
