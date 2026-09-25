/**
 * The result of a whole-page scan, drawn on the page it describes.
 *
 * WHY THIS DOES THE OPPOSITE OF `overlay.ts`, ON PURPOSE
 *
 * The run overlay clears itself the moment the page scrolls, and its own
 * docblock explains why: it describes ONE viewport, so boxes that followed the
 * content would keep looking authoritative while the user scrolled into fields
 * nothing ever examined — and a field with no box reads as "checked and safe"
 * rather than "not looked at".
 *
 * That argument turns entirely on the evidence being one screen wide. A scan
 * examined the whole document, so pinning its boxes to the content is not a
 * relaxation of that rule but the same rule applied to a wider claim: the boxes
 * stay exactly as wide as what was actually looked at. Scrolling through them
 * is the point.
 *
 * Where the scan stopped short — an endless page, a stop cap — the boundary is
 * drawn on the page as a line you can scroll to. A summary that said "12 found"
 * while quietly omitting the half it never reached would recreate the very
 * misreading this feature exists to correct.
 *
 * THE FINDINGS OUTLIVE THE BOXES, AND THAT IS THE POINT
 *
 * Drawing them was never the whole job. A scan that found an Aadhaar number and
 * then let the next run transmit the page having forgotten about it has done
 * nothing but point — and the run cannot rediscover it, because the number sits
 * below the fold and a run only ever reads one screen.
 *
 * So the findings are kept here, in document coordinates, exactly as
 * `manual-redaction.ts` keeps what the user drew, and handed back converted to
 * viewport space whenever a run captures. The boxes can be hidden without
 * discarding them: they must not be baked into a frame, and the protection must
 * not end when they stop being visible.
 *
 * The claim they carry is as of the moment the scan ran. A page that reflows
 * underneath them will drift, which is the same limit a drawn mark has always
 * had; a navigation destroys this script and takes them with it.
 *
 * NOTHING HERE TRANSMITS, AND NOTHING HERE IS STORED
 *
 * These carry categories and rule names, which by construction never quote the
 * content that triggered them. They live as long as the page does and are
 * written nowhere.
 */

import { clipFindings, type ScanFinding } from '../lib/coverage';
import type { SensitiveCategory } from '../lib/types';

const SURFACE_ID = 'shield-scan-overlay';

const CATEGORY_LABEL: Readonly<Record<SensitiveCategory, string>> = {
  password: 'Password',
  name: 'Name',
  email: 'Email',
  phone: 'Phone',
  address: 'Address',
  id_number: 'ID number',
  face: 'Face',
  other: 'Hidden',
};

interface Drawn {
  finding: ScanFinding;
  box: HTMLElement;
}

let surface: HTMLElement | null = null;
let drawn: Drawn[] = [];
let boundary: { element: HTMLElement; y: number } | null = null;

/**
 * What the last scan found, in DOCUMENT coordinates.
 *
 * Module state, so it lives exactly as long as the page does. Held separately
 * from `drawn` because the boxes come and go — hidden before every capture —
 * while the findings must not.
 */
let findings: ScanFinding[] = [];

/**
 * How the last scan ended, so the boxes can be rebuilt after being hidden.
 *
 * Held alongside the findings rather than passed in again, because the caller
 * that re-shows them — the popup, after a run — was not the caller that ran the
 * scan and has no way to know whether it stopped early.
 */
let lastOptions: { truncated: boolean; examinedTo: number } = {
  truncated: false,
  examinedTo: 0,
};

/** Remove the boxes, keeping the findings themselves. */
function teardownSurface(): void {
  surface?.remove();
  surface = null;
  drawn = [];
  boundary = null;
  window.removeEventListener('scroll', reposition, true);
  window.removeEventListener('resize', reposition);
}

/**
 * Show or hide the boxes without discarding what was found.
 *
 * Called before every capture. The boxes are painted over the page, so leaving
 * them up would bake them into the frame the model is shown and into the frame
 * the popup presents as a faithful record — and OCR would read Shield's own
 * labels back as findings. Hiding is not forgetting.
 */
export function setScanVisible(visible: boolean): void {
  if (!visible) {
    teardownSurface();
    return;
  }
  if (findings.length > 0 && !surface) draw();
}

/** Discard the scan result entirely. */
export function clearScanOverlay(): void {
  teardownSurface();
  findings = [];
  lastOptions = { truncated: false, examinedTo: 0 };
}

/** How many findings this page is carrying. */
export function scanFindingCount(): number {
  return findings.length;
}

/** The findings in viewport coordinates. Reads the live scroll position. */
export function scanFindingsInViewport(): ScanFinding[] {
  return clipFindings(
    findings,
    window.scrollX,
    window.scrollY,
    window.innerWidth,
    window.innerHeight,
  );
}

