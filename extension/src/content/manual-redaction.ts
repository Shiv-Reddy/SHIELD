/**
 * Manual redaction — letting the user hide what the rules did not.
 *
 * WHY THIS EXISTS
 *
 * Automatic detection will always miss something on a page nobody wrote for us.
 * The real-site runs proved it twice in one afternoon: a label carrying an
 * account address that no field rule could see, and a login page whose shape
 * fooled the reasoner. Every miss so far has been answered by widening a rule,
 * and that has a ceiling — the rules cannot know that the number in this
 * paragraph is a case reference the user considers private, because nothing in
 * the markup says so and nothing ever will.
 *
 * The person looking at the screen knows. This lets them say so. It is the one
 * detection source that is never wrong about intent, which is why
 * `DetectionSource` keeps it distinct from the three that guess.
 *
 * COORDINATES ARE THE WHOLE DESIGN
 *
 * Marks are stored in DOCUMENT space — viewport position plus scroll offset —
 * and converted to viewport space only at capture time.
 *
 * The explainable overlay got this wrong this morning and it is worth not
 * repeating: it pinned boxes to the viewport with `position: fixed`, which is
 * correct at the instant of drawing and wrong from the next scroll onward. A
 * box the user drew is a statement about a piece of the page, not about a piece
 * of the screen, and it has to survive the page moving underneath it.
 *
 * WHAT A MARK ACTUALLY DOES
 *
 * Two things, and it needs both. It paints the pixels out of the captured
 * frame, and it tokenises the value of every DOM element it overlaps. Pixels
 * alone would be a redaction that looks complete and is not: the black
 * rectangle would sit in the screenshot while the text underneath travelled
 * intact in the DOM summary. The element intersection happens in the service
 * worker, which is the only place holding both the marks and the element map.
 */

import { MSG } from '../lib/messages';
import type { ManualRegion, Rect } from '../lib/types';

const SURFACE_ID = 'shield-manual-surface';

/** Smallest mark that counts, in CSS pixels. */
const MIN_SIZE = 8;

/**
 * Marks made on this page, in document coordinates.
 *
 * Module state, so it lives exactly as long as the page does. A mark is a
 * statement about what is on screen right now; carrying it across a navigation
 * would mean re-applying somebody's judgement to a document they never saw.
 * Nothing is written to storage — see DECISIONS.md.
 */
let regions: ManualRegion[] = [];

let surface: HTMLElement | null = null;
let drawing: { startX: number; startY: number; box: HTMLElement } | null = null;
let nextId = 0;

/** Remove the drawing surface, keeping the marks themselves. */
function teardownSurface(): void {
  surface?.remove();
  surface = null;
  drawing = null;
  document.removeEventListener('keydown', onKeyDown, true);
  window.removeEventListener('scroll', reposition, true);
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return;
  // Swallowed, so leaving Shield's drawing mode does not also close a dialog or
  // clear a search box on the page underneath.
  event.preventDefault();
  event.stopPropagation();
  stopManual();
}

/** Paint one stored mark onto the surface. */
function renderRegion(region: ManualRegion): void {
  if (!surface) return;

  const box = document.createElement('div');
  box.dataset['shieldRegion'] = region.id;
  // Drawn at the mark's CURRENT screen position: stored document coordinate
  // minus the scroll offset. The surface is viewport-anchored, so this is the
  // one place the two spaces meet, and `reposition` re-runs it on every scroll.
  Object.assign(box.style, {
    position: 'absolute',
    left: `${region.x - window.scrollX}px`,
    top: `${region.y - window.scrollY}px`,
    width: `${region.width}px`,
    height: `${region.height}px`,
    background: 'rgba(15, 23, 42, 0.82)',
    border: '2px solid #22d3ee',
    borderRadius: '3px',
    cursor: 'pointer',
    pointerEvents: 'auto',
  } satisfies Partial<CSSStyleDeclaration>);
  box.title = 'Click to remove this mark';

  // Removing a mark has to be as easy as making one. A drawing tool where a
  // mistake is permanent gets used once.
  box.addEventListener('mousedown', (event) => {
    event.preventDefault();
    event.stopPropagation();
    regions = regions.filter((candidate) => candidate.id !== region.id);
    box.remove();
    refreshHint();
  });

  surface.appendChild(box);
}

function renderAll(): void {
  if (!surface) return;
  for (const child of Array.from(surface.children)) {
    if (child instanceof HTMLElement && child.dataset['shieldRegion']) child.remove();
  }
  for (const region of regions) renderRegion(region);
  refreshHint();
}

