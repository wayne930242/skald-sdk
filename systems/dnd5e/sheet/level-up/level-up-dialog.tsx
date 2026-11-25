"use client";

import { use, useEffect, useMemo, useRef, useState } from "react";
import { NextIntlClientProvider, useLocale, useMessages, useTranslations } from "next-intl";
import { toast } from "sonner";
import { rollDice } from "@skald/dice";
import type { LoadedSystem } from "@skald/types/system";
import { Button } from "@skald/sheet-sdk/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@skald/sheet-sdk/components/ui/dialog";
import type { EffectivePacks } from "../../content-pack/domain/types";
import { buildCompendiumRow } from "../compendium-rows";
import type { ReferenceContextValue } from "../use-reference-context";
import type { LevelUpRequest } from "../play/play-context";
import { cachedUntilRejected } from "../play/play-messages";
import { applyLevelUp, runIds, undoLevelUp, type LevelUpChoices, type LevelUpFollowUp, type LevelUpRowBuilder, type LevelUpUndo } from "./apply";
import { classInfoOf, levelUpPlan, offeredFeatures, type LevelUpPlan } from "./plan";
import { loadClass, loadClasses } from "./load-class";
import { ClassPicker, GainsSection, PrerequisiteSection, UnarmoredSection, type ClassCandidate, type GainsDraft } from "./level-up-multiclass";
import { multiclassRulesOf, prerequisites } from "../../reference/multiclass";
import { sheetClasses, type SheetClass } from "../play/class-model";
import { ABILITIES, type Ability } from "../play/play-model";
import { AsiSection, ColumnsSection, FeaturesSection, HpSection, SlotsSection, SpellsSection, SubclassSection, type AsiDraft, type HpDraft } from "./level-up-parts";

/**
 * The level-up helper (phase 2b §4): 升級 raises the sheet one level with the class's offer, in one
 * data update, and a 復原 in the result notice that stays until closed. Mounted by the D&D adapter
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

type Applied = { level: number; followUp: LevelUpFollowUp };

/** The header select's value: an existing class (`advance:<classId>`, `""` = a starting class without id) or 新增職業. */
type Pick = { kind: "advance"; classId: string } | { kind: "add" };
const ADD = "add";
const pickValue = (pick: Pick) => (pick.kind === "add" ? ADD : `advance:${pick.classId}`);

