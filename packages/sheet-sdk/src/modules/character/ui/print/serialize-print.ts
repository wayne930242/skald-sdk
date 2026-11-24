import type { PrintPaper, PrintPdfRequest } from "@skald/sheet-sdk/modules/systems/ui/system-print";

export interface SerializedPrint {
  payload: PrintPdfRequest;
  /** Images left out: unreadable by a canvas (no CORS) or over the size budget. */
  droppedImages: number;
}

export interface SerializeOptions {
  paper: PrintPaper;
  locale: string;
  title: string;
  /** Printed on every PDF page when an image had to be left out. */
  droppedImagesNote: string;
}

export const IMAGE_LIMITS = {
  /** Longest edge an image is drawn at. */
  edge: 800,
  bytesEach: 512 * 1024,
  bytesTotal: 1.5 * 1024 * 1024,
} as const;

// Turbopack's dev chunk names carry an encoded `[next]` (%5B, %5D); no other escape is taken,
// so an encoded dot cannot climb out of /_next/static.
const STYLESHEET_PATH = /^\/_next\/static\/(?:[\w./-]|%5[BbDd])+\.css$/;
const MAX_STYLESHEETS = 40;

/** The page's own stylesheets, in document order, as the paths the server accepts. */
export function pageStylesheets(doc: Document = document): string[] {
  const paths = new Set<string>();
  for (const link of doc.querySelectorAll<HTMLLinkElement>('link[rel~="stylesheet"][href]')) {
    const url = new URL(link.href, doc.baseURI);
    if (url.origin !== window.location.origin || url.search) continue;
    if (STYLESHEET_PATH.test(url.pathname) && !url.pathname.split("/").includes("..")) paths.add(url.pathname);
  }
  return [...paths].slice(0, MAX_STYLESHEETS);
}

/**
 * The image as a `data:` URL drawn on a canvas at most `edge` px long, PNG or else JPEG, or null when
 * the canvas cannot read it (a cross-origin image without CORS) or it stays over `maxBytes`.
 */
export function inlineImage(image: HTMLImageElement, maxBytes: number): string | null {
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  if (!image.complete || width === 0 || height === 0) return null;
  const scale = Math.min(1, IMAGE_LIMITS.edge / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext("2d");
  if (!context) return null;
  const limit = Math.min(maxBytes, IMAGE_LIMITS.bytesEach);
  try {
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const png = canvas.toDataURL("image/png");
    if (png.startsWith("data:image/png") && png.length <= limit) return png;
    // JPEG has no alpha: paper white behind the image
    context.globalCompositeOperation = "destination-over";
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    for (const quality of [0.85, 0.7, 0.5]) {
      const jpeg = canvas.toDataURL("image/jpeg", quality);
      if (jpeg.startsWith("data:image/jpeg") && jpeg.length <= limit) return jpeg;
    }
    return null;
  } catch {
    // SecurityError: the canvas is tainted by a cross-origin image
    return null;
  }
}

/**
 * The print root as the PDF renderer receives it (print plan, phase 3): its HTML once fonts and
 * images are ready, without the toolbar, every image inlined as a `data:` URL, plus the page's own
 * stylesheet paths. It reads only the DOM on screen; nothing is fetched or saved.
 */
export function serializePrint(root: HTMLElement, options: SerializeOptions): SerializedPrint {
  const clone = root.cloneNode(true) as HTMLElement;
  for (const element of clone.querySelectorAll('[data-print-toolbar], [class~="print:hidden"], script, noscript, template')) {
    element.remove();
  }

  // the clone's images pair with the root's in document order once the screen-only parts are gone
  const originals = [...root.querySelectorAll("img")].filter(
    (image) => !image.closest('[data-print-toolbar], [class~="print:hidden"], noscript, template'),
  );
  const copies = [...clone.querySelectorAll("img")];
  let budget: number = IMAGE_LIMITS.bytesTotal;
  let droppedImages = 0;
  copies.forEach((copy, index) => {
    const data = originals[index] ? inlineImage(originals[index], budget) : null;
    if (!data) {
      copy.remove();
      droppedImages++;
      return;
    }
    budget -= data.length;
    copy.setAttribute("src", data);
    for (const attribute of ["srcset", "sizes", "loading", "crossorigin", "decoding"]) copy.removeAttribute(attribute);
  });

  if (droppedImages > 0) {
    const note = document.createElement("p");
    note.setAttribute("data-pdf-note", "");
    // fixed: Chromium repeats it on every page and it takes no room in the layout; bottom left, in
    // the footer band beside the kit's skald.tw link at the bottom right
    note.setAttribute("style", "position:fixed;left:0;bottom:0;margin:0;font-size:7pt;line-height:12pt;opacity:0.7");
    note.textContent = options.droppedImagesNote;
    (clone.querySelector(".skald-print-pages") ?? clone).append(note);
  }

  return {
    payload: {
      html: clone.outerHTML,
      stylesheets: pageStylesheets(),
      paper: options.paper,
      locale: options.locale,
      title: options.title.slice(0, 200),
      buildId: process.env.NEXT_PUBLIC_SKALD_BUILD_ID ?? "",
      htmlClass: document.documentElement.className,
      bodyClass: document.body.className,
    },
    droppedImages,
  };
}
