"use client";

import { Fragment, type ReactNode } from "react";
import type { PrintPaper } from "@skald/sheet-sdk/modules/systems/ui/system-print";
import { signed } from "../sheet/play/play-model";
import { PrintPage } from "@skald/sheet-sdk/modules/character/ui/print/kit/print-page";
import type { PrintLabels } from "./print-labels";
import { IDENTITY_FIELDS, speciesValue, type IdentityField } from "./content";

const NAME = IDENTITY_FIELDS.indexOf("name");
import type { IdentityFit } from "./paginate";
import { ARMOR_TRAINING, SHEET_ABILITY_COLUMNS, type DndPrintModel } from "./print-model";
import { Box, Check, Diamond, Frame, GoTo } from "./regions";

/** What each frame of a page holds: the placed content, or every candidate while measuring. */
export type FrameContents = Partial<Record<string, ReactNode>>;

export const PAGE1_FRAMES = ["status", "training", "attacks", "features:0", "features:1", "speciesTraits", "feats"] as const;

/**
 * A page of the D&D print: the kit's fixed page (the printable area, its footer band kept for the
 * skald.tw footer), whose body the page's boxes are laid out in.
 */
export function Page({ paper, page, children, kind }: { paper: PrintPaper; page: number; children: ReactNode; kind: string }) {
  return (
    <PrintPage paper={paper} page={page} className={`dnd-print-page dnd-print-page-${kind}`} bodyClassName="dnd-print-page-body">
      {children}
    </PrintPage>
  );
}


/**
 * Page 1's identity lines and how each prints: `fits` from the pager, or null in the measuring
 * layer, whose lines hold a probe per size step and one wrapped at the line's width.
 */
export interface IdentityView {
  fields: IdentityField[];
  fits: IdentityFit[] | null;
}

/** The font size steps of a line before it wraps: the name's 13pt, 10pt, 7pt; a field's 8.5pt, 7pt. */
const STEPS = { name: 3, field: 2 } as const;

function IdentityValue({ field, fit, kind, labels }: {
  field: IdentityField;
  fit: IdentityFit | null;
  kind: "name" | "field";
  labels: PrintLabels;
}) {
  const valueClass = kind === "name" ? "dnd-print-name-value" : "dnd-print-value";
  return (
    <>
      <span className={valueClass}>
        {field.value}
        {fit === null && (
          <>
            {Array.from({ length: STEPS[kind] }, (_, step) => (
              <span key={step} className="dnd-print-ident-probe" data-size={step} data-m={`size:${step}`}>{field.value}</span>
            ))}
            <span className="dnd-print-ident-probe dnd-print-ident-wrap" data-m="wrap">{field.value}</span>
            <span className="dnd-print-ident-probe dnd-print-ident-wrap" data-m="wrap-line">M</span>
          </>
        )}
      </span>
      {fit === "cont" && <GoTo compact title={labels.print("continued", { title: labels.print("regions.identity") })} labels={labels} />}
    </>
  );
}

function Field({ index, identity, labels }: { index: number; identity: IdentityView; labels: PrintLabels }) {
  const field = identity.fields[index];
  const fit = identity.fits?.[index] ?? null;
  return (
    <div className="dnd-print-field" data-identity-field={field.id} data-fit={fit ?? undefined} data-m={identity.fits ? undefined : `ident:${index}`}>
      <span className="dnd-print-label">{field.label}</span>
      <IdentityValue field={field} fit={fit} kind="field" labels={labels} />
    </div>
  );
}

const PROF_MARK = { none: "○", proficient: "●", expertise: "◆" } as const;

function AbilityBox({ ability, labels }: { ability: DndPrintModel["abilities"][number]; labels: PrintLabels }) {
  const { print, sheet } = labels;
  return (
    <Box region={`ability-${ability.id}`} className="dnd-print-ability">
      <div className="dnd-print-ability-head">
        <h3>{sheet(`ability.${ability.id}`)}</h3>
        <div className="dnd-print-mod">{signed(ability.mod)}</div>
        <div className="dnd-print-score-wrap">
          <span className="dnd-print-label">{print("ability.score")}</span>
          <span className="dnd-print-score">{ability.score}</span>
        </div>
      </div>
      <ul>
        <li className="dnd-print-save">
          <span className="dnd-print-mark">{ability.saveProf ? "●" : "○"}</span>
          <span className="dnd-print-n">{signed(ability.save)}</span>
          <span>{print("ability.save")}</span>
        </li>
        {ability.skills.map((skill) => (
          <li key={skill.id} data-skill={skill.id}>
            <span className="dnd-print-mark">{PROF_MARK[skill.prof]}</span>
            <span className="dnd-print-n">{signed(skill.value)}</span>
            <span>{sheet(`skill.${skill.id}`)}</span>
          </li>
        ))}
      </ul>
    </Box>
  );
}

