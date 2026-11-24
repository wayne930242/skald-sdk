import { cn } from "@skald/sheet-sdk/lib/utils";

interface QuillLoaderProps {
  className?: string;
  size?: "sm" | "md" | "lg";
  showText?: boolean;
}

// Stage box the artwork is fitted into; sizes below just scale it.
const STAGE_WIDTH = 100;
const STAGE_HEIGHT = 60;

const sizeConfig = {
  sm: { scale: 1.2, text: "text-xs" },
  md: { scale: 1.6, text: "text-sm" },
  lg: { scale: 2, text: "text-base" },
};

// Plain CSS: the base rules are the finished frame (pen resting above the
// blot), animation only applies when the user has not asked for reduced motion.
const QUILL_CSS = `.qb{overflow:visible;display:block}.qb .pen,.qb .ink,.qb .blot,.qb .ring,.qb .dot{transform-box:view-box}.qb .pen{transform:translate(46px,42px);opacity:1}.qb .blot{transform:translate(46px,55px) scale(1)}.qb .ring{opacity:0}.qb .dot{opacity:1}@media (prefers-reduced-motion:no-preference){.qb-text{animation:qb-text 2s ease-in-out infinite}.qb .pen{animation:qb-pen 2.4s cubic-bezier(.4,0,.2,1) infinite}.qb .blot{animation:qb-blot 2.4s cubic-bezier(.2,.7,.2,1) infinite}.qb .ring{animation:qb-ring 2.4s ease-out infinite}.qb .dot{animation:qb-dot 2.4s ease-out infinite}.qb .dot:nth-of-type(2){animation-delay:.07s}.qb .dot:nth-of-type(3){animation-delay:.14s}}@keyframes qb-text{0%,100%{opacity:.4}50%{opacity:.8}}@keyframes qb-pen{0%{transform:translate(50px,32px) rotate(7deg);opacity:0}12%{transform:translate(49px,41px) rotate(5deg);opacity:1}26%{transform:translate(46px,54.5px) rotate(0deg);opacity:1}42%{transform:translate(46px,54.5px) rotate(0deg);opacity:1}60%{transform:translate(49px,42px) rotate(5deg);opacity:1}86%{transform:translate(49px,42px) rotate(5deg);opacity:1}100%{transform:translate(50px,32px) rotate(7deg);opacity:0}}@keyframes qb-blot{0%,24%{transform:translate(46px,55px) scale(0);opacity:1}52%{transform:translate(46px,55px) scale(1);opacity:1}84%{transform:translate(46px,55px) scale(1);opacity:1}100%{transform:translate(46px,55px) scale(.94);opacity:0}}@keyframes qb-ring{0%,26%{transform:translate(46px,55px) scale(.3);opacity:.55}60%,100%{transform:translate(46px,55px) scale(1.9);opacity:0}}@keyframes qb-dot{0%,30%{opacity:0;transform:scale(0)}44%,84%{opacity:1;transform:scale(1)}100%{opacity:0;transform:scale(1)}}`;

/**
 * Quill loading mark ("Blot"): a pen dips to the page, an ink blot blooms with
 * a ripple and droplets, then the pen lifts away. Colour follows text-primary.
 */
