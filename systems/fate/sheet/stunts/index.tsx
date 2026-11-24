"use client";
import { Suspense, use, useState } from "react";
import { createTranslator, useLocale } from "next-intl";
import { Button } from "@skald/sheet-sdk/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@skald/sheet-sdk/components/ui/dialog";
import { Input } from "@skald/sheet-sdk/components/ui/input";
import type { FateStuntRow } from "../../domain/character";
import { fateStuntAvailable } from "../../domain/lifecycle";
import { fateRecord, readFateResources, readFateStunts } from "../../domain/normalize";
import { sheetRuleTargets } from "../../reference/rule-ids";
import { useFatePlay } from "../play/play-context";
import { useSkillName } from "../play/use-skill-name";
import { markUsed, saveStunt, stuntProse } from "./commands";
const labels = (locale: string) =>
  locale === "zh-TW"
    ? import("@skald/system-fate/data/fate-condensed/messages/v2-stunts/zh-TW.json")
    : import("@skald/system-fate/data/fate-condensed/messages/v2-stunts/en.json");
const library = (locale: string) =>
  locale === "zh-TW"
    ? import("@skald/system-fate/data/fate-condensed/stunts/zh-TW.json")
    : import("@skald/system-fate/data/fate-condensed/stunts/en.json");
function cached<T>(loader: (locale: string) => Promise<T>) {
  const cache = new Map<string, Promise<T>>();
  return (locale: string) => {
    let p = cache.get(locale);
    if (!p) {
      p = loader(locale);
      cache.set(locale, p);
      p.catch(() => cache.delete(locale));
    }
    return p;
  };
}
const getLabels = cached(labels),
  getLibrary = cached(library);
