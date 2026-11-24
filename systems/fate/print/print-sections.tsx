import { SectionBanner, Track } from "@skald/sheet-sdk/modules/character/ui/print/kit/parts";
import { useTranslations } from "next-intl";
import type { FatePresetLabels } from "../domain/presets";
import type { FatePrintModel } from "./print-model";

interface SectionProps {
  model: FatePrintModel;
  labels: FatePresetLabels;
}

function Box({ mark = false, number, optional = false }: { mark?: boolean; number?: number; optional?: boolean }) {
  return <span className="fate-print-box" data-marked={mark} data-optional={optional}>{mark ? "×" : number}</span>;
}

export function FatePrintIdentity({ model, portrait }: SectionProps & { portrait: React.ReactNode }) {
  const t = useTranslations("fatePrint");
  const { name, player, description } = model.identity;
  const refresh = model.printRefresh;
  return <header className="fate-print-header">
    <div className="fate-print-identity">
      <p className="fate-print-system">{t("title")}</p>
      <b>{t("name")}</b>
      {name ? <h1>{name}</h1> : <span className="fate-print-name-line" />}
      <div className="fate-print-bio">
        <div><b>{t("player")}</b><p>{player}</p></div>
        <div><b>{t("description")}</b><p className="fate-print-description">{description}</p></div>
      </div>
    </div>
    {portrait}
    <div className="fate-print-meter">
      <div className="fate-print-points">
        <b>{t("fatePoints")}</b>
        {refresh !== null && refresh <= 6 && <Track className="fate-print-circles" shape="pip" size="3.8mm" length={refresh} />}
      </div>
      <div><b>{t("refresh")}</b><span className="fate-print-refresh">{refresh}</span></div>
    </div>
  </header>;
}

export function FatePrintAspects({ model }: SectionProps) {
  const t = useTranslations("fatePrint");
  return <section>
    <SectionBanner tone="solid" className="fate-print-banner">{t("aspects")}</SectionBanner>
    <dl>
      {model.aspects.map((aspect, index) => {
        const kind = t(`aspect.${aspect.kind}`);
        return <div className="fate-print-aspect" key={index} data-fate-print-aspect={aspect.kind}>
          <dt>
            {aspect.label ? t("aspectLabel", { kind, label: aspect.label }) : kind}
            {aspect.invokeBoxes > 0 && <small className="fate-print-invokes">
              {aspect.freeInvokes ? t("freeInvokes", { count: aspect.freeInvokes }) : t("invokeLabel")}
              <Track length={aspect.invokeBoxes} size="3mm" />
            </small>}
          </dt>
          <dd className="fate-print-prose fate-print-line" data-long={aspect.text.length > 40} data-secret={aspect.hidden}>
            {aspect.hidden ? t("secret") : aspect.text}
          </dd>
        </div>;
      })}
    </dl>
  </section>;
}

export function FatePrintSkills({ model, labels }: SectionProps) {
  const t = useTranslations("fatePrint");
  const skillName = useTranslations("skill");
  return <section className="fate-print-ladder">
    <SectionBanner tone="solid" className="fate-print-banner">{t("skills")} <small>{labels.allocations[model.allocation] ?? model.allocation}</small></SectionBanner>
    <dl>
      {model.rungs.map(({ rating, skills, blanks }) => {
        const rank = rating < 0 ? `−${Math.abs(rating)}` : `+${rating}`;
        const key = `ladder.${rating}`;
        return <div className="fate-print-rung" key={rating} data-fate-print-rung={rating}>
          <dt><strong>{rank}</strong>{t.has(key) && <span>{t(key)}</span>}</dt>
          <dd><ul className="fate-print-skills">
            {skills.map(skill => <li key={skill.id}>{skill.customName ?? (skillName.has(skill.id) ? skillName(skill.id) : labels.skills[skill.id] ?? skill.stockName ?? skill.id)}</li>)}
            {Array.from({ length: blanks }, (_, i) => <li className="fate-print-line" key={i} />)}
          </ul></dd>
        </div>;
      })}
    </dl>
  </section>;
}

function InjuryRow({ box, name, text }: { box?: React.ReactNode; name: string; text?: string }) {
  return <>
    {box}
    <div className="fate-print-injury-write"><dt>{name}</dt><dd className="fate-print-line fate-print-prose">{text}</dd></div>
  </>;
}

