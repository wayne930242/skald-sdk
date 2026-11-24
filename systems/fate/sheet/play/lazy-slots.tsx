"use client";

import { Component, lazy, Suspense, useState, type ComponentType, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@skald/sheet-sdk/lib/utils";
import { ASPECT_ACTION, MUTED, SKILL_CHIP, TEXT_BUTTON } from "./card-styles";
import type { FateAspectActionProps, FatePlaySlots, FateSkillTriggerProps } from "./slots";

class SlotBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function SlotError({ onRetry }: { onRetry: () => void }) {
  const t = useTranslations();
  return (
    <div role="alert" className={cn(MUTED, "flex flex-wrap items-center gap-2")}>
      {t("common.error")}
      <button type="button" className={TEXT_BUTTON} onClick={onRetry}>{t("errorPages.error.retry")}</button>
    </div>
  );
}

/**
 * A slot fetched with its own chunk on first render, so the shell chunk carries none of it. A
 * failed chunk load shows a retry (React keeps a rejected `lazy` for good, so a retry makes a new
 * one); `pending` and `failed` let a slot keep a working look meanwhile (a skill chip as text).
 */
export function lazySlot<P extends object>(
  load: () => Promise<ComponentType<P>>,
  render: { pending?: (props: P) => ReactNode; failed?: (props: P, retry: () => void) => ReactNode } = {},
): ComponentType<P> {
  const make = () => lazy(() => load().then((component) => ({ default: component })));
  const current = { generation: 0, Loaded: make() };
  /** A retry after a failure: one new `lazy` per failed generation, shared by every instance. */
  const renew = (seen: number) => {
    if (seen === current.generation) {
      current.generation += 1;
      current.Loaded = make();
    }
    return current.generation;
  };
  function Slot(props: P) {
    const [attempt, setAttempt] = useState(current.generation);
    const retry = () => setAttempt(renew(attempt));
    const Loaded = current.Loaded;
    const fallback = render.failed ? render.failed(props, retry) : <SlotError onRetry={retry} />;
    return (
      <SlotBoundary key={attempt} fallback={fallback}>
        <Suspense fallback={render.pending?.(props) ?? null}>
          <Loaded {...props} />
        </Suspense>
      </SlotBoundary>
    );
  }
  return Slot;
}

/** The chip as plain text while the roll trigger loads or when it cannot. */
function PlainSkill({ skill, children }: FateSkillTriggerProps) {
  return <span className={cn(SKILL_CHIP, skill.rating >= 4 && "border-accent/60 bg-accent/15 font-semibold")}>{children}</span>;
}

/** An aspect card's action while its chunk loads or when it cannot: the same button, inert. */
function InertInvoke({ name }: FateAspectActionProps) {
  const t = useTranslations("fatePlay.aspects");
  return <button type="button" className={ASPECT_ACTION} disabled aria-label={t("invokeNamed", { name })}>{t("invoke")}</button>;
}

function InertCompel() {
  const t = useTranslations("fatePlay.aspects");
  return <button type="button" className={cn(ASPECT_ACTION, "text-accent")} disabled>{t("compel")}</button>;
}

/**
 * The assembled B sheet (F9): every feature surface of F6–F8 behind its own dynamic import. The
 * rolls index serves every roll slot, so the tray, the triggers and the cards' invoke share one
 * chunk; the session index serves the fate point actions and the trouble card's compel.
 */
export const FATE_LAZY_PLAY_SLOTS: FatePlaySlots = {
  rollTray: lazySlot(() => import("../rolls").then((module) => module.rollTray)),
  SkillTrigger: lazySlot<FateSkillTriggerProps>(() => import("../rolls").then((module) => module.SkillTrigger), {
    pending: PlainSkill,
    failed: PlainSkill,
  }),
  AspectInvoke: lazySlot<FateAspectActionProps>(() => import("../rolls").then((module) => module.AspectInvoke), {
    pending: InertInvoke,
    failed: InertInvoke,
  }),
  AspectCompel: lazySlot<FateAspectActionProps>(() => import("../session").then((module) => module.AspectCompel), {
    pending: InertCompel,
    failed: InertCompel,
  }),
  session: lazySlot(() => import("../session").then((module) => module.FateSessionPanel)),
  stunts: lazySlot(() => import("../stunts").then((module) => module.FateStunts)),
  vitals: lazySlot(() => import("../harm/vitals-pane").then((module) => module.FateVitalsPane)),
  presets: lazySlot(() => import("../presets/presets-entry").then((module) => module.FatePresetsEntry)),
};
