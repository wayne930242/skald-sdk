"use client";

import { use, useEffect, useMemo, useRef, useState } from "react";
import { NextIntlClientProvider, useLocale, useMessages, useTranslations } from "next-intl";
import type { LoadedSystem } from "@skald/types/system";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@skald/sheet-sdk/components/ui/dialog";
import type { EffectivePacks } from "../../content-pack/domain/types";
import type { ReferenceContextValue } from "../use-reference-context";
import type { LevelUpRequest } from "../play/play-context";
import { cachedUntilRejected } from "../play/play-messages";
import { classInfoOf, levelUpPlan, type LevelUpPlan } from "./plan";
import { loadClass, loadClasses } from "./load-class";
import { ClassPicker, type ClassCandidate } from "./level-up-multiclass";
import { LevelUpForm, LevelUpShell, type Applied } from "./level-up-form";
import { AppliedView } from "./level-up-result";
import { multiclassRulesOf, prerequisites } from "../../reference/multiclass";
import { sheetClasses, type SheetClass } from "../play/class-model";
import { ABILITIES, type Ability } from "../play/play-model";

/**
 * The level-up helper (phase 2b §4): 升級 raises the sheet one level with the class's offer, in one
 * data update; the latest level up can be undone from its notice or the result screen. Mounted by the D&D adapter
 * beside the compendium, loaded when first opened; its labels are a lazy catalog of their own.
 */

type Messages = Record<string, unknown>;
const catalogs = new Map<string, Promise<Messages>>();

function loadLevelUpMessages(locale: string): Promise<Messages> {
  const key = locale === "zh-TW" ? "zh-TW" : "en";
  return cachedUntilRejected(catalogs, key, () =>
    key === "zh-TW"
      ? import("@skald/system-dnd5e/data/dnd5e-2024/messages/level-up/zh-TW.json").then((module) => module.default as Messages)
      : import("@skald/system-dnd5e/data/dnd5e-2024/messages/level-up/en.json").then((module) => module.default as Messages),
  );
}

