import type { CSSProperties, ReactNode } from "react";
import { cn } from "@skald/sheet-sdk/lib/utils";

/**
 * The kit's printed parts (kit-plan.md §2). Each is a styled element, never a layout: a System's
 * grid places them, and sizes come in as props or the kit's tokens.
 */

/** The one tick every printed box uses. */
function Tick() {
  return (
    <svg viewBox="0 0 10 10" aria-hidden="true">
      <path d="M1.8 5.2 L4.1 7.6 L8.4 2.4" />
    </svg>
  );
}

/** A section heading: `rule` underlined, `band` on a grey band, `solid` a black banner. */
export function SectionBanner({
  tone = "rule",
  note,
  as: Tag = "h2",
  className,
  children,
}: {
  tone?: "rule" | "band" | "solid";
  note?: ReactNode;
  as?: "h2" | "h3";
  className?: string;
  children: ReactNode;
}) {
  return (
    <Tag className={cn("pk-banner", className)} data-tone={tone}>
      {children}
      {note && <small className="pk-banner-note">{note}</small>}
    </Tag>
  );
}

/** A label over its value, or over empty write lines to fill in by hand. */
export function WriteField({
  label,
  value,
  hint,
  lines = 1,
  inline = false,
  className,
}: {
  label: ReactNode;
  value?: ReactNode;
  hint?: ReactNode;
  lines?: number;
  inline?: boolean;
  className?: string;
}) {
  const filled = value !== undefined && value !== null && value !== "";
  const empty = Math.max(0, lines - (filled ? 1 : 0));
  return (
    <div className={cn("pk-write-field", className)} data-inline={inline ? "true" : undefined}>
      <div className="pk-label">
        <span>{label}</span>
        {hint && <small>{hint}</small>}
      </div>
      {filled && <div className="pk-write-line pk-value">{value}</div>}
      {Array.from({ length: empty }, (_, index) => (
        <div key={index} className="pk-write-line" />
      ))}
    </div>
  );
}

/** `count` ruled lines, `pitch` apart (a CSS length; the kit's default otherwise). */
export function WriteLines({ count, pitch, className }: { count: number; pitch?: string; className?: string }) {
  return (
    <div className={cn("pk-write-lines", className)} style={pitch ? ({ "--pk-line-pitch": pitch } as CSSProperties) : undefined}>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="pk-write-line" />
      ))}
    </div>
  );
}

/** Ruled lines that fill what a page has left and clip the rest (a notes area). */
export function RuledArea({ rows = 60, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("pk-ruled", className)} aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="pk-write-line" />
      ))}
    </div>
  );
}

/** A box to tick; `optional` draws it dashed. */
export function Checkbox({
  checked = false,
  size,
  optional = false,
  label,
}: {
  checked?: boolean;
  size?: string;
  optional?: boolean;
  label?: ReactNode;
}) {
  const box = (
    <span
      className="pk-box"
      aria-hidden="true"
      data-checked={checked ? "true" : undefined}
      data-optional={optional ? "true" : undefined}
      style={size ? ({ "--pk-box-size": size } as CSSProperties) : undefined}
    >
      {checked && <Tick />}
    </span>
  );
  if (label === undefined) return box;
  return (
    <span className="pk-check">
      {box}
      <span>{label}</span>
    </span>
  );
}

/** A row of `length` boxes or pips, the first `marked` ticked; the ones from index `optionalFrom` on are dashed (optional). */
export function Track({
  length,
  marked = 0,
  numbered = false,
  optionalFrom,
  size,
  shape = "box",
  className,
}: {
  length: number;
  marked?: number;
  numbered?: boolean;
  optionalFrom?: number;
  size?: string;
  shape?: "box" | "pip";
  className?: string;
}) {
  return (
    <span
      className={cn("pk-track", className)}
      data-shape={shape}
      aria-hidden="true"
      style={size ? ({ "--pk-box-size": size } as CSSProperties) : undefined}
    >
      {Array.from({ length }, (_, index) => {
        const isMarked = index < marked;
        return (
          <span
            key={index}
            className="pk-track-cell"
            data-track-cell=""
            data-marked={isMarked ? "true" : undefined}
            data-optional={optionalFrom !== undefined && index >= optionalFrom ? "true" : undefined}
          >
            {numbered && <span className="pk-track-number">{index + 1}</span>}
            {isMarked && shape === "box" && <Tick />}
          </span>
        );
      })}
    </span>
  );
}

/** A value in a circle with an optional caption (Fate refresh, Avatar stats). */
export function StatCircle({ value, size, children }: { value?: ReactNode; size?: string; children?: ReactNode }) {
  return (
    <span className="pk-circle" style={size ? ({ "--pk-circle-size": size } as CSSProperties) : undefined}>
      <span className="pk-circle-ring">
        <span className="pk-circle-value">{value}</span>
      </span>
      {children !== undefined && <span className="pk-circle-caption">{children}</span>}
    </span>
  );
}