export function FatePrintHarm({ model, labels }: SectionProps) {
  const t = useTranslations("fatePrint");
  return <>
    <section>
      <SectionBanner tone="solid" className="fate-print-banner">{t("stress")}</SectionBanner>
      <dl className="fate-print-stress">
        {model.stress.map(track => {
          const boxes = <div className="fate-print-boxes">
            {track.marks.map((mark, i) => <Box key={i} mark={mark} number={i + 1} />)}
            {Array.from({ length: track.optionalBoxes }, (_, i) => <Box key={i + track.marks.length} optional number={i + track.marks.length + 1} />)}
          </div>;
          return model.stress.length > 1
            ? <div className="fate-print-track" key={track.id} data-fate-print-stress={track.id}>
              <dt>{labels.tracks[track.id] ?? track.id}</dt><dd>{boxes}</dd>
            </div>
            : <div className="fate-print-track" key={track.id} data-fate-print-stress={track.id}>{boxes}</div>;
        })}
      </dl>
    </section>
    <section className="fate-print-injuries">
      <SectionBanner tone="solid" className="fate-print-banner">{t(model.injuryKind)}</SectionBanner>
      <dl>
        {model.consequences.map(slot => <div className="fate-print-injury" key={slot.id} data-fate-print-consequence={slot.id} data-optional={slot.optional}>
          <InjuryRow box={<Box number={slot.value} optional={slot.optional} />} name={labels.slots[slot.id] ?? slot.id}
            text={slot.occupied ? slot.text : slot.blocked ? t(`blocked.${slot.blocked}`) : undefined} />
        </div>)}
        {model.legacyExtraMild && <div className="fate-print-injury" data-legacy>
          <InjuryRow box={<Box number={2} />} name={t("legacyExtraMild")} text={model.legacyExtraMild} />
        </div>}
        {model.conditions.map(condition => <div key={condition.id} data-fate-print-condition={condition.id}>
          {condition.boxes.map(box => {
            const name = labels.conditions[condition.id] ?? condition.id;
            const track = box.track ? labels.tracks[box.track] : undefined;
            return <div className="fate-print-injury" key={box.index}>
              <InjuryRow box={<Box mark={box.marked} number={condition.boxes.length > 1 ? box.index : undefined} />}
                name={track ? t("aspectLabel", { kind: name, label: track }) : name} text={box.text} />
            </div>;
          })}
        </div>)}
      </dl>
    </section>
  </>;
}

export function FatePrintStunts({ model, from, to, continuation }: {
  model: FatePrintModel; from: number; to: number; continuation?: boolean;
}) {
  const t = useTranslations("fatePrint");
  const r = model.resources;
  const pencil = model.stunts.length === 0 && !continuation;
  // The meter and the ledger share the same blank-sheet decision.
  const blankLedger = model.printRefresh === null;
  const gap = () => <span className="fate-print-ledger-gap" aria-hidden />;
  return <section className="fate-print-stunts" data-pencil={pencil}>
    <SectionBanner tone="solid" className="fate-print-banner">{t("stunts")}</SectionBanner>
    {!continuation && <div className="fate-print-accounting">
      <p>{blankLedger ? t.rich("blankStuntBudget", { gap }) : t("stuntBudget", { count: r.stuntCount, free: r.freeStunts, cost: r.stuntCost })}</p>
      <p>{blankLedger ? t.rich("blankRefreshBudget", { gap }) : t("refreshBudget", { base: r.baseRefresh, earned: r.earnedRefresh })}</p>
      {!blankLedger && r.refreshOverride !== undefined && <p>{t("refreshOverride", { override: r.refreshOverride })}</p>}
    </div>}
    {pencil && <div className="fate-print-stunt-lines" aria-hidden><div /><div /><div /></div>}
    {model.stunts.slice(from, to).map((stunt, i) => <div className="fate-print-stunt" key={from + i} data-fate-print-piece={from + i}>
      <div className="fate-print-stunt-heading">
        {stunt.title && <h3>{stunt.title}</h3>}
        {stunt.oncePerSession && <small>{t("oncePerSession")}</small>}
      </div>
      <p className="fate-print-prose">{stunt.text}</p>
    </div>)}
  </section>;
}

export function FatePrintNote({ field, text }: { field: "extras" | "notes"; text: string }) {
  const t = useTranslations("fatePrint");
  return <section className="fate-print-note">
    <h2>{t(field)}</h2><p className="fate-print-prose">{text}</p>
  </section>;
}