function acNote(model: DndPrintModel, labels: PrintLabels): string {
  return model.combat.acNote
    .map((note) => (note.id === "unarmoredDefense"
      ? labels.sheet("field.unarmoredDefense")
      : labels.print("combat.acBonus", { value: signed(note.value) })))
    .join(labels.print("separator"));
}


/**
 * Page 1, the official sheet's front: identity, level, armor class, hit points, hit dice and death
 * saves along the top; the six abilities with their saves and skills, Heroic Inspiration, the
 * conditions and bonuses, and equipment training down the left; initiative, speed, size and
 * passive perception, weapons and damage cantrips, class features, species traits and feats on
 * the right.
 */
export function Page1({ model, labels, paper, frames, identity: identityView }: {
  model: DndPrintModel;
  labels: PrintLabels;
  paper: PrintPaper;
  frames: FrameContents;
  identity: IdentityView;
}) {
  const { print, sheet } = labels;
  const byId = Object.fromEntries(model.abilities.map((ability) => [ability.id, ability]));
  const identity = model.identity;
  const note = acNote(model, labels);
  return (
    <Page paper={paper} page={1} kind="p1">
      <div className="dnd-print-p1-top">
        <Box region="identity" className="dnd-print-ident">
          <div
            className="dnd-print-name"
            data-identity-field="name"
            data-fit={identityView.fits?.[NAME] ?? undefined}
            data-m={identityView.fits ? undefined : `ident:${NAME}`}
          >
            <IdentityValue field={identityView.fields[NAME]} fit={identityView.fits?.[NAME] ?? null} kind="name" labels={labels} />
            <span className="dnd-print-label">{identityView.fields[NAME].label}</span>
          </div>
          {IDENTITY_FIELDS.slice(1).map((id) => <Field key={id} index={IDENTITY_FIELDS.indexOf(id)} identity={identityView} labels={labels} />)}
          <div className="dnd-print-field" />
        </Box>
        <Box region="level" className="dnd-print-badge">
          <span className="dnd-print-label">{print("identity.level")}</span>
          <span className="dnd-print-big">{identity.level}</span>
          <span className="dnd-print-sep" />
          <span className="dnd-print-label">{print("identity.xp")}</span>
          <span className="dnd-print-value">{identity.xp > 0 ? identity.xp : ""}</span>
        </Box>
        <Box region="ac" className="dnd-print-ac">
          <span className="dnd-print-label">{print("combat.ac")}</span>
          <span className="dnd-print-big">{model.combat.ac}</span>
          {note && <span className="dnd-print-note">{note}</span>}
          <span className="dnd-print-shield">
            <span className="dnd-print-label">{print("combat.shield")}</span>
            <Diamond on={model.combat.shield} />
          </span>
        </Box>
        <Box region="hp" className="dnd-print-hp">
          <h3>{print("hp.title")}</h3>
          <div className="dnd-print-hp-cur">
            <span className="dnd-print-big">{model.hp.current ?? ""}</span>
            <span className="dnd-print-label">{print("hp.current")}</span>
          </div>
          <div className="dnd-print-hp-side">
            <div>
              <span className="dnd-print-label">{print("hp.temp")}</span>
              <span className="dnd-print-value">{model.hp.temp ?? ""}</span>
            </div>
            <div>
              <span className="dnd-print-label">{print("hp.max")}</span>
              <span className="dnd-print-value">{model.hp.max}</span>
            </div>
          </div>
        </Box>
        <Box region="hitDice" className="dnd-print-hd">
          <h3>{print("hitDice.title")}</h3>
          {model.hitDicePools.length > 1 ? (
            // Several die sizes (UAT m17, M13): one line per die, the labels above the values.
            <div className="dnd-print-hd-lines" data-print-hit-dice-lines>
              <span />
              <span className="dnd-print-label">{print("hitDice.spent")}</span>
              <span className="dnd-print-label">{print("hitDice.max")}</span>
              {model.hitDicePools.map((pool) => (
                <Fragment key={pool.faces}>
                  <span className="dnd-print-hd-die" data-print-hit-die={pool.faces}>{`d${pool.faces}`}</span>
                  <span className="dnd-print-value">{pool.spent ?? ""}</span>
                  <span className="dnd-print-value">{pool.max}</span>
                </Fragment>
              ))}
            </div>
          ) : (
            <>
              <div>
                <span className="dnd-print-label">{print("hitDice.spent")}</span>
                <span className="dnd-print-value">{model.hitDice.spent ?? ""}</span>
              </div>
              <div>
                <span className="dnd-print-label">{print("hitDice.max")}</span>
                <span className="dnd-print-value">
                  {model.hitDicePools.map((pool) => print("hitDice.dice", { max: pool.max, faces: pool.faces })).join(" + ")}
                </span>
              </div>
            </>
          )}
        </Box>
        <Box region="death" className="dnd-print-ds">
          <h3>{print("death.title")}</h3>
          <div>
            <span className="dnd-print-label">{print("death.successes")}</span>
            <span>{[0, 1, 2].map((index) => <Diamond key={index} on={index < model.death.successes} />)}</span>
          </div>
          <div>
            <span className="dnd-print-label">{print("death.failures")}</span>
            <span>{[0, 1, 2].map((index) => <Diamond key={index} on={index < model.death.failures} />)}</span>
          </div>
        </Box>
      </div>

      <div className="dnd-print-p1-body">
        <div className="dnd-print-p1-left">
          <div className="dnd-print-col-a">
            <Box region="prof" className="dnd-print-pb">
              <span className="dnd-print-label">{print("combat.prof")}</span>
              <span className="dnd-print-big">{signed(model.combat.prof)}</span>
            </Box>
            {SHEET_ABILITY_COLUMNS[0].map((id) => <AbilityBox key={id} ability={byId[id]} labels={labels} />)}
            <Box region="inspiration" className="dnd-print-insp">
              <span className="dnd-print-label">{print("combat.inspiration")}</span>
              <Check on={model.combat.inspiration} />
            </Box>
            <Box region="status" className="dnd-print-status" title={print("status.title")}>
              {model.blanks ? (
                <Frame id="status" className="dnd-print-status-blanks">
                  <div className="dnd-print-conditions">
                    {model.conditions.map((condition) => (
                      <span key={condition.id}>
                        <Check on={condition.active} />
                        {sheet(`ref.condition.${condition.id}`)}
                      </span>
                    ))}
                  </div>
                  <div className="dnd-print-line">
                    <span className="dnd-print-label">{print("status.exhaustionLabel")}</span>
                    {Array.from({ length: 6 }, (_, index) => <Diamond key={index} />)}
                  </div>
                  <div className="dnd-print-line">
                    <span className="dnd-print-label">{print("status.concentrationLabel")}</span>
                  </div>
                  {frames.status}
                </Frame>
              ) : (
                <Frame id="status" className="dnd-print-fill">{frames.status}</Frame>
              )}
            </Box>
          </div>
          <div className="dnd-print-col-b">
            {SHEET_ABILITY_COLUMNS[1].map((id) => <AbilityBox key={id} ability={byId[id]} labels={labels} />)}
          </div>
          <Box region="training" className="dnd-print-training" title={print("training.title")}>
            <div className="dnd-print-armor">
              <span className="dnd-print-label">{print("training.armor")}</span>
              {ARMOR_TRAINING.map((id) => (
                <span key={id}>
                  <Diamond on={model.training.armor[id]} />
                  {sheet(`field.${id}`)}
                </span>
              ))}
            </div>
            <Frame id="training" className="dnd-print-lines">{frames.training}</Frame>
          </Box>
        </div>

        <div className="dnd-print-p1-right">
          <div className="dnd-print-chips">
            <Box region="initiative" className="dnd-print-chip">
              <h3>{print("combat.initiative")}</h3>
              <span className="dnd-print-big">{signed(model.combat.initiative)}</span>
            </Box>
            <Box region="speed" className="dnd-print-chip">
              <h3>{print("combat.speed")}</h3>
              <span className="dnd-print-big">{print("feet", { value: model.combat.speed })}</span>
              {model.combat.speed !== model.combat.baseSpeed && <span className="dnd-print-note">{print("combat.speedReduced", { base: model.combat.baseSpeed })}</span>}
            </Box>
            <Box region="size" className="dnd-print-chip">
              <h3>{print("combat.size")}</h3>
              <span className="dnd-print-big">{model.size ? sheet(`option.size.${model.size}`) || model.size : ""}</span>
            </Box>
            <Box region="passive" className="dnd-print-chip">
              <h3>{print("combat.passive")}</h3>
              <span className="dnd-print-big">{model.combat.passive}</span>
              {model.combat.darkvision > 0 && <span className="dnd-print-note">{print("combat.darkvision", { value: model.combat.darkvision })}</span>}
            </Box>
          </div>
          <Box region="attacks" className="dnd-print-weapons" title={print("attacks.title")}>
            <Frame id="attacks" className="dnd-print-table-frame">{frames.attacks}</Frame>
          </Box>
          <Box
            region="features"
            className="dnd-print-features"
            title={print("regions.features")}
            note={[identity.className, identity.subclass].filter(Boolean).join(print("separator"))}
          >
            <div className="dnd-print-frames dnd-print-frames-two">
              <Frame id="features:0">{frames["features:0"]}</Frame>
              <Frame id="features:1">{frames["features:1"]}</Frame>
            </div>
          </Box>
          <div className="dnd-print-bottom-row">
            <Box region="speciesTraits" className="dnd-print-traits" title={print("regions.speciesTraits")} note={speciesValue(model, labels)}>
              <div className="dnd-print-frames">
                <Frame id="speciesTraits">{frames.speciesTraits}</Frame>
              </div>
            </Box>
            <Box region="feats" className="dnd-print-feats" title={print("regions.feats")}>
              <div className="dnd-print-frames">
                <Frame id="feats">{frames.feats}</Frame>
              </div>
            </Box>
          </div>
        </div>
      </div>
    </Page>
  );
}