/** Re-place every mark after the page has scrolled. */
function reposition(): void {
  if (!surface) return;
  for (const child of Array.from(surface.children)) {
    if (!(child instanceof HTMLElement)) continue;
    const id = child.dataset['shieldRegion'];
    if (!id) continue;
    const region = regions.find((candidate) => candidate.id === id);
    if (!region) continue;
    child.style.left = `${region.x - window.scrollX}px`;
    child.style.top = `${region.y - window.scrollY}px`;
  }
}

/** Say how many marks are set, so the count is never in doubt. */
function refreshHint(): void {
  const hint = surface?.querySelector<HTMLElement>(`#${SURFACE_ID}-hint`);
  if (!hint) return;
  hint.textContent =
    regions.length === 0
      ? 'Drag over anything you want hidden'
      : `${regions.length} area${regions.length === 1 ? '' : 's'} marked \u00b7 click a mark to remove it`;
}

/**
 * The bar across the top: what to do, and a way to run without leaving.
 *
 * The Run button is here rather than only in the popup because the popup must
 * close before you can draw — it holds focus, so the first drag would go to the
 * popup rather than the page. Marking and then running therefore meant opening
 * the popup a second time, which is a poor sequence for the one action the
 * marks were made for.
 */
function buildToolbar(): HTMLElement {
  const bar = document.createElement('div');
  Object.assign(bar.style, {
    position: 'fixed',
    left: '50%',
    top: '12px',
    transform: 'translateX(-50%)',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '7px 8px 7px 14px',
    borderRadius: '999px',
    background: '#0e7490',
    color: '#ecfeff',
    font: '600 12px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif',
    boxShadow: '0 2px 12px rgba(8, 47, 73, 0.4)',
    pointerEvents: 'auto',
    whiteSpace: 'nowrap',
  } satisfies Partial<CSSStyleDeclaration>);

  const text = document.createElement('span');
  text.id = `${SURFACE_ID}-hint`;
  text.textContent = 'Drag over anything you want hidden';
  text.style.pointerEvents = 'none';
  bar.appendChild(text);

  bar.appendChild(
    toolbarButton('Run Shield', '#ecfeff', '#0e7490', () => {
      // The surface comes down first. The worker hides it before capturing
      // anyway, but doing it here means the page is already clean when the
      // capture lands rather than relying on a message arriving in time.
      teardownSurface();
      // An empty query lets the worker reuse whatever the user last asked for,
      // so running from here does not silently change the task.
      void chrome.runtime.sendMessage({ type: MSG.RUN_TASK, taskQuery: '' });
    }),
  );

  bar.appendChild(
    toolbarButton('Done', 'transparent', '#ecfeff', () => {
      stopManual();
    }),
  );

  return bar;
}

function toolbarButton(
  label: string,
  background: string,
  color: string,
  onClick: () => void,
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  Object.assign(button.style, {
    padding: '5px 12px',
    border: background === 'transparent' ? '1px solid rgba(236, 254, 255, 0.5)' : '0',
    borderRadius: '999px',
    background,
    color,
    font: '650 12px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif',
    cursor: 'pointer',
    pointerEvents: 'auto',
  } satisfies Partial<CSSStyleDeclaration>);

  // Stops the drag handler on the surface underneath from reading this as the
  // start of a new mark.
  button.addEventListener('mousedown', (event) => event.stopPropagation());
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    onClick();
  });

  return button;
}

/**
 * Enter drawing mode.
 *
 * The surface is VIEWPORT-anchored — `position: fixed`, covering the screen —
 * while the marks it shows are stored in document space and re-placed on every
 * scroll.
 *
 * The obvious alternative, a document-sized `position: absolute` layer, was
 * built first and is wrong. An absolutely positioned element resolves against
 * its nearest positioned ancestor, and plenty of real pages set
 * `body { position: relative }`. On those, every mark is drawn in one place,
 * stored correctly, and displayed somewhere else entirely. Anchoring to the
 * viewport has no dependency on the page's CSS, which is the point: this has to
 * work on markup nobody wrote for us.
 */
export function startManual(): void {
  if (surface) {
    renderAll();
    return;
  }

  const container = document.createElement('div');
  container.id = SURFACE_ID;

  Object.assign(container.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '2147483646',
    cursor: 'crosshair',
    // Unlike the explainable overlay, this one DOES take events — that is its
    // entire purpose. It sits one below the maximum z-index so the explanation
    // still draws above it.
    pointerEvents: 'auto',
    background: 'transparent',
  } satisfies Partial<CSSStyleDeclaration>);

  container.appendChild(buildToolbar());

  container.addEventListener('mousedown', onMouseDown);
  document.addEventListener('keydown', onKeyDown, true);
  // Passive: this only reads the scroll position and moves our own elements.
  window.addEventListener('scroll', reposition, { passive: true, capture: true });

  surface = container;
  document.documentElement.appendChild(container);
  renderAll();
}

