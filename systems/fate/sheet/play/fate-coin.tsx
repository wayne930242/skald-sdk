"use client";

import { useId, type CSSProperties } from "react";
import { cn } from "@skald/sheet-sdk/lib/utils";
import type { FateCoinState, FateCoinTier } from "./coin-model";

/**
 * Shades of the theme's accent (陶土 copper in light, a warmer light copper in dark), mixed in
 * the browser so the coin follows the active theme without colours of its own.
 */
const SHADE = {
  shine: "color-mix(in oklch, var(--accent) 40%, white)",
  lit: "color-mix(in oklch, var(--accent) 72%, white)",
  base: "var(--accent)",
  shade: "color-mix(in oklch, var(--accent) 72%, black)",
  deep: "color-mix(in oklch, var(--accent) 48%, black)",
} as const;

const fill = (color: string): CSSProperties => ({ fill: color });
const stroke = (color: string, width: number): CSSProperties => ({ fill: "none", stroke: color, strokeWidth: width });
const stop = (color: string): CSSProperties => ({ stopColor: color });

const round = (value: number) => Math.round(value * 100) / 100;
const at = (radius: number, degrees: number): string => {
  const radians = ((degrees - 90) * Math.PI) / 180;
  return `${round(20 + radius * Math.cos(radians))} ${round(20 + radius * Math.sin(radians))}`;
};

/** Wedge rays from the boss: `count` rays, every other one short, `spread` degrees either side. */
function burst(count: number, long: number, short: number, base: number, spread: number): string {
  return Array.from({ length: count }, (_, index) => {
    const angle = (360 / count) * index;
    const tip = index % 2 === 0 ? long : short;
    return `M${at(base, angle - spread)}L${at(tip, angle)}L${at(base, angle + spread)}Z`;
  }).join("");
}

// The full face carries 16 slim rays, a ring of notches on the rim and a knurled field; the simple
// face keeps 8 broad rays so a 24-32 px coin stays crisp.
const FULL_RAYS = burst(16, 12.8, 9.6, 3.9, 11);
const SIMPLE_RAYS = burst(8, 12.6, 9.4, 4.2, 17);
const NOTCHES = Array.from({ length: 12 }, (_, index) => at(16.85, 15 + index * 30).split(" ").map(Number) as [number, number]);
/** The light catching the top-left of the raised rim (bevel). */
const BEVEL = `M${at(18.1, 245)}A18.1 18.1 0 0 1 ${at(18.1, 345)}`;
const BEVEL_SIMPLE = `M${at(17.9, 250)}A17.9 17.9 0 0 1 ${at(17.9, 340)}`;

/** Which parts draw at which detail: `container` is simple on a phone and full from `@3xl`. */
function partClass(detail: FateCoinTier | "container", part: FateCoinTier): string | undefined {
  if (detail !== "container") return detail === part ? undefined : "hidden";
  return part === "full" ? "hidden @3xl:inline" : "@3xl:hidden";
}

function MetalFace({ detail, uid }: { detail: FateCoinTier | "container"; uid: string }) {
  const full = partClass(detail, "full");
  const simple = partClass(detail, "simple");
  const showFull = full !== "hidden";
  const showSimple = simple !== "hidden";
  return (
    <>
      <defs>
        <linearGradient id={`${uid}-rim`} x1="0" y1="0" x2="0.35" y2="1">
          <stop offset="0" style={stop(SHADE.lit)} />
          <stop offset="0.5" style={stop(SHADE.base)} />
          <stop offset="1" style={stop(SHADE.shade)} />
        </linearGradient>
        <linearGradient id={`${uid}-field`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={stop(SHADE.deep)} />
          <stop offset="1" style={stop(SHADE.base)} />
        </linearGradient>
        {showFull && (
          <pattern id={`${uid}-knurl`} width="2.2" height="2.2" patternUnits="userSpaceOnUse" patternTransform="rotate(45 20 20)">
            <path d="M0 0H2.2M0 0V2.2" style={stroke(SHADE.deep, 0.55)} />
          </pattern>
        )}
      </defs>
      {/* Edge, raised rim, recessed field. */}
      <circle cx="20" cy="20" r="19.6" style={fill(SHADE.deep)} />
      <circle cx="20" cy="20" r="18.9" style={{ fill: `url(#${uid}-rim)` }} />
      <circle cx="20" cy="20" r="14.6" style={{ fill: `url(#${uid}-field)`, stroke: SHADE.deep, strokeWidth: 0.9 }} />
      {showFull && (
        <g className={full}>
          <circle cx="20" cy="20" r="14.1" style={{ fill: `url(#${uid}-knurl)`, opacity: 0.75 }} />
          {NOTCHES.map(([x, y]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r="0.8" style={fill(SHADE.deep)} />
          ))}
          <path d={BEVEL} strokeLinecap="round" style={stroke(SHADE.shine, 1)} />
          <path d={FULL_RAYS} style={fill(SHADE.shine)} />
        </g>
      )}
      {showSimple && (
        <g className={simple}>
          <path d={BEVEL_SIMPLE} strokeLinecap="round" style={stroke(SHADE.shine, 1.4)} />
          <path d={SIMPLE_RAYS} style={fill(SHADE.shine)} />
        </g>
      )}
      {/* The boss the rays spring from. */}
      <circle cx="20" cy="20" r="4.1" style={{ fill: `url(#${uid}-rim)`, stroke: SHADE.deep, strokeWidth: 0.8 }} />
    </>
  );
}

/** A spent point: the coin's outline, hollow and dimmed. */
function HollowFace({ detail }: { detail: FateCoinTier | "container" }) {
  const full = partClass(detail, "full");
  const simple = partClass(detail, "simple");
  const rings = (rim: number, field: number) => (
    <>
      <circle cx="20" cy="20" r="18.6" style={{ fill: SHADE.base, fillOpacity: 0.06, stroke: SHADE.base, strokeOpacity: 0.55, strokeWidth: rim }} />
      <circle cx="20" cy="20" r="14.2" style={{ ...stroke(SHADE.base, field), strokeOpacity: 0.4 }} />
      <circle cx="20" cy="20" r="3.6" style={{ ...stroke(SHADE.base, field), strokeOpacity: 0.4 }} />
    </>
  );
  return (
    <>
      {full !== "hidden" && <g className={full}>{rings(1.5, 0.9)}</g>}
      {simple !== "hidden" && <g className={simple}>{rings(2, 1.3)}</g>}
    </>
  );
}

/**
 * A fate point as a metal coin (Campaign Coins-like, without any wordmark): a thick raised rim,
 * a radiating burst and, at 40 px and up, a knurled field. Spent capacity draws hollow. Always
 * decorative: the count and its label carry the meaning.
 */
export function FateCoin({ state = "available", detail, className }: { state?: FateCoinState; detail: FateCoinTier | "container"; className?: string }) {
  const uid = `fate-coin-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <svg
      viewBox="0 0 40 40"
      className={cn("block shrink-0", className)}
      aria-hidden
      focusable="false"
      data-fate-coin={state}
      data-fate-coin-detail={detail}
    >
      {state === "spent" ? <HollowFace detail={detail} /> : <MetalFace detail={detail} uid={uid} />}
    </svg>
  );
}