export function QuillLoader({
  className,
  size = "md",
  showText = true,
}: QuillLoaderProps) {
  const config = sizeConfig[size];

  return (
    <div
      role="status"
      aria-busy="true"
      className={cn(
        "flex flex-col items-center justify-center gap-3",
        className
      )}
    >
      <div
        className="text-primary"
        style={{
          width: STAGE_WIDTH * config.scale,
          height: STAGE_HEIGHT * config.scale,
        }}
      >
        <style>{QUILL_CSS}</style>
        <svg
          className="qb"
          width="100%"
          height="100%"
          viewBox="-6 -14 130 76"
          aria-hidden="true"
        >
          <path className="blot" d="M10.15 0 C10.33 1.08 9.92 2.67 8.81 3.46 C7.71 4.24 5.19 4.35 3.51 4.69 C1.82 5.02 0.38 5.47 -1.29 5.45 C-2.95 5.44 -5.09 5.2 -6.51 4.58 C-7.93 3.97 -9.58 2.76 -9.81 1.76 C-10.05 0.76 -8.27 -0.21 -7.94 -1.42 C-7.61 -2.63 -8.88 -4.67 -7.81 -5.5 C-6.74 -6.33 -3.49 -6.42 -1.51 -6.41 C0.47 -6.4 2.52 -6 4.07 -5.43 C5.61 -4.87 6.74 -3.95 7.75 -3.04 C8.77 -2.13 9.98 -1.08 10.15 0Z" fill="currentColor"/><ellipse className="ring" rx="12" ry="7.5" fill="none" stroke="currentColor" strokeWidth="0.9" transform="translate(46 55)"/><circle className="dot" cx="29" cy="58" r="1.5" fill="currentColor" style={{ transformOrigin: "29px 58px" }}/><circle className="dot" cx="61" cy="60" r="1.2" fill="currentColor" style={{ transformOrigin: "61px 60px" }}/><circle className="dot" cx="68" cy="54" r="0.9" fill="currentColor" style={{ transformOrigin: "68px 54px" }}/><g className="pen"><g className="pen-in" transform="scale(0.72) translate(-9.86 -58.79)"><path d="M9.86 58.79C9.93 58.32 10.12 56.94 10.26 55.95C10.41 54.96 10.54 53.9 10.73 52.87C10.92 51.85 11.13 50.78 11.4 49.8C11.68 48.81 12 47.85 12.36 46.97C12.73 46.09 13.16 45.33 13.59 44.52C14.01 43.72 14.59 42.99 14.93 42.15C15.28 41.3 15.4 40.36 15.66 39.45C15.92 38.54 16.2 37.62 16.49 36.71C16.79 35.81 17.1 34.9 17.44 34.01C17.77 33.12 18.12 32.23 18.48 31.36C18.85 30.5 19.23 29.64 19.62 28.81C20.01 27.98 20.53 26.97 20.84 26.37C21.15 25.77 21.37 25.4 21.48 25.2L21.79 31.44C21.87 30.84 22.09 29.03 22.26 27.83C22.43 26.64 22.61 25.24 22.81 24.27C23 23.29 23.1 22.69 23.43 21.99C23.75 21.3 24.2 20.82 24.74 20.1C25.28 19.37 26.04 18.39 26.67 17.65C27.3 16.92 27.93 16.27 28.54 15.7C29.15 15.12 29.66 14.69 30.35 14.2C31.04 13.71 32.1 13.1 32.68 12.77C33.26 12.45 33.65 12.35 33.84 12.26L33.97 16.15C34.15 15.55 34.59 13.33 35.07 12.53C35.55 11.73 36.14 11.63 36.87 11.35C37.6 11.06 38.56 10.99 39.45 10.8C40.35 10.62 41.4 10.41 42.23 10.23C43.06 10.04 43.68 9.89 44.43 9.68C45.17 9.48 45.93 9.24 46.7 8.99C47.47 8.74 48.25 8.48 49.03 8.21C49.82 7.94 50.63 7.69 51.41 7.38C52.2 7.07 52.99 6.75 53.75 6.35C54.52 5.95 55.63 5.23 56 5L56 5C55.67 5.28 54.62 6.07 53.99 6.66C53.37 7.24 52.8 7.87 52.24 8.5C51.68 9.12 51.16 9.78 50.63 10.41C50.1 11.03 49.56 11.65 49.04 12.26C48.52 12.88 48 13.48 47.51 14.08C47.02 14.68 46.61 15.29 46.11 15.86C45.6 16.43 45.13 17.09 44.51 17.48C43.89 17.86 42.75 18.05 42.4 18.17L43.96 18.7C43.68 19.06 42.87 20.14 42.31 20.83C41.75 21.52 41.2 22.19 40.59 22.85C39.99 23.51 39.49 24.14 38.69 24.8C37.89 25.45 37.01 26.24 35.81 26.76C34.62 27.27 32.23 27.68 31.52 27.86L35.25 27.78C34.9 28.06 33.9 28.86 33.16 29.43C32.43 30 31.66 30.59 30.86 31.21C30.06 31.83 29.22 32.48 28.37 33.15C27.53 33.81 26.51 34.62 25.79 35.21C25.07 35.79 24.63 36.16 24.05 36.65C23.47 37.15 22.89 37.65 22.32 38.16C21.74 38.67 21.17 39.2 20.61 39.73C20.04 40.26 19.48 40.81 18.94 41.37C18.39 41.92 17.85 42.39 17.35 43.06C16.85 43.74 16.38 44.62 15.95 45.41C15.52 46.19 14.97 47.38 14.78 47.77ZM16.43 42.1C16.62 41.76 17.18 40.71 17.59 40.03C18 39.36 18.45 38.7 18.9 38.05C19.35 37.4 19.82 36.77 20.29 36.13C20.77 35.5 21.26 34.88 21.75 34.26C22.25 33.65 22.76 33.04 23.28 32.44C23.79 31.85 24.32 31.25 24.85 30.67C25.38 30.09 25.92 29.51 26.47 28.94C27.02 28.37 27.57 27.8 28.13 27.25C28.69 26.69 29.26 26.14 29.83 25.59C30.4 25.04 30.98 24.5 31.56 23.97C32.14 23.44 32.73 22.91 33.32 22.38C33.91 21.86 34.51 21.34 35.1 20.82C35.7 20.31 36.31 19.8 36.91 19.29C37.52 18.79 38.13 18.29 38.74 17.79C39.36 17.29 39.97 16.8 40.59 16.31C41.21 15.82 41.83 15.33 42.46 14.85C43.08 14.37 43.71 13.89 44.34 13.41C44.97 12.94 45.6 12.46 46.23 12C46.87 11.53 47.5 11.06 48.14 10.6C48.79 10.14 49.76 9.47 50.09 9.25C50.09 9.25 50.09 9.25 50.09 9.25C49.78 9.49 48.85 10.22 48.22 10.7C47.6 11.19 46.97 11.67 46.35 12.15C45.73 12.64 45.11 13.12 44.49 13.61C43.87 14.1 43.25 14.59 42.64 15.08C42.03 15.58 41.41 16.07 40.8 16.57C40.19 17.07 39.59 17.58 38.98 18.08C38.38 18.59 37.78 19.1 37.18 19.61C36.58 20.12 35.99 20.64 35.4 21.16C34.81 21.68 34.22 22.2 33.63 22.73C33.05 23.26 32.47 23.79 31.9 24.33C31.32 24.87 30.75 25.41 30.18 25.96C29.62 26.5 29.06 27.06 28.5 27.61C27.94 28.17 27.39 28.73 26.85 29.3C26.3 29.87 25.76 30.44 25.23 31.02C24.7 31.6 24.17 32.18 23.65 32.77C23.14 33.36 22.62 33.96 22.12 34.57C21.62 35.17 21.12 35.78 20.63 36.4C20.15 37.01 19.67 37.64 19.2 38.27C18.73 38.9 18.27 39.54 17.81 40.18C17.35 40.82 16.66 41.78 16.43 42.1Z" fill="currentColor" fillRule="evenodd"/></g></g>
        </svg>
      </div>

      {showText && (
        <p
          className={cn(
            "qb-text text-muted-foreground font-heading tracking-wider opacity-60",
            config.text
          )}
        >
          Skald
        </p>
      )}
    </div>
  );
}
