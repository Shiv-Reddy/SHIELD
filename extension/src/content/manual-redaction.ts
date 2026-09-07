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
  Object.assign(box.style, {
    position: 'absolute',
    left: `${region.x}px`,
    top: `${region.y}px`,
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
  });

  surface.appendChild(box);
}

function renderAll(): void {
  if (!surface) return;
  for (const child of Array.from(surface.children)) {
    if (child instanceof HTMLElement && child.dataset['shieldRegion']) child.remove();
  }
  for (const region of regions) renderRegion(region);
}

/**
 * Enter drawing mode.
 *
 * The surface spans the whole document rather than the viewport, so a mark can
 * be drawn, the page scrolled, and another drawn, without the first moving.
 */
export function startManual(): void {
  if (surface) {
    renderAll();
    return;
  }

  const container = document.createElement('div');
  container.id = SURFACE_ID;

  Object.assign(container.style, {
    position: 'absolute',
    left: '0',
    top: '0',
    width: `${Math.max(document.documentElement.scrollWidth, window.innerWidth)}px`,
    height: `${Math.max(document.documentElement.scrollHeight, window.innerHeight)}px`,
    zIndex: '2147483646',
    cursor: 'crosshair',
    // Unlike the explainable overlay, this one DOES take events — that is its
    // entire purpose. It sits one below the maximum z-index so the explanation
    // still draws above it.
    pointerEvents: 'auto',
    background: 'transparent',
  } satisfies Partial<CSSStyleDeclaration>);

  const hint = document.createElement('div');
  hint.textContent = 'Drag to hide an area · click a mark to remove it · Esc when done';
  Object.assign(hint.style, {
    position: 'fixed',
    left: '50%',
    top: '12px',
    transform: 'translateX(-50%)',
    padding: '6px 12px',
    borderRadius: '999px',
    background: '#0e7490',
    color: '#ecfeff',
    font: '600 12px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif',
    pointerEvents: 'none',
    whiteSpace: 'nowrap',
  } satisfies Partial<CSSStyleDeclaration>);
  container.appendChild(hint);

  container.addEventListener('mousedown', onMouseDown);
  document.addEventListener('keydown', onKeyDown, true);

  surface = container;
  document.body.appendChild(container);
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