function onMouseDown(event: MouseEvent): void {
  if (!surface || event.button !== 0) return;
  event.preventDefault();

  // pageX/pageY are already document coordinates, which is the space marks are
  // stored in. Using clientX here would produce marks that drift by exactly the
  // scroll offset — the defect this module was written to avoid.
  const startX = event.pageX;
  const startY = event.pageY;

  const box = document.createElement('div');
  Object.assign(box.style, {
    position: 'absolute',
    left: `${startX}px`,
    top: `${startY}px`,
    width: '0px',
    height: '0px',
    background: 'rgba(34, 211, 238, 0.22)',
    border: '2px dashed #22d3ee',
    pointerEvents: 'none',
  } satisfies Partial<CSSStyleDeclaration>);

  surface.appendChild(box);
  drawing = { startX, startY, box };

  window.addEventListener('mousemove', onMouseMove, true);
  window.addEventListener('mouseup', onMouseUp, true);
}

function onMouseMove(event: MouseEvent): void {
  if (!drawing) return;
  const { startX, startY, box } = drawing;

  const x = Math.min(startX, event.pageX);
  const y = Math.min(startY, event.pageY);
  box.style.left = `${x}px`;
  box.style.top = `${y}px`;
  box.style.width = `${Math.abs(event.pageX - startX)}px`;
  box.style.height = `${Math.abs(event.pageY - startY)}px`;
}

function onMouseUp(event: MouseEvent): void {
  if (!drawing) return;
  const { startX, startY, box } = drawing;
  drawing = null;

  window.removeEventListener('mousemove', onMouseMove, true);
  window.removeEventListener('mouseup', onMouseUp, true);
  box.remove();

  const width = Math.abs(event.pageX - startX);
  const height = Math.abs(event.pageY - startY);

  // A stray click is not a mark. Without this every accidental click would add
  // a zero-area region, which redacts nothing and puts a meaningless entry in
  // the manifest — a manifest that overstates what was hidden is worse than a
  // short one.
  if (width < MIN_SIZE || height < MIN_SIZE) return;

  const region: ManualRegion = {
    id: `manual-${nextId++}`,
    x: Math.min(startX, event.pageX),
    y: Math.min(startY, event.pageY),
    width,
    height,
  };

  regions.push(region);
  renderRegion(region);
  refreshHint();
}

/** Leave drawing mode. The marks stay; only the drawing surface goes. */
export function stopManual(): void {
  teardownSurface();
}

/** Show or hide the surface without forgetting anything. */
export function setManualVisible(visible: boolean): void {
  if (visible) {
    startManual();
    return;
  }
  // Hidden rather than cleared, because the capture is about to be taken and a
  // cyan outline would be baked into the frame the model is shown — and into
  // the frame the user is told is a faithful record of what was sent.
  teardownSurface();
}

/** Discard every mark on this page. */
export function clearManual(): void {
  regions = [];
  renderAll();
}

export function manualRegionCount(): number {
  return regions.length;
}

/**
 * Clip document-space marks into viewport space. Pure, and separately testable.
 *
 * Split out from the function below because this arithmetic is the entire risk
 * in the feature and it fails the way coordinate bugs always fail — silently,
 * as a plausible rectangle over the wrong pixels. The explainable overlay made
 * exactly this mistake earlier the same day, and nothing caught it but a person
 * looking at a screenshot. A pure function can be tested against every case
 * that matters without a browser, a DOM, or a stubbed `window`.
 *
 * The capture only ever contains the viewport, so a mark scrolled out of sight
 * has nothing to cover and is dropped. One that straddles an edge is clipped
 * rather than dropped: the visible part IS in the frame and must be covered,
 * while passing the whole rectangle downstream would paint outside the image
 * and black out pixels the user never marked.
 */
export function clipToViewport(
  regions: readonly ManualRegion[],
  offsetX: number,
  offsetY: number,
  viewWidth: number,
  viewHeight: number,
): Rect[] {
  const visible: Rect[] = [];

  for (const region of regions) {
    const left = Math.max(region.x - offsetX, 0);
    const top = Math.max(region.y - offsetY, 0);
    const right = Math.min(region.x - offsetX + region.width, viewWidth);
    const bottom = Math.min(region.y - offsetY + region.height, viewHeight);

    if (right <= left || bottom <= top) continue;

    visible.push({ x: left, y: top, width: right - left, height: bottom - top });
  }

  return visible;
}

/** The marks in viewport coordinates. Reads the live scroll position. */
export function manualRegionsInViewport(): Rect[] {
  return clipToViewport(
    regions,
    window.scrollX,
    window.scrollY,
    window.innerWidth,
    window.innerHeight,
  );
}