const SCORE_KEYS: readonly Ability[] = ABILITIES;
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** Built-in (game data, packs merged), Drive-pack and homebrew classes, by id: their `meta` for the prerequisite badge. */
function classSources(system: LoadedSystem, packs: EffectivePacks | null): Map<string, { name: string; meta: Record<string, unknown> | undefined }> {
  const out = new Map<string, { name: string; meta: Record<string, unknown> | undefined }>();
  const builtin = Array.isArray(system.gameData?.classes) ? (system.gameData.classes as unknown[]) : [];
  for (const item of builtin) {
    if (!isRecord(item) || typeof item.id !== "string" || !item.id) continue;
    out.set(item.id, { name: item.id, meta: isRecord(item.meta) ? item.meta : item });
  }
  for (const entry of packs?.content.entries ?? []) {
    if (entry.kind !== "class" || !entry.id || out.has(entry.id)) continue;
    out.set(entry.id, { name: entry.name, meta: isRecord(entry.meta) ? entry.meta : undefined });
  }
  return out;
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
      .map(([id, source]) => ({ id, name: candidateName(id), prerequisites: prerequisites(scores, [...sheetRules, multiclassRulesOf(id, source.meta)]) }))
      .sort((a, b) => a.name.localeCompare(b.name, locale));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourcesById, base, sheet, loadedSheet, locale, nameOf]);

  const continueLevel = () => {
    setBase(request.current());
    setApplied(null);
    setPick({ kind: "advance", classId });
    setAddId(null);
  };
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
  const formKey = `${pickValue(pick)}:${addId ?? ""}:${plan?.character?.to ?? plan?.toLevel ?? 0}`;

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="flex max-h-[92vh] flex-col sm:max-w-lg" data-level-up-dialog>
        <DialogHeader>
          <DialogTitle>{applied ? t("result.title", { level: applied.level }) : t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
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
          <AppliedView applied={applied} request={request} onContinue={continueLevel} onFollowUp={openFollowUp} onClose={onClose} />
        ) : (
          <>
            {pick.kind === "add" && <ClassPicker candidates={candidates} picked={addId} onPick={setAddId} />}
            {plan === undefined ? (
              pick.kind === "add" && !addId ? null : <p className="text-sm text-muted-foreground" role="status">{t("loading")}</p>
            ) : plan === null ? null : (
              <LevelUpForm
                key={formKey}
                plan={plan}
                columnLabels={(pick.kind === "add" ? loadedAdd : loadedSheet?.get(pick.classId))?.columnLabels ?? {}}
                unarmoredName={plan.unarmoredDefense ? candidateName(plan.unarmoredDefense.value) : addName}
                request={request}
                system={system}
                context={context}
                inTable={inTable}
                onApplied={(next) => setApplied(next)}
                onClose={onClose}
              />
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function AppliedView({
  applied,
  request,
  onContinue,
  onFollowUp,
  onClose,
}: {
  applied: Applied;
  request: LevelUpRequest;
  onContinue: () => void;
  onFollowUp: (start: Parameters<NonNullable<LevelUpRequest["openCompendium"]>>[0]) => void;
  onClose: () => void;
}) {
  const t = useTranslations("levelUp");
  const { feats, spells } = applied.followUp;
  const canOpen = request.openCompendium !== null;
  return (
    <DialogFooter className="flex-wrap gap-2 sm:justify-start" data-level-up-result>
      {canOpen && feats && (
        <Button type="button" onClick={() => onFollowUp({ tab: "feats", category: feats })}>
          {feats === "epicBoon" ? t("result.epicBoon") : t("result.feats")}
        </Button>
      )}
      {canOpen && spells && (
        <Button type="button" variant={feats ? "outline" : "default"} onClick={() => onFollowUp({
          tab: "spells",
          classId: spells.list,
          ...(spells.castingClass !== undefined ? { castingClassOf: { [spells.list]: spells.castingClass } } : {}),
        })}>
          {t("result.spells")}
        </Button>
      )}
      {applied.level < 20 && (
        <Button type="button" variant="outline" onClick={onContinue}>
          {t("result.continue", { level: applied.level + 1 })}
        </Button>
      )}
      <Button type="button" variant="ghost" onClick={onClose}>
        {t("close")}
      </Button>
    </DialogFooter>
  );
}

function LevelUpForm({
  plan,
  columnLabels,
  unarmoredName,
  request,
  system,
  context,
  inTable,
  onApplied,
  onClose,
}: {
  plan: LevelUpPlan;
  columnLabels: Readonly<Record<number, string>>;
  /** The localized class name of the offered Unarmored Defense. */
  unarmoredName: string;
  request: LevelUpRequest;
  system: LoadedSystem;
  context: ReferenceContextValue;
  inTable: boolean;
  onApplied: (applied: Applied) => void;
  onClose: () => void;
}) {
  const t = useTranslations("levelUp");
  const tField = useTranslations("field");
  const tMulti = useTranslations("levelUp.multiclass");
  const [hp, setHp] = useState<HpDraft>({ mode: "average" });
  // Extra Attack another class already gives starts unchecked: it never stacks.
  const stacks = plan.extraAttackStacks ?? [];
  const [unchecked, setUnchecked] = useState<ReadonlySet<string>>(() => new Set(stacks));
  const [allowed, setAllowed] = useState(false);
  const [gains, setGains] = useState<GainsDraft>({ off: new Set(), skills: [], tools: [] });
  const [unarmored, setUnarmored] = useState(true);
  const [subclass, setSubclass] = useState<string | null>(null);
  const [asi, setAsi] = useState<AsiDraft>({ kind: "abilities", increases: {} });
  const [slots, setSlots] = useState(plan.slots?.matches ?? false);
  const [error, setError] = useState<string | null>(null);
  // One row per pick for the whole run: a re-run of the apply inside the updater keeps the row ids the undo removes.
  const built = useRef(new Map<string, ReturnType<LevelUpRowBuilder>>());
  const buildRow: LevelUpRowBuilder = (tab, ref, name) => {
    const key = `${tab}|${ref}`;
    if (!built.current.has(key)) built.current.set(key, buildCompendiumRow(tab, ref, name, system, context, !inTable));
    return built.current.get(key) ?? null;
  };

  const features = offeredFeatures(plan, plan.subclass.choose ? subclass : plan.subclass.known?.ref ?? null);
  const rolled = hp.mode === "roll" ? Number(hp.result) : NaN;
  const hpReady = hp.mode === "average" || (Number.isInteger(rolled) && rolled >= 1 && rolled <= plan.hp.faces);
  const asiUsed = asi.kind === "abilities" ? Object.values(asi.increases).reduce((sum, value) => sum + (value ?? 0), 0) : 0;
  const asiReady = !plan.asi || asi.kind !== "abilities" || asiUsed === plan.asi.points;
  const issues = plan.issues ?? [];
  const prerequisitesReady = (plan.prerequisites ?? []).length === 0 || allowed;
  const ready = hpReady && asiReady && prerequisitesReady && issues.length === 0;
  const notes = Object.fromEntries(stacks.map((ref) => [ref, tMulti("extraAttack")]));

  const toggle = (ref: string) =>
    setUnchecked((previous) => {
      const next = new Set(previous);
      if (next.has(ref)) next.delete(ref);
      else next.add(ref);
      return next;
    });

  /** A skipped field's label; a row field (`multiclass.<id>.<field>`) reads like "Wizard's level". */
  const fieldLabel = (data: Record<string, unknown>, field: string) => {
    const label = (key: string) => (tField.has(key) ? tField(key) : key);
    const [list, id, rowField] = field.split(".");
    if (rowField === undefined) return label(field);
    const row = Array.isArray(data[list]) ? (data[list] as Array<Record<string, unknown>>).find((entry) => entry?.id === id) : undefined;
    return tMulti("rowField", { name: text(row?.name) || label(list), field: label(rowField) });
  };

  const undo = (written: LevelUpUndo) =>
    request.update((previous) => {
      const result = undoLevelUp(previous, written);
      queueMicrotask(() => {
        toast.success(t("undone"));
        const keptRows = result.skipped.rows.flatMap(({ list, id }) => {
          const row = Array.isArray(previous[list]) ? (previous[list] as Array<Record<string, unknown>>).find((entry) => entry?.id === id) : undefined;
          if (!row) return [];
          const name = text(row.name) || id;
          return [list === "multiclass" ? tMulti("keptRow", { name }) : name];
        });
        const kept = [...result.skipped.fields.map((field) => fieldLabel(previous, field)), ...keptRows];
        if (kept.length > 0) {
          const items = kept.join("、");
          toast.warning(t("undoKept", { items }));
        }
      });
      return result.data;
    });

  const characterTo = plan.character?.to ?? plan.toLevel;
  const issuesText = tMulti("issues", { items: issues.map((issue) => tMulti(`issue.${issue}`)).join("、") });

  const apply = () => {
    const choices: LevelUpChoices = {
      hp: hp.mode === "roll" ? { mode: "roll", result: rolled } : { mode: "average" },
      unchecked: [...unchecked],
      subclass,
      asi: asi.kind === "abilities" ? { kind: "abilities", increases: asi.increases } : asi.kind === "feat" ? { kind: "feat" } : null,
      slots,
      checked: stacks.filter((ref) => !unchecked.has(ref)),
      ...(plan.gains ? { gains: { off: [...gains.off], skills: gains.skills, tools: gains.tools.filter((name) => name.trim()) } } : {}),
      unarmoredDefense: unarmored,
    };
    const now = request.current();
    const ids = runIds();
    const result = applyLevelUp(now, plan, choices, buildRow, ids);
    if (!result.ok) {
      setError(result.reason === "snapshot" ? t("tooMuchText", { kb: Math.ceil(result.bytes / 1024) }) : result.reason === "issues" ? issuesText : t("stale"));
      return;
    }
    // One data update. The sheet may have moved since `now` (a remote change): apply again on the latest data.
    request.update((previous) => {
      if (previous === now) return result.after;
      const again = applyLevelUp(previous, plan, choices, buildRow, ids);
      return again.ok ? again.after : previous;
    });
    request.recalc(now, result.after);
    toast.success(t("done", { level: characterTo }), {
      duration: Infinity,
      closeButton: true,
      action: { label: t("undo"), onClick: () => undo(result.undo) },
    });
    onApplied({ level: characterTo, followUp: result.followUp });
  };

  return (
    <>
      <div className="-mx-1 min-h-0 flex-1 space-y-3 overflow-y-auto px-1">
        {issues.length > 0 && <p className="text-sm text-destructive" role="alert" data-level-up-issues>{issuesText}</p>}
        {issues.length === 0 && <PrerequisiteSection plan={plan} allowed={allowed} onAllow={setAllowed} />}
        {issues.length === 0 && !plan.classFound && <p className="text-sm text-muted-foreground" role="note" data-level-up-no-class>{t("noClass")}</p>}
        {issues.length === 0 && <HpSection
          plan={plan}
          draft={hp}
          onChange={setHp}
          onRoll={() => setHp({ mode: "roll", result: String(rollDice({ count: 1, sides: plan.hp.faces }).subtotal) })}
        />}
        {issues.length === 0 && plan.classFound && (
          <>
            <SubclassSection plan={plan} picked={subclass} onPick={setSubclass} />
            <FeaturesSection features={features} unchecked={unchecked} onToggle={toggle} notes={notes} />
            <GainsSection plan={plan} draft={gains} onChange={setGains} />
            <UnarmoredSection plan={plan} name={unarmoredName} apply={unarmored} onApply={setUnarmored} />
            <AsiSection plan={plan} draft={asi} onChange={setAsi} />
            {plan.epicBoon && <p className="text-sm" data-level-up-epic-boon>{t("epicBoon")}</p>}
            <SlotsSection plan={plan} apply={slots} onApply={setSlots} />
            {plan.slotsUnknown && <p className="text-sm text-muted-foreground" role="note" data-level-up-slots-unknown>{tMulti("slotsUnknown")}</p>}
            <SpellsSection plan={plan} />
            <ColumnsSection plan={plan} labels={columnLabels} />
          </>
        )}
      </div>
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          {t("cancel")}
        </Button>
        <Button type="button" onClick={apply} disabled={!ready} data-level-up-apply>
          {t("apply")}
        </Button>
      </DialogFooter>
    </>
  );
}
