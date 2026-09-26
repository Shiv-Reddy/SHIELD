/**
 * Explainable redaction overlay — showing what was hidden, and why.
 *
 * PRD.md FR-24 and DEMO_SCRIPT.md step 4 both rest on this. Everything Shield
 * does to protect the user happens somewhere they cannot see: in an offscreen
 * document, on a canvas, inside a payload. Without this, the entire privacy
 * claim is something a user has to take on trust — which is precisely the thing
 * the project exists to avoid asking of them.
 *
 * The overlay draws over the page but is deliberately inert: `pointer-events`
 * is off throughout, so it cannot intercept a click meant for the page or
 * interfere with the action the executor is about to take.
 */

import type { SensitiveCategory } from '../lib/types';

const CONTAINER_ID = 'shield-redaction-overlay';

/** What the user is told each category means, in their words rather than ours. */
const CATEGORY_LABEL: Readonly<Record<SensitiveCategory, string>> = {
  password: '[PASSWORD]',
  name: '[NAME]',
  email: '[EMAIL]',
  phone: '[PHONE]',
  address: '[ADDRESS]',
  id_number: '[ID_NUMBER]',
  face: '[FACE]',
  other: '[REDACTED]',
};

export interface OverlayRegion {
  category: SensitiveCategory;
  reason: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Held so the scroll listener can be removed with the overlay it belongs to.
 * Without this every run would leave another listener behind on the page.
 */
let scrollListener: ((event?: Event) => void) | null = null;

/**
 * Remove any overlay currently on the page.
 *
 * Called before drawing, when a run ends, and now on any scroll. The overlay
 * describes one specific capture, and leaving a stale one up would make a claim
 * about the current page that nothing has verified.
 */
export function clearOverlay(): void {
  document.getElementById(CONTAINER_ID)?.remove();

  if (scrollListener !== null) {
    window.removeEventListener('scroll', scrollListener, true);
    scrollListener = null;
  }
}

/**
 * Draw a labelled box over every redacted region.
 *
 * Positions are CSS pixels of the viewport — the same space the DOM map and the
 * face regions were converted into — so the boxes are placed with `position:
 * fixed`.
 *
 * WHICH MEANS THEY STOP BEING TRUE THE MOMENT THE PAGE SCROLLS. A fixed box
 * stays welded to the viewport while the content slides out from under it, so
 * after a scroll of N pixels every label sits N pixels away from the field it
 * names. This was invisible for the whole of Phase 1 because nothing ever
 * scrolled: the login screen fits on one screen, and Shield had no scroll
 * action. It showed up the first time the sign-up run scrolled a long form —
 * "Email" over the first-name field, and the real email visible with no box on
 * it at all, on the one feature whose entire job is to be believable.
 *
 * So any scroll clears it. That is the same rule already applied before acting
 * and at the start of a run: an explanation of the wrong screen is worse than
 * none.
 *
 * PINNING THE BOXES TO THE CONTENT WAS THE OTHER OPTION AND IS WORSE. This
 * overlay describes ONE capture, and a capture only ever contained what was in
 * the viewport — `dom-map.ts` discards the rest. Boxes that followed the
 * content would keep their claim looking valid while the user scrolled into
 * fields Shield never looked at, and those fields would show no box, which
 * reads as "checked and safe" rather than "not examined". Clearing keeps the
 * claim exactly as wide as the evidence behind it.
 */
export function showOverlay(regions: readonly OverlayRegion[]): void {
  clearOverlay();
  if (regions.length === 0) return;

  const container = document.createElement('div');
  container.id = CONTAINER_ID;

  // A very high z-index and `fixed` positioning, so the overlay is not buried by
  // the page's own stacking contexts. `pointer-events: none` on the container
  // is what keeps it from ever swallowing a real click.
  Object.assign(container.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '2147483647',
    pointerEvents: 'none',
    contain: 'layout style',
  } satisfies Partial<CSSStyleDeclaration>);

  for (const region of regions) {
    // Solid, with the label the AI was given written on it: while the AI is
    // deciding, the page itself reads the way the AI is reading it. The
    // overlay is drawn after the capture and removed before any action, so it
    // is never in a frame that is examined or sent.
    const box = document.createElement('div');
    Object.assign(box.style, {
      position: 'fixed',
      left: `${region.x}px`,
      top: `${region.y}px`,
      width: `${region.width}px`,
      height: `${region.height}px`,
      borderRadius: '3px',
      background: '#111111',
      boxShadow: '0 0 0 1px rgba(255, 255, 255, 0.6)',
      pointerEvents: 'none',
      boxSizing: 'border-box',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    } satisfies Partial<CSSStyleDeclaration>);

    const tag = document.createElement('span');
    tag.textContent = CATEGORY_LABEL[region.category];
    // The rule that fired, as a tooltip. Rule names never quote page content —
    // 'input type="password"', 'autocomplete="email"' — so this cannot show the
    // user's data back to them while explaining that it was hidden.
    tag.title = region.reason;

    Object.assign(tag.style, {
      color: '#ffffff',
      font: `600 ${region.height >= 40 ? 13 : 10.5}px/1 ui-monospace, "Cascadia Mono", Consolas, monospace`,
      letterSpacing: '0.02em',
      whiteSpace: 'nowrap',
      pointerEvents: 'none',
    } satisfies Partial<CSSStyleDeclaration>);

    box.appendChild(tag);
    container.appendChild(box);
  }

  // Says what the black boxes are, for whoever is watching the screen.
  const banner = document.createElement('div');
  banner.textContent = `Shield · this is what the AI sees: ${regions.length} private item${
    regions.length === 1 ? '' : 's'
  } covered on this laptop`;
  Object.assign(banner.style, {
    position: 'fixed',
    left: '50%',
    bottom: '18px',
    transform: 'translateX(-50%)',
    padding: '9px 16px',
    borderRadius: '999px',
    background: '#111111',
    color: '#ffffff',
    boxShadow: '0 6px 24px rgba(0, 0, 0, 0.35)',
    font: '600 13px/1.3 system-ui, -apple-system, "Segoe UI", sans-serif',
    whiteSpace: 'nowrap',
    pointerEvents: 'none',
  } satisfies Partial<CSSStyleDeclaration>);
  container.appendChild(banner);

  document.documentElement.appendChild(container);

  // Capture phase, so a scroll inside any container on the page is caught and
  // not just one on the window. A field can sit in its own scrollable panel,
  // and moving that panel invalidates these boxes exactly as much as moving the
  // whole page does.
  //
  // `passive` because this never calls preventDefault, and scroll is the one
  // event where a non-passive listener costs the user real smoothness.
  const drawnAtX = window.scrollX;
  const drawnAtY = window.scrollY;

  scrollListener = (event?: Event) => {
    // A scroll event that moved nothing must not erase the overlay. Pages fire
    // these — a programmatic scroll to the position already held, a momentum
    // sequence settling — and this panel is the one thing in the demo somebody
    // is looking at when it happens. Only actual movement invalidates it.
    const target = (event as Event | undefined)?.target ?? null;
    const isDocumentScroll =
      target === null ||
      target === document ||
      target === document.documentElement ||
      target === document.body;

    if (isDocumentScroll && window.scrollX === drawnAtX && window.scrollY === drawnAtY) {
      return;
    }

    // A scroll inside some element gets no such benefit of the doubt: its
    // offset is not readable from here without knowing which element the boxes
    // were measured against, and a wrong overlay is worse than none.
    clearOverlay();
  };

  window.addEventListener('scroll', scrollListener, { capture: true, passive: true });
}
