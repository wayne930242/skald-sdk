"use client";

import { Suspense, useId, useState } from "react";
import { useTranslations } from "next-intl";
import { ASPECT_ACTION } from "../play/card-styles";
import type { FateAspectActionProps } from "../play/slots";
import { FateInvokeDialog } from "./invoke-dialog";
import { FateTableInvokeDialog } from "../table/table-invoke-dialog";
import { FateRollMessages } from "./roll-messages";
import { useFateRolls } from "./use-fate-rolls";

function Invoke({ aspect, name }: FateAspectActionProps) {
  const t = useTranslations("fatePlay.aspects");
  const rolls = useFateRolls();
  const [open, setOpen] = useState(false);
  const hint = useId();
  // Nothing to invoke on yet, or the result is settled: the button stays focusable and says why.
  const blocked = !rolls.tray ? "noRoll" : rolls.tray.settled ? "settled" : null;
  const reason = blocked ? t(`invokeBlocked.${blocked}`) : null;
  return (
    <>
      <button
        type="button"
        className={ASPECT_ACTION}
        disabled={!rolls.editable}
        aria-disabled={reason || rolls.busy ? true : undefined}
        aria-describedby={reason ? hint : undefined}
        aria-label={t("invokeNamed", { name })}
        title={reason ?? undefined}
        onClick={() => {
          if (!reason && !rolls.busy && rolls.editable) setOpen(true);
        }}
        data-fate-invoke={aspect.id}
      >
        {t("invoke")}
      </button>
      {reason && <span id={hint} className="sr-only">{reason}</span>}
      {open && (rolls.tray?.root.kind === "table"
        ? <FateTableInvokeDialog rolls={rolls} effect="plus2" preselectAspectId={aspect.id} onClose={() => setOpen(false)} />
        : <FateInvokeDialog rolls={rolls} effect="plus2" preselect={aspect.id} onClose={() => setOpen(false)} />)}
    </>
  );
}

function Inert({ name }: FateAspectActionProps) {
  const t = useTranslations("fatePlay.aspects");
  return <button type="button" className={ASPECT_ACTION} disabled aria-label={t("invokeNamed", { name })}>{t("invoke")}</button>;
}

/**
 * An aspect card's 援引 (slot `AspectInvoke`, frame 03): opens the invoke picker for the latest
 * roll with this aspect already chosen (its free invoke first, else a fate point). Before a roll it
 * explains that a roll comes first; on a read-only sheet it is disabled.
 */
export function FateAspectInvoke(props: FateAspectActionProps) {
  return (
    <Suspense fallback={<Inert {...props} />}>
      <FateRollMessages>
        <Invoke {...props} />
      </FateRollMessages>
    </Suspense>
  );
}