/**
 * Draw every finding, plus the line where examination stopped.
 *
 * The surface is viewport-anchored and the boxes are re-placed on scroll, which
 * is the same arrangement `manual-redaction.ts` uses and for the same reason: a
 * `position: absolute` surface inherits whatever containing block the page
 * happens to establish, and a page with `position: relative` on its body would
 * silently shift every box by the body's own offset. A fixed surface has no
 * containing block to inherit, so document-to-screen conversion happens in
 * exactly one place — here — rather than depending on the page's CSS.
 */
export function showScanOverlay(
  found: readonly ScanFinding[],
  options: { truncated: boolean; examinedTo: number },
): void {
  clearScanOverlay();
  findings = [...found];
  lastOptions = options;
  draw();
}

/** Build the boxes for whatever `findings` currently holds. */
function draw(): void {
  teardownSurface();
  if (findings.length === 0) return;

  const container = document.createElement('div');
  container.id = SURFACE_ID;
  Object.assign(container.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '2147483646',
    // Inert, like the run overlay. This sits over the whole page and must never
    // be able to swallow a click meant for the page underneath it.
    pointerEvents: 'none',
    contain: 'layout style',
  } satisfies Partial<CSSStyleDeclaration>);

  surface = container;

  for (const finding of findings) {
    const box = document.createElement('div');
    Object.assign(box.style, {
      position: 'absolute',
      width: `${finding.position.width}px`,
      height: `${finding.position.height}px`,
      border: '2px dashed #ffffff',
      borderRadius: '3px',
      background: 'rgba(0, 0, 0, 0.14)',
      boxShadow: '0 0 0 1px rgba(0, 0, 0, 0.85)',
      pointerEvents: 'none',
      boxSizing: 'border-box',
    } satisfies Partial<CSSStyleDeclaration>);

    const tag = document.createElement('span');
    tag.textContent = CATEGORY_LABEL[finding.category];
    // The rule that fired. Rule names describe a decision without quoting what
    // triggered it, so this cannot show the user their own data back while
    // explaining that it was found.
    tag.title = finding.reason;
    Object.assign(tag.style, {
      position: 'absolute',
      top: '-20px',
      left: '0',
      padding: '1px 6px',
      borderRadius: '3px',
      background: '#ffffff',
      color: '#000000',
      boxShadow: '0 0 0 1px rgba(0, 0, 0, 0.6)',
      font: '600 11px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif',
      whiteSpace: 'nowrap',
      pointerEvents: 'none',
    } satisfies Partial<CSSStyleDeclaration>);

    box.appendChild(tag);
    container.appendChild(box);
    drawn.push({ finding, box });
  }

  if (lastOptions.truncated) {
    container.appendChild(buildBoundary(lastOptions.examinedTo));
  }

  document.documentElement.appendChild(container);
  reposition();

  // Capture phase, so a scroll inside any container on the page moves these
  // too — a finding can sit inside a panel with its own overflow. Passive
  // because nothing here calls preventDefault, and scroll is the one event
  // where a non-passive listener costs real smoothness.
  window.addEventListener('scroll', reposition, { capture: true, passive: true });
  window.addEventListener('resize', reposition);
}

/**
 * The line where examination stopped.
 *
 * Drawn on the page rather than mentioned in a summary, because it is a fact
 * about a place. Somebody who scrolls past it needs to see, at that point, that
 * Shield's claim ended here — a sentence in a popup they closed two minutes ago
 * cannot tell them that.
 */
function buildBoundary(examinedTo: number): HTMLElement {
  const line = document.createElement('div');
  Object.assign(line.style, {
    position: 'absolute',
    left: '0',
    width: '100%',
    height: '0',
    borderTop: '2px dashed #f59e0b',
    pointerEvents: 'none',
  } satisfies Partial<CSSStyleDeclaration>);

  const label = document.createElement('span');
  label.textContent = 'Shield stopped examining here';
  Object.assign(label.style, {
    position: 'absolute',
    top: '4px',
    left: '12px',
    padding: '2px 8px',
    borderRadius: '3px',
    background: '#b45309',
    color: '#fffbeb',
    font: '600 11px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif',
    whiteSpace: 'nowrap',
    pointerEvents: 'none',
  } satisfies Partial<CSSStyleDeclaration>);

  line.appendChild(label);
  boundary = { element: line, y: examinedTo };
  return line;
}

/**
 * Re-place everything for the current scroll position.
 *
 * The single conversion between document and screen space in this module.
 * Coordinate bugs in this project have all had the same shape — a plausible
 * rectangle over the wrong pixels — and every one of them came from doing this
 * conversion in more than one place.
 */
function reposition(): void {
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;

  for (const { finding, box } of drawn) {
    box.style.left = `${finding.position.x - scrollX}px`;
    box.style.top = `${finding.position.y - scrollY}px`;
  }

  if (boundary) {
    boundary.element.style.top = `${boundary.y - scrollY}px`;
  }
}