function useLabels() {
  const locale = useLocale();
  return createTranslator({ locale, messages: use(getLabels(locale)).default });
}
function Library({ copy }: { copy: (row: Partial<FateStuntRow>) => void }) {
  const locale = useLocale(),
    lib = use(getLibrary(locale)).default,
    t = useLabels();
  return (
    <div className="space-y-2">
      {lib.entries.map((e) => (
        <button
          type="button"
          className="block rounded-lg border p-3 text-start hover:bg-muted"
          key={e.id}
          onClick={() =>
            copy({
              type: e.type === "bonus" ? "bonus" : "rule-change",
              customText: e.text,
              templateText: e.id.endsWith("-template") ? e.text : undefined,
              skillId: e.skillId,
              action: e.action,
              oncePerSession: e.oncePerSession,
              sourceRef: lib.section,
              exampleId: e.id,
              sourceLocale: locale === "zh-TW" ? "zh-TW" : "en",
            })
          }
        >
          {e.text}
        </button>
      ))}
      <details>
        <summary>{t("sources")}</summary>
        <a href={lib.source}>{t("writing")}</a>
        {lib.notices.map((n) => (
          <p key={n}>{n}</p>
        ))}
      </details>
    </div>
  );
}
function Body() {
  const { data, editable, structural, skills, update, openRules } = useFatePlay();
  const locale = useLocale();
  const t = useLabels(),
    skillName = useSkillName();
  const nameOf = (id: string) => skillName(skills.find((s) => s.id === id) ?? { id, rating: 0 });
  const rows = readFateStunts(data),
    r = readFateResources(data);
  const session = fateRecord(fateRecord(data.fateV2).session).id;
  const [draft, setDraft] = useState<FateStuntRow | null>(null),
    [showLibrary, setLibrary] = useState(false);
  const edit = (row: FateStuntRow) => {
    setLibrary(false);
    setDraft({
      ...row,
      customText: stuntProse(row) || (typeof row.templateText === "string" ? row.templateText : ""),
    });
  };
  const permitted = !!draft && editable && (structural || rows.some((row) => row.id === draft.id));
  return (
    <div className="space-y-3">
      <header className="flex flex-wrap items-center justify-between">
        <h2 className="font-display text-lg">{t("title")}</h2>
        <small>
          {t("budget", { used: Math.min(3, r.stuntCount), refresh: r.effectiveRefresh })}
        </small>
      </header>
      {rows.map((row) => (
        <article key={row.id} className="space-y-1 rounded-lg border p-3">
          <strong>{row.title}</strong>
          {row.sourceLocale === "en" && locale === "zh-TW" && <small>{t("english")}</small>}
          <p className="whitespace-pre-wrap">{stuntProse(row) || t("draft")}</p>
          <small>
            {[
              row.skillId && nameOf(row.skillId),
              row.action &&
                ((["overcome", "createAdvantage", "attack", "defend"] as const)
                  .map((key) => (key === row.action ? t(key) : ""))
                  .find(Boolean) ??
                  row.action),
            ]
              .filter(Boolean)
              .join(" · ")}
          </small>
          {row.sourceRef === sheetRuleTargets.writingStunts && (
            <Button variant="link" className="min-h-11 @3xl:min-h-9" onClick={() => openRules(sheetRuleTargets.writingStunts)}>
              {t("writing")}
            </Button>
          )}
          {row.oncePerSession && (
            <Button
              size="sm"
              variant="outline"
              className="min-h-11 @3xl:min-h-8"
              // B-023: marking a stunt used records play, so edit mode leaves it inert.
              disabled={
                !editable ||
                structural ||
                !fateStuntAvailable(row, typeof session === "string" ? session : undefined)
              }
              onClick={() => update((c) => markUsed(c, row.id, editable))}
            >
              {t(!session ? "noSession" : row.usedSessionId === session ? "used" : "use")}
            </Button>
          )}
          {editable && (
            <Button size="sm" variant="ghost" className="min-h-11 @3xl:min-h-8" onClick={() => edit(row)}>
              {t("edit")}
            </Button>
          )}
        </article>
      ))}
      {!rows.length && <p>{t("empty")}</p>}
      {structural && (
        <Button variant="outline" onClick={() => edit({ id: crypto.randomUUID(), type: "custom" })}>
          {t("add")}
        </Button>
      )}
      <Dialog
        open={permitted}
        onOpenChange={(open) => {
          if (!open) setDraft(null);
        }}
      >
        <DialogContent aria-describedby={undefined} className="max-h-[85dvh] overflow-auto">
          <DialogHeader>
            <DialogTitle>{t("edit")}</DialogTitle>
          </DialogHeader>
          {draft && (
            <>
              <label>
                {t("name")}
                <Input
                  value={draft.title ?? ""}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                />
              </label>
              <label>
                {t("text")}
                <textarea
                  className="block w-full rounded border p-2"
                  value={draft.customText ?? ""}
                  onChange={(e) => setDraft({ ...draft, customText: e.target.value })}
                />
              </label>
              {structural && (
                <>
                  <label>
                    {t("skill")}
                    <select
                      value={draft.skillId ?? ""}
                      onChange={(e) => setDraft({ ...draft, skillId: e.target.value })}
                    >
                      <option value="">{t("none")}</option>
                      {skills.map((s) => (
                        <option key={s.id} value={s.id}>
                          {skillName(s)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {t("action")}
                    <select
                      value={draft.action ?? ""}
                      onChange={(e) => setDraft({ ...draft, action: e.target.value })}
                    >
                      <option value="">{t("none")}</option>
                      {(["overcome", "createAdvantage", "attack", "defend"] as const).map((a) => (
                        <option key={a} value={a}>
                          {t(a)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={!!draft.oncePerSession}
                      onChange={(e) => setDraft({ ...draft, oncePerSession: e.target.checked })}
                    />
                    {t("once")}
                  </label>
                  <Button variant="outline" onClick={() => setLibrary(!showLibrary)}>
                    {t("library")}
                  </Button>
                  {showLibrary && (
                    <Suspense>
                      <Library
                        copy={(patch) => {
                          setDraft({ ...draft, ...patch });
                          setLibrary(false);
                        }}
                      />
                    </Suspense>
                  )}
                </>
              )}
              <Button
                disabled={!permitted || saveStunt(data, draft, editable) === data}
                onClick={() => {
                  // `saveStunt` re-checks the purchase on the card it is given (the runtime's
                  // working copy), so it needs no identity check against this render.
                  if (permitted) update((c) => saveStunt(c, draft, editable));
                  setDraft(null);
                }}
              >
                {t("save")}
              </Button>
              <Button variant="ghost" onClick={() => setDraft(null)}>
                {t("cancel")}
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
export function FateStunts() {
  return (
    <Suspense>
      <Body />
    </Suspense>
  );
}
export { FateStunts as stunts };