/** 「Martial weapons」 in every level-up catalog: an existing proficiency in either language counts. */
function useMartialWeaponsLabels(): readonly string[] {
  const [labels, setLabels] = useState<readonly string[]>([]);
  useEffect(() => {
    let live = true;
    const label = (messages: Messages) => ((messages.multiclass as { gains?: { martialWeapons?: unknown } } | undefined)?.gains?.martialWeapons);
    Promise.all([loadLevelUpMessages("zh-TW"), loadLevelUpMessages("en")])
      .then((all) => live && setLabels(all.map(label).filter((value): value is string => typeof value === "string" && value !== "")))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return labels;
}

export interface LevelUpDialogProps {
  request: LevelUpRequest;
  system: LoadedSystem;
  context: ReferenceContextValue;
  /** The device's enabled packs: Drive-pack and homebrew classes, subclasses and features. */
  packs: EffectivePacks | null;
  /** The sheet is a table's copy: a pack row is added without its text (D9). */
  inTable?: boolean;
  onClose: () => void;
}

export function LevelUpDialog(props: LevelUpDialogProps) {
  const locale = useLocale();
  const levelUp = use(loadLevelUpMessages(locale));
  const messages = useMessages();
  const merged = useMemo(() => ({ ...messages, levelUp }), [messages, levelUp]);
  return (
    <NextIntlClientProvider locale={locale} messages={merged}>
      <LevelUpBody {...props} />
    </NextIntlClientProvider>
  );
}

const text = (value: unknown) => (typeof value === "string" ? value : "");

/** Loads by key once per change of key; undefined while it loads. A failed chunk load is left unhandled, so it reaches the error reporting. */
function useLoaded<T>(key: string | null, load: () => Promise<T>): T | undefined {
  const [loaded, setLoaded] = useState<{ key: string; value: T } | null>(null);
  const latest = useRef(load);
  useEffect(() => {
    latest.current = load;
  });
  useEffect(() => {
    if (key === null) return;
    let live = true;
    void latest.current().then((value) => {
      if (live) setLoaded({ key, value });
    });
    return () => {
      live = false;
    };
  }, [key]);
  return key !== null && loaded && loaded.key === key ? loaded.value : undefined;
}

/** The header select's value: an existing class (`advance:<classId>`, `""` = a starting class without id) or 新增職業. */
type Pick = { kind: "advance"; classId: string } | { kind: "add" };
const ADD = "add";
const pickValue = (pick: Pick) => (pick.kind === "add" ? ADD : `advance:${pick.classId}`);

const SCORE_KEYS: readonly Ability[] = ABILITIES;
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** Built-in (game data, packs merged), Drive-pack and homebrew classes, by id: their `meta` for the prerequisite badge. */
type ClassSource = { name: string; meta: Record<string, unknown> | undefined; /** The game's class order; null for a pack or homebrew class. */ order: number | null };

function classSources(system: LoadedSystem, packs: EffectivePacks | null): Map<string, ClassSource> {
  const out = new Map<string, ClassSource>();
  const builtin = Array.isArray(system.gameData?.classes) ? (system.gameData.classes as unknown[]) : [];
  for (const item of builtin) {
    if (!isRecord(item) || typeof item.id !== "string" || !item.id) continue;
    out.set(item.id, { name: item.id, meta: isRecord(item.meta) ? item.meta : item, order: out.size });
  }
  for (const entry of packs?.content.entries ?? []) {
    if (entry.kind !== "class" || !entry.id || out.has(entry.id)) continue;
    out.set(entry.id, { name: entry.name, meta: isRecord(entry.meta) ? entry.meta : undefined, order: null });
  }
  return out;
}

/** The Fighting Style feats a feature's choice offers: built-in and pack, minus those on the sheet. */
function fightingStyleFeats(system: LoadedSystem, packs: EffectivePacks | null, nameOf: (ref: string) => string, data: Record<string, unknown>): Array<{ ref: string; name: string }> {
  const out = new Map<string, string>();
  const named = (ref: string, fallback: string) => {
    const name = nameOf(ref);
    return name && name !== ref.slice(ref.indexOf(":") + 1) ? name : fallback;
  };
  const builtin = Array.isArray(system.gameData?.feats) ? (system.gameData.feats as unknown[]) : [];
  for (const feat of builtin) {
    if (isRecord(feat) && feat.category === "fightingStyle" && typeof feat.id === "string") out.set(`feat:${feat.id}`, named(`feat:${feat.id}`, feat.id));
  }
  for (const entry of packs?.content.entries ?? []) {
    if (entry.kind === "feat" && isRecord(entry.meta) && entry.meta.category === "fightingStyle" && !out.has(entry.ref)) out.set(entry.ref, named(entry.ref, entry.name));
  }
  const taken = new Set((Array.isArray(data.feats) ? data.feats : []).map((row) => (isRecord(row) ? row.ref : undefined)));
  return [...out].filter(([ref]) => !taken.has(ref)).map(([ref, name]) => ({ ref, name }));
}

function LevelUpBody({ request, system, context, packs, inTable = false, onClose }: LevelUpDialogProps) {
  const t = useTranslations("levelUp");
  const tMulti = useTranslations("levelUp.multiclass");
  // The data the offer is planned on: the sheet when opened, then the result of each apply (繼續升級).
  const [base, setBase] = useState(() => request.current());
  const [applied, setApplied] = useState<Applied | null>(null);
  const sheet = useMemo(() => sheetClasses(base), [base]);
  const multiclass = sheet.length > 1;
  const classId = text(base.classId);
  const [pick, setPick] = useState<Pick>({ kind: "advance", classId });
  const [addId, setAddId] = useState<string | null>(null);
  const { nameOf, sources, locale } = context;
  const martialWeaponsLabels = useMartialWeaponsLabels();
  const loadInput = { packs, nameOf, sources, locale };

  const ids = sheet.map((entry) => entry.classId);
  const idsKey = `${ids.join("|")}#${locale}`;
  const loadedSheet = useLoaded(idsKey, () => loadClasses({ ...loadInput, classIds: ids }));
  const loadedAdd = useLoaded(pick.kind === "add" && addId ? `${addId}#${locale}` : null, () => loadClass({ ...loadInput, classId: addId ?? "" }));

  const classNameOf = (entry: SheetClass) => {
    const builtin = entry.classId ? nameOf(`class:${entry.classId}`) : "";
    return (builtin && builtin !== entry.classId ? builtin : "") || entry.name.trim() || t("classFallback");
  };

  const plan = useMemo((): LevelUpPlan | null | undefined => {
    if (loadedSheet === undefined) return undefined;
    const starting = loadedSheet.get(classId)?.info ?? null;
    const asiFeatName = nameOf("feat:ability-score-improvement");
    // A single-class sheet advancing its class keeps L1's plan: the same one screen as before.
    if (!multiclass && pick.kind === "advance") return levelUpPlan({ data: base, classInfo: starting, asiFeatName });
    if (pick.kind === "add" && (!addId || loadedAdd === undefined)) return undefined;
    const classes = new Map([...loadedSheet].map(([id, value]) => [id, value?.info ?? null]));
    const common = { data: base, classInfo: starting, classes, asiFeatName, nameOf, martialWeaponsLabel: tMulti("gains.martialWeapons"), martialWeaponsLabels };
    if (pick.kind === "advance") return levelUpPlan({ ...common, target: { kind: "advance", classId: pick.classId } });
    // A picked class no source loads (a disabled pack): a minimal class so level and hit points still go up.
    const info = loadedAdd?.info ?? classInfoOf({ id: addId ?? "", blocks: null, entries: [], name: candidateName(addId ?? ""), origin: "custom" });
    return levelUpPlan({ ...common, target: { kind: "add", classInfo: info } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, loadedSheet, loadedAdd, pick, addId, multiclass, classId, nameOf, tMulti, martialWeaponsLabels]);

  const sourcesById = useMemo(() => classSources(system, packs), [system, packs]);
  const fightingStyles = useMemo(() => fightingStyleFeats(system, packs, nameOf, base), [system, packs, nameOf, base]);
  function candidateName(id: string) {
    const local = nameOf(`class:${id}`);
    return local && local !== id ? local : sourcesById.get(id)?.name ?? id;
  }
  const candidates = useMemo((): ClassCandidate[] => {
    const scores = Object.fromEntries(SCORE_KEYS.map((ability) => [ability, typeof base[ability] === "number" ? (base[ability] as number) : 10])) as Record<Ability, number>;
    const onSheet = new Set(ids.filter(Boolean));
    const sheetRules = sheet.map((entry) => loadedSheet?.get(entry.classId)?.info?.multiclass ?? multiclassRulesOf(entry.classId, sourcesById.get(entry.classId)?.meta));
    return [...sourcesById]
      .filter(([id]) => !onSheet.has(id))
      .map(([id, source]) => ({ id, name: candidateName(id), order: source.order, prerequisites: prerequisites(scores, [...sheetRules, multiclassRulesOf(id, source.meta)]) }))
      // Built-in classes in the game's order, then pack and homebrew ones by name (UAT m11).
      .sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity) || a.name.localeCompare(b.name, locale))
      .map(({ order, ...candidate }) => ({ ...candidate, custom: order === null }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourcesById, base, sheet, loadedSheet, locale, nameOf]);

  /** Back to the form on `data`: after 繼續升級 the sheet now, after 復原上次升級 the sheet undone. */
  const restart = (data: Record<string, unknown>) => {
    setBase(data);
    setApplied(null);
    setPick({ kind: "advance", classId: text(data.classId) });
    setAddId(null);
  };
  const continueLevel = () => restart(request.current());
  const openFollowUp = (start: Parameters<NonNullable<LevelUpRequest["openCompendium"]>>[0]) => {
    request.openCompendium?.(start);
    onClose();
  };
  const onSelect = (value: string) => {
    if (value === ADD) setPick({ kind: "add" });
    else setPick({ kind: "advance", classId: value.slice("advance:".length) });
    setAddId(null);
  };
  const addName = addId ? candidateName(addId) : "";
  const picker = pick.kind === "add" && (
    <ClassPicker candidates={candidates} picked={addId} onPick={setAddId} onChange={() => setAddId(null)} />
  );
  const formKey = `${pickValue(pick)}:${addId ?? ""}:${plan?.character?.to ?? plan?.toLevel ?? 0}`;

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="flex max-h-[90dvh] flex-col gap-3 p-4 sm:max-w-lg sm:p-6" data-level-up-dialog>
        <DialogHeader>
          <DialogTitle>{applied ? t("result.title", { level: applied.level }) : t("title")}</DialogTitle>
          {/* The instruction is for choosing; the result screen summarizes instead (UAT m8). */}
          <DialogDescription className={applied ? "sr-only" : undefined}>{applied ? t("result.changes") : t("description")}</DialogDescription>
        </DialogHeader>
        {!applied && (
          <div className="flex flex-wrap items-center gap-2" data-level-up-class-slot>
            <label className="text-sm text-muted-foreground" htmlFor="level-up-class-select">{t("classLabel")}</label>
            <select
              id="level-up-class-select"
              className="min-h-9 rounded-md border border-border bg-background px-2 text-sm font-medium"
              value={pickValue(pick)}
              onChange={(event) => onSelect(event.target.value)}
              data-level-up-class={pick.kind === "advance" ? pick.classId || undefined : undefined}
            >
              {sheet.map((entry) => (
                <option key={entry.rowId ?? "start"} value={`advance:${entry.classId}`}>
                  {t("classLine", { name: classNameOf(entry), from: entry.level, to: entry.level + 1 })}
                </option>
              ))}
              <option value={ADD}>{tMulti("addOption")}</option>
            </select>
            {plan?.character && (
              <span className="text-sm text-muted-foreground tabular-nums" data-level-up-character-level>
                {tMulti("characterLevel", plan.character)}
              </span>
            )}
          </div>
        )}
        {applied ? (
          <AppliedView applied={applied} request={request} onContinue={continueLevel} onUndone={restart} onFollowUp={openFollowUp} onClose={onClose} />
        ) : plan ? (
          <LevelUpForm
            key={formKey}
            plan={plan}
            before={picker}
            featChoices={fightingStyles}
            columnLabels={(pick.kind === "add" ? loadedAdd : loadedSheet?.get(pick.classId))?.columnLabels ?? {}}
            unarmoredName={plan.unarmoredDefense ? candidateName(plan.unarmoredDefense.value) : addName}
            request={request}
            system={system}
            context={context}
            inTable={inTable}
            onApplied={(next) => setApplied(next)}
            onClose={onClose}
          />
        ) : (
          <LevelUpShell onCancel={onClose} blocked={pick.kind === "add" && !addId ? tMulti("blocked.pick") : t("loading")}>
            {picker}
            {plan === undefined && (pick.kind !== "add" || addId) && <p className="text-sm text-muted-foreground" role="status">{t("loading")}</p>}
          </LevelUpShell>
        )}
      </DialogContent>
    </Dialog>
  );
}
