import { useEffect, useRef, type ReactNode } from "react";

/**
 * An editor's heading. When the editor opens (mounts) it is scrolled into view if off screen and
 * focused, so on a phone, where the editor sits below the item list, opening an item shows it.
 */
export function EditorHeading({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const box = el.getBoundingClientRect();
    if (box.top < 0 || box.bottom > window.innerHeight) el.scrollIntoView?.({ block: "start", behavior: "smooth" });
    el.focus({ preventScroll: true });
  }, []);
  return (
    <h3 ref={ref} tabIndex={-1} className="font-heading text-xl lining-nums outline-none" data-editor-heading>
      {children}
    </h3>
  );
}
