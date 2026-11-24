"use client";

import type { PrintPaper } from "@skald/sheet-sdk/modules/systems/ui/system-print";
import { signed } from "../sheet/play/play-model";
import { Page, type FrameContents } from "./page-1";
import type { PrintLabels } from "./print-labels";
import type { DndPrintModel } from "./print-model";
import { Box, Diamond, Frame } from "./regions";

export const PAGE2_FRAMES = ["spells", "p2:0", "p2:1", "appearance", "backstory", "languages", "equipment"] as const;

/** Whether page 2's left half is the spellcasting area (a caster, or 保留手寫空白) or 續頁 (a non-caster). */
export function hasSpellArea(model: DndPrintModel): boolean {
  return model.spellcasting !== null;
}

function Slots({ model, labels }: { model: DndPrintModel; labels: PrintLabels }) {
  const { print } = labels;
  const known = model.caster;
  // read down the columns as the official sheet does: 1 2 3 | 4 5 6 | 7 8 9
  const order = [0, 3, 6, 1, 4, 7, 2, 5, 8].map((index) => model.slots[index]);
  const pact = model.spellcasting?.pact;
  return (
    <Box region="slots" className="dnd-print-slots" title={print("spells.slots")} note={print("spells.slotsLegend")}>
      <div className="dnd-print-slot-grid">
        {order.map((slot) => (
          <div key={slot.level} className="dnd-print-slot" data-off={known && slot.total === 0 ? "true" : undefined}>
            <span>{print("spells.slotLevel", { level: slot.level })}</span>
            <span className="dnd-print-slot-total">{known ? slot.total || "—" : ""}</span>
            <span className="dnd-print-pips">
              {Array.from({ length: known ? slot.total : 4 }, (_, index) => <Diamond key={index} on={index < slot.used} />)}
            </span>
          </div>
        ))}
      </div>
      {pact && (
        <div className="dnd-print-pact">
          {print("spells.pact", { level: pact.level, total: pact.total })}
          {Array.from({ length: pact.total }, (_, index) => <Diamond key={index} on={index < pact.used} />)}
        </div>
      )}
    </Box>
  );
}

/**
 * Page 2, the official sheet's back: spellcasting, slots and the cantrips and spells on the left
 * (for a non-caster's compact print, what page 1 continues and lines for notes); appearance,
 * backstory and alignment, languages, equipment with attunement, and coins on the right.
 */
export function Page2({ model, labels, paper, frames, portrait, attribution, carry }: {
  model: DndPrintModel;
  labels: PrintLabels;
  paper: PrintPaper;
  frames: FrameContents;
  portrait: string | null;
  attribution: string;
  carry: string;
}) {
  const { print, sheet } = labels;
  const casting = model.spellcasting;
  return (
    <Page
      paper={paper}
      page={2}
      kind="p2"
      footer={<span className="dnd-print-attribution">{attribution}</span>}
    >
      <div className="dnd-print-p2-body">
        <div className="dnd-print-p2-left">
          {casting ? (
            <>
              <div className="dnd-print-p2-cast">
                <Box region="casting" className="dnd-print-cast">
                  <div className="dnd-print-cast-ability">
                    <span className="dnd-print-label">{print("spells.ability")}</span>
                    <span className="dnd-print-value">{casting.ability ? sheet(`option.spellAbility.${casting.ability}`) : ""}</span>
                  </div>
                  <div>
                    <span className="dnd-print-label">{print("spells.mod")}</span>
                    <span className="dnd-print-value">{casting.mod === null ? "" : signed(casting.mod)}</span>
                  </div>
                  <div>
                    <span className="dnd-print-label">{print("spells.dc")}</span>
                    <span className="dnd-print-value">{casting.dc ?? ""}</span>
                  </div>
                  <div>
                    <span className="dnd-print-label">{print("spells.attack")}</span>
                    <span className="dnd-print-value">{casting.attack === null ? "" : signed(casting.attack)}</span>
                  </div>
                </Box>
                <Slots model={model} labels={labels} />
              </div>
              <Box region="spells" className="dnd-print-spelltable" title={print("spells.title")} note={print("spells.legend")}>
                <Frame id="spells" className="dnd-print-table-frame">{frames.spells}</Frame>
              </Box>
            </>
          ) : (
            <Box region="noncaster" className="dnd-print-noncaster" title={print("regions.noncaster")}>
              <div className="dnd-print-frames dnd-print-frames-two">
                <Frame id="p2:0" className="dnd-print-flow-frame">{frames["p2:0"]}</Frame>
                <Frame id="p2:1" className="dnd-print-flow-frame">{frames["p2:1"]}</Frame>
              </div>
            </Box>
          )}
        </div>
        <div className="dnd-print-p2-right">
          <Box region="appearance" className="dnd-print-appearance" title={print("appearance.title")}>
            <div className="dnd-print-appearance-inner">
              {portrait ? (
                // the portrait the sheet already shows, as is: print loads nothing new
                // eslint-disable-next-line @next/next/no-img-element
                <img className="dnd-print-portrait" src={portrait} alt="" />
              ) : (
                <div className="dnd-print-portrait dnd-print-portrait-empty">{print("appearance.portrait")}</div>
              )}
              <Frame id="appearance" className="dnd-print-fill">{frames.appearance}</Frame>
            </div>
          </Box>
          <Box region="backstory" className="dnd-print-backstory" title={print("backstory.title")}>
            <Frame id="backstory" className="dnd-print-fill dnd-print-pad">{frames.backstory}</Frame>
            <div className="dnd-print-alignment">
              <span className="dnd-print-label">{print("backstory.alignment")}</span>
              <span className="dnd-print-value">{model.alignment ? sheet(`option.alignment.${model.alignment}`) || model.alignment : ""}</span>
            </div>
          </Box>
          <Box region="languages" className="dnd-print-languages" title={print("languages")}>
            <Frame id="languages" className="dnd-print-fill dnd-print-pad">{frames.languages}</Frame>
          </Box>
          <Box region="equipment" className="dnd-print-equipment" title={print("equipment.title")}>
            <Frame id="equipment" className="dnd-print-table-frame">{frames.equipment}</Frame>
            <div className="dnd-print-equipment-foot">
              {carry && <div className="dnd-print-carry">{carry}</div>}
              <span className="dnd-print-label">{print("equipment.attunement")}</span>
              {model.attunement.map((item, index) => (
                <div key={index} className="dnd-print-attune">
                  <Diamond on={item !== ""} />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </Box>
          <Box region="coins" className="dnd-print-coins" title={print("coins")}>
            <div className="dnd-print-coin-grid">
              {(["cp", "sp", "ep", "gp", "pp"] as const).map((coin) => (
                <div key={coin} className="dnd-print-coin">
                  <span className="dnd-print-label">{sheet(`field.${coin}`)}</span>
                  <span className="dnd-print-value">{model.coins[coin] === 0 ? "" : model.coins[coin]}</span>
                </div>
              ))}
            </div>
          </Box>
        </div>
      </div>
    </Page>
  );
}

/** The carried load line of the equipment box, or "" when some weight is unknown. */
export function carryLine(model: DndPrintModel, labels: PrintLabels): string {
  const carry = model.carry;
  if (!carry) return "";
  const round = (value: number) => String(Math.round(value * 10) / 10);
  const line = labels.print("equipment.carry", { carried: round(carry.carried), capacity: round(carry.capacity), coins: round(carry.coins) });
  if (carry.status === "ok") return line;
  return `${line}${labels.print("separator")}${labels.print(carry.status === "over" ? "equipment.over" : "equipment.overDrag")}`;
}
