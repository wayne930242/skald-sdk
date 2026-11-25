"use client";

import { useTranslations } from "next-intl";
import { Undo2 } from "lucide-react";
import { Button } from "@skald/sheet-sdk/components/ui/button";
import type { LevelUpRequest } from "../play/play-context";
import type { Applied } from "./level-up-form";
import { useLatestLevelUp, useLevelUpNotice } from "./level-up-notice";

type CompendiumStart = Parameters<NonNullable<LevelUpRequest["openCompendium"]>>[0];

/**
 * The result screen (UAT m8): what the run changed, 復原上次升級 while it is still the latest level
 * up (M2), then the follow-ups (feats, spells), 繼續升級 and 關閉.
 */
export function AppliedView({
  applied,
  request,
  onContinue,
  onUndone,
  onFollowUp,
  onClose,
}: {
  applied: Applied;
  request: LevelUpRequest;
  onContinue: () => void;
  /** The run was undone from here: the data after the undo. */
  onUndone: (data: Record<string, unknown>) => void;
  onFollowUp: (start: CompendiumStart) => void;
  onClose: () => void;
}) {
  const t = useTranslations("levelUp");
  const notice = useLevelUpNotice(request);
  const latest = useLatestLevelUp();
  const { feats, spells } = applied.followUp;
  const canOpen = request.openCompendium !== null;
  const canUndo = latest === applied.token;
  return (
    <>
      <div className="-mx-1 min-h-0 flex-1 space-y-3 overflow-y-auto px-1" data-level-up-body>
        {applied.summary.length > 0 && (
          <section className="space-y-1 rounded-lg border border-border p-3" aria-label={t("result.changes")} data-level-up-summary>
            <h3 className="text-sm font-semibold">{t("result.changes")}</h3>
            <ul className="list-disc space-y-0.5 pl-5 text-sm tabular-nums">
              {applied.summary.map((line) => <li key={line}>{line}</li>)}
            </ul>
          </section>
        )}
        {canUndo ? (
          <Button type="button" variant="outline" size="sm" onClick={() => notice.undo(applied.token, onUndone)} data-level-up-undo>
            <Undo2 className="size-4" aria-hidden />
            {t("result.undo")}
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground" data-level-up-undo-gone>{t("result.undoGone")}</p>
        )}
      </div>
      <div className="flex shrink-0 flex-wrap gap-2 border-t border-border pt-3" data-level-up-result>
        {canOpen && feats && (
          <Button type="button" onClick={() => onFollowUp({ tab: "feats", category: feats })}>
            {feats === "epicBoon" ? t("result.epicBoon") : feats === "fightingStyle" ? t("result.fightingStyle") : t("result.feats")}
          </Button>
        )}
        {canOpen && spells && (
          <Button
            type="button"
            variant={feats ? "outline" : "default"}
            onClick={() =>
              onFollowUp({
                tab: "spells",
                classId: spells.list,
                ...(spells.castingClass !== undefined ? { castingClassOf: { [spells.list]: spells.castingClass } } : {}),
              })
            }
          >
            {t("result.spells")}
          </Button>
        )}
        {applied.level < 20 && (
          <Button type="button" variant="outline" onClick={onContinue}>
            {t("result.continue", { level: applied.level + 1 })}
          </Button>
        )}
        <Button type="button" variant="ghost" className="ml-auto" onClick={onClose}>
          {t("close")}
        </Button>
      </div>
    </>
  );
}
