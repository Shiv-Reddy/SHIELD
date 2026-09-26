/**
 * DOM element map extraction — the second half of Screen Perception
 * (ARCHITECTURE.md 2.1).
 *
 * Walks the visible viewport and produces a structured description of what is
 * on screen: what each element is, where it sits, what it is labelled, and what
 * it contains. Two very different consumers depend on this being good:
 *
 *   - The PII Detector (Module B) reads `inputType`, `autocomplete`, `label`,
 *     `name` and `placeholder`
 *     to decide what is sensitive. DECISIONS.md makes DOM signals the primary
 *     detector, so anything missed here is likely missed entirely.
 *   - The reasoning model reads the redacted version of this to decide what to
 *     do, and the Action Executor uses `selector` to find the target again.
 *
 * Everything produced here is raw and unsafe to transmit — with one deliberate
 * exception, described at `readValue` below.
 */

import type { ExtractDomResult } from '../lib/messages';
import type { DomElement, ElementType, Rect, ViewportInfo } from '../lib/types';

/**
 * Cap on how many elements one snapshot describes.
 *
 * A large page can hold thousands of nodes, and sending all of them would cost
 * latency and payload for no benefit. Interactive elements are collected first
 * and are never dropped, so hitting this cap degrades context rather than
 * losing the button the task actually needs (see `extractDomMap`).
 */
const MAX_ELEMENTS = 300;

/** Values longer than this are truncated; this is a summary, not a transcript. */
const MAX_VALUE_LENGTH = 200;

/** Same, for labels and text content. */
const MAX_TEXT_LENGTH = 120;

/** Never walked: no visual presence, and nothing a task can act on. */
const SKIPPED_TAGS = new Set([
  'script',
  'style',
  'noscript',
  'template',
  'meta',
  'link',
  'title',
  'head',
]);

/** `input` types that are really buttons, and should be classified as such. */
const BUTTON_INPUT_TYPES = new Set(['submit', 'button', 'reset', 'image']);

/**
 * Elements whose direct text is worth capturing as a `text` region.
 *
 * `div` and the other generic containers are here because modern web apps put
 * their text straight into them. Found on a live HR product (the OrangeHRM
 * public demo): every employee row was `div` cells with the names as direct
 * text, none of it was examined, and the screenshot — which the model is sent
 * — showed every name unredacted. A wrapper whose text lives in its children
 * has no direct text, so it is still skipped; only the element that actually
 * holds the words is reported.
 */
const TEXT_TAGS = new Set([
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'p', 'label', 'span', 'li', 'td', 'th', 'legend', 'figcaption',
  'strong', 'em', 'small', 'dt', 'dd', 'summary', 'caption', 'output',
  'div', 'b', 'i', 'u', 'mark', 'time', 'abbr', 'cite', 'address', 'blockquote',
  'pre', 'code', 'section', 'article', 'header', 'footer', 'aside', 'nav', 'main',
  'font', 'center', 'big', 'sub', 'sup', 'ins', 'del', 'q', 's', 'bdi', 'data',
]);

const IMAGE_TAGS = new Set(['img', 'svg', 'canvas', 'video', 'picture']);

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function clamp(text: string, limit: number): string {
  const collapsed = collapseWhitespace(text);
  return collapsed.length > limit ? `${collapsed.slice(0, limit)}…` : collapsed;
}

// ---------------------------------------------------------------------------
// Visibility
// ---------------------------------------------------------------------------

function toRect(domRect: DOMRect): Rect {
  return {
    x: Math.round(domRect.left),
    y: Math.round(domRect.top),
    width: Math.round(domRect.width),
    height: Math.round(domRect.height),
  };
}

/** Does this box overlap the viewport at all? */
function intersectsViewport(rect: Rect, viewport: ViewportInfo): boolean {
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    rect.x < viewport.width &&
    rect.y < viewport.height &&
    rect.x + rect.width > 0 &&
    rect.y + rect.height > 0
  );
}

/**
 * Is the element actually rendered?
 *
 * `getComputedStyle` is the expensive part of the whole scan, so it runs only
 * for elements that already passed the much cheaper rectangle test.
 */
function isRendered(element: Element): boolean {
  const style = window.getComputedStyle(element);
  return (
    style.visibility !== 'hidden' &&
    style.display !== 'none' &&
    Number(style.opacity) !== 0
  );
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

function directText(element: Element): string {
  let text = '';
  for (const node of Array.from(element.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) text += node.nodeValue ?? '';
  }
  return collapseWhitespace(text);
}

/**
 * Map an element to the API_SPEC.md Section 3 vocabulary, or null to skip it.
 *
 * Links classify as `button` rather than `other`. The vocabulary has no
 * "link", and from the reasoning model's point of view what matters is that it
 * is a click target — calling a "Forgot password?" link `other` would hide a
 * legitimate next step during exactly the task we care most about.
 */
function classify(element: Element): ElementType | null {
  const tag = element.localName;

  if (tag === 'input') {
    const type = (element as HTMLInputElement).type.toLowerCase();
    if (type === 'hidden') return null;
    return BUTTON_INPUT_TYPES.has(type) ? 'button' : 'input';
  }

  if (tag === 'textarea' || tag === 'select') return 'input';
  if (element.getAttribute('contenteditable') === 'true') return 'input';

  if (tag === 'button') return 'button';
  if (tag === 'a' && element.hasAttribute('href')) return 'button';
  if (element.getAttribute('role') === 'button') return 'button';

  if (IMAGE_TAGS.has(tag)) return 'image';

  // Text regions only count when the element holds the text itself. Testing
  // direct children rather than `textContent` stops a wrapper and its child
  // from both being reported with the same string.
  if (TEXT_TAGS.has(tag) && directText(element).length > 0) return 'text';

  return null;
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

/**
 * Work out what this element is called.
 *
 * Ordered most to least authoritative. This matters more than it looks: for a
 * field with no `autocomplete` attribute, the label is the only thing telling
 * Module B that it holds a phone number, so a weak result here becomes a missed
 * detection later (PRD.md FR-06).
 */
/**
 * The `<label>` element bound to this control, if there is one.
 *
 * Split out from `resolveLabel` so the extraction pass can also ask which label
 * elements have already been consumed, and avoid reporting their text a second
 * time as a standalone region.
 */
function findLabelElement(element: Element): HTMLLabelElement | null {
  if (element.id) {
    const explicit = document.querySelector<HTMLLabelElement>(
      `label[for="${CSS.escape(element.id)}"]`,
    );
    if (explicit) return explicit;
  }
  return element.closest('label');
}

export function resolveLabel(element: Element): string | null {
  const ariaLabel = element.getAttribute('aria-label');
  if (ariaLabel) return clamp(ariaLabel, MAX_TEXT_LENGTH);

  const labelledBy = element.getAttribute('aria-labelledby');
  if (labelledBy) {
    const referenced = labelledBy
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent ?? '')
      .join(' ');
    if (collapseWhitespace(referenced)) return clamp(referenced, MAX_TEXT_LENGTH);
  }

  const labelElement = findLabelElement(element);
  if (labelElement?.textContent) return clamp(labelElement.textContent, MAX_TEXT_LENGTH);

  const placeholder = element.getAttribute('placeholder');
  if (placeholder) return clamp(placeholder, MAX_TEXT_LENGTH);

  const title = element.getAttribute('title');
  if (title) return clamp(title, MAX_TEXT_LENGTH);

  // Buttons and links are labelled by what they say.
  const tag = element.localName;
  if (tag === 'button' || tag === 'a' || element.getAttribute('role') === 'button') {
    const own = element.textContent;
    if (own && collapseWhitespace(own)) return clamp(own, MAX_TEXT_LENGTH);
  }

  if (tag === 'img') {
    const alt = element.getAttribute('alt');
    if (alt) return clamp(alt, MAX_TEXT_LENGTH);
  }

  // Last resort. `name="user_phone"` is a weak label but a strong PII hint, so
  // it is worth passing along rather than reporting nothing.
  const name = element.getAttribute('name');
  return name ? clamp(name, MAX_TEXT_LENGTH) : null;
}

/**
 * The header of the table column this element sits in, if it sits in one.
 *
 * The header row is the `<thead>`'s last row when there is one, else the
 * table's first row when it is made of `<th>` cells. Cells spanning columns
 * make the index a guess, so a table using `colspan` in its header is not read
 * at all — a wrong header is worse than none, since it would hide the wrong
 * column and leave the right one showing.
 */
export function columnHeaderOf(element: Element): string | null {
  const ariaCell = element.closest('[role="cell"], [role="gridcell"]');
  if (ariaCell) return ariaColumnHeaderOf(ariaCell);

  const cell = element.closest('td');
  if (!cell || !(cell instanceof HTMLTableCellElement)) return null;
  const table = cell.closest('table');
  if (!table) return null;
  const headerRow =
    table.tHead?.rows[table.tHead.rows.length - 1] ??
    (table.rows[0] && [...table.rows[0].cells].every((c) => c.localName === 'th') ? table.rows[0] : null);
  if (!headerRow || [...headerRow.cells].some((c) => c.colSpan > 1)) return null;
  const header = headerRow.cells[cell.cellIndex];
  return header ? headerText(header) : null;
}

/**
 * The same, for grids built from `div`s with ARIA roles, which is how most
 * component libraries draw a table. Cells are matched to headers by position
 * among their row's cells; a grid whose header count differs from the row's
 * cell count is not read, for the same reason `colspan` is not.
 */
function ariaColumnHeaderOf(cell: Element): string | null {
  const row = cell.closest('[role="row"]');
  const grid = cell.closest('[role="table"], [role="grid"], [role="treegrid"]');
  if (!row || !grid) return null;
  const cells = [...row.querySelectorAll('[role="cell"], [role="gridcell"]')].filter(
    (candidate) => candidate.closest('[role="row"]') === row,
  );
  const headerRow = grid.querySelector('[role="columnheader"]')?.closest('[role="row"]');
  if (!headerRow) return null;
  const headers = [...headerRow.querySelectorAll('[role="columnheader"]')];
  if (headers.length !== cells.length) return null;
  const header = headers[cells.indexOf(cell)];
  return header ? headerText(header) : null;
}

/**
 * A header's own words. Its direct text first, because component libraries
 * put sort menus and icons inside the header ("First Name" followed by a
 * hidden "Ascending Descending"), and those would stop the header matching.
 */
function headerText(header: Element): string | null {
  const own = directText(header) || collapseWhitespace(header.textContent ?? '');
  return own ? clamp(own, MAX_TEXT_LENGTH) : null;
}

// ---------------------------------------------------------------------------
// Values
// ---------------------------------------------------------------------------

/**
 * True when a field is unambiguously a password field.
 *
 * Kept narrow on purpose. This is not Module B's job and must not grow into it
 * — it covers only the two signals that admit no interpretation, so that the
 * general PII decision stays in one place where it can be tested.
 */
function isPasswordField(element: HTMLInputElement): boolean {
  if (element.type.toLowerCase() === 'password') return true;
  const autocomplete = (element.getAttribute('autocomplete') ?? '').toLowerCase();
  return autocomplete === 'current-password' || autocomplete === 'new-password';
}

/**
 * Read a field's contents, or deliberately decline to.
 *
 * Password values are never read. Not read-then-redacted — never read at all.
 *
 * The pipeline has no use for them: the Redaction Engine would replace the
 * value with `[PASSWORD]`, and API_SPEC.md Section 5 forbids the server from
 * ever sending a sensitive value back, so the Action Executor never needs one
 * either. Since nothing downstream wants it, the safest place for a real
 * password is inside the page, where it already is. A value that never enters
 * the extension's memory cannot leak from it, however badly a later stage is
 * written.
 *
 * `[has value]` is returned instead so the reasoning model can still tell a
 * filled field from an empty one.
 */
function readValue(element: Element): string | null {
  const tag = element.localName;

  if (tag === 'input') {
    const input = element as HTMLInputElement;
    const type = input.type.toLowerCase();

    if (isPasswordField(input)) return input.value.length > 0 ? '[has value]' : null;
    if (type === 'checkbox' || type === 'radio') return input.checked ? 'checked' : 'unchecked';

    return input.value ? clamp(input.value, MAX_VALUE_LENGTH) : null;
  }

  if (tag === 'textarea') {
    const textarea = element as HTMLTextAreaElement;
    return textarea.value ? clamp(textarea.value, MAX_VALUE_LENGTH) : null;
  }

  if (tag === 'select') {
    const select = element as HTMLSelectElement;
    const selected = select.selectedOptions[0];
    return selected ? clamp(selected.textContent ?? selected.value, MAX_VALUE_LENGTH) : null;
  }

  if (element.getAttribute('contenteditable') === 'true') {
    const text = element.textContent;
    return text ? clamp(text, MAX_VALUE_LENGTH) : null;
  }

  const text = directText(element);
  return text ? clamp(text, MAX_VALUE_LENGTH) : null;
}

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

/**
 * Can this element be addressed by `#id` alone?
 *
 * `getElementById` returns the first element with that id, which is exactly
 * what `querySelector('#id')` would resolve to — so this answers the real
 * question ("would that selector find *this* element?") rather than the
 * narrower one about whether the id is unique, and duplicate ids on a sloppy
 * page are handled correctly for free.
 *
 * It is also a hash lookup rather than a selector match, which matters: this
 * runs for every ancestor of every mapped element, so a `querySelectorAll` here
 * would mean thousands of selector evaluations per scan.
 */
function hasUniqueId(element: Element): boolean {
  return element.id.length > 0 && document.getElementById(element.id) === element;
}

/**
 * Build a selector that finds this element again later.
 *
 * The Action Executor re-resolves the target before acting (PRD.md FR-21), so
 * this needs to survive the page mutating a little between capture and action.
 * Unique IDs are preferred and stop the walk; otherwise the path is built from
 * tag names with `:nth-of-type` only where a tag repeats among siblings, which
 * stays stable when unrelated parts of the page change.
 *
 * Class names are deliberately not used: CSS-in-JS and utility frameworks
 * regenerate them, so they look specific while being the least durable thing
 * available.
 */
function buildSelector(element: Element): string {
  if (hasUniqueId(element)) return `#${CSS.escape(element.id)}`;

  const parts: string[] = [];
  let current: Element | null = element;

  // Walk all the way to the root unless an id anchors us sooner.
  //
  // This used to stop after eight levels to keep selectors short. On a shallow
  // page that is harmless; on a deeply nested application it is not, because
  // the result is not a shorter selector but a *different* one. A truncated
  // chain like `div > div > span > a` is a descendant match that querySelector
  // resolves against the first such element anywhere in the document — measured
  // at 38 of 158 elements failing to resolve back to themselves on a real page,
  // against 0 of 8 on the login fixture, which is why the fixture never showed
  // it.
  //
  // Walking to the root makes the path absolute, and every level carries an
  // nth-of-type index when it needs one, so the result is unique by
  // construction rather than by luck.
  while (current && current !== document.documentElement) {
    if (hasUniqueId(current)) {
      parts.unshift(`#${CSS.escape(current.id)}`);
      return parts.join(' > ');
    }

    const node: Element = current;
    let part = node.localName;
    const parent: HTMLElement | null = node.parentElement;

    if (parent) {
      const sameTag = Array.from(parent.children).filter(
        (sibling) => sibling.localName === node.localName,
      );
      if (sameTag.length > 1) part += `:nth-of-type(${sameTag.indexOf(node) + 1})`;
    }

    parts.unshift(part);
    current = parent;
  }

  // Anchored at the root element, so the path cannot match anything but the
  // chain it describes.
  parts.unshift('html');
  return parts.join(' > ');
}

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

interface Candidate {
  element: Element;
  elementType: ElementType;
  rect: Rect;
}

/** Interactive elements are collected first and never dropped by the cap. */
function isInteractive(elementType: ElementType): boolean {
  return elementType === 'input' || elementType === 'button';
}

export function extractDomMap(): ExtractDomResult {
  const viewport: ViewportInfo = {
    width: window.innerWidth,
    height: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio,
  };

  const interactive: Candidate[] = [];
  const passive: Candidate[] = [];
  let scanned = 0;

  // Counted, never collected. These are elements we would have described had
  // they been on screen, and the count is the only honest way to say how much
  // of the page this reading does not speak for — see lib/coverage.ts. Reading
  // them instead would widen what a run examines, which is a decision the scan
  // makes deliberately and a run must not make by accident.
  let offscreenElements = 0;

  for (const element of Array.from(document.body?.querySelectorAll('*') ?? [])) {
    if (SKIPPED_TAGS.has(element.localName)) continue;
    scanned += 1;

    const elementType = classify(element);
    if (!elementType) continue;

    const rect = toRect(element.getBoundingClientRect());
    if (!intersectsViewport(rect, viewport)) {
      // A zero-sized box is laid out nowhere and is not something we failed to
      // look at. `isRendered` is not consulted, because it is the expensive half
      // of this loop and running it on every off-screen node would make the scan
      // cost scale with the page rather than the screen — so a `visibility:
      // hidden` element does get counted. That is the safe direction: this
      // number may overstate what was missed and must never understate it.
      if (rect.width > 0 && rect.height > 0) offscreenElements += 1;
      continue;
    }
    if (!isRendered(element)) continue;

    (isInteractive(elementType) ? interactive : passive).push({
      element,
      elementType,
      rect,
    });
  }

  // Drop label elements whose text is already reported as a control's `label`.
  //
  // Without this, every labelled field appears twice — once as the input
  // carrying "Password", and again as a standalone text region saying
  // "Password". On a login form that is a quarter of the payload duplicated,
  // and on a signup form considerably more. Redundant context costs latency and
  // gives the reasoning model repeated material to misread.
  //
  // The text is compared rather than assumed: if a control's accessible name
  // came from `aria-label` and differs from the visible label, the visible text
  // carries information of its own and is kept.
  const consumedLabels = new Set<Element>();
  for (const candidate of interactive) {
    const labelElement = findLabelElement(candidate.element);
    if (!labelElement) continue;
    const resolved = resolveLabel(candidate.element);
    if (resolved && resolved === clamp(labelElement.textContent ?? '', MAX_TEXT_LENGTH)) {
      consumedLabels.add(labelElement);
    }
  }

  const remainingPassive = passive.filter(
    (candidate) => !consumedLabels.has(candidate.element),
  );

  // Interactive elements first, so that if anything is dropped it is background
  // text rather than the field or button the task depends on.
  const budget = Math.max(0, MAX_ELEMENTS - interactive.length);
  const chosen = [...interactive, ...remainingPassive.slice(0, budget)];

  // Chosen interactive-first, SENT in page order. The order is what tells the
  // model which text belongs with which button: with every button listed ahead
  // of every piece of text, "Release salary for EMP-0415" sat forty entries
  // away from the row that said "Ready", and on a queue page the lite model
  // matched statuses to the wrong rows. Priority decides what survives the
  // budget; it has no business deciding the reading order.
  const selected = chosen.sort((a, b) =>
    a.element === b.element
      ? 0
      : a.element.compareDocumentPosition(b.element) & Node.DOCUMENT_POSITION_FOLLOWING
        ? -1
        : 1,
  );

  // Which row, list item or card each element sits in, numbered in page order.
  // A flat list of elements loses the row structure a person sees at a glance,
  // and the model was matching a status in one row to a button in another.
  const rowNumbers = new Map<Element, number>();
  const rowOf = (element: Element): number | null => {
    const row = element.closest('tr, li, [role="row"], [role="listitem"], article');
    if (!row || row.closest('nav, header, footer')) return null;
    if (!rowNumbers.has(row)) rowNumbers.set(row, rowNumbers.size + 1);
    return rowNumbers.get(row) ?? null;
  };

  let unresolvedSelectors = 0;
  const elements: DomElement[] = selected.map((candidate, index) => {
    const selector = buildSelector(candidate.element);

    // Confirm the selector round-trips now, while the element is in hand. A
    // selector that cannot find its own element at capture time certainly will
    // not at action time, and it is far better to know that here than to
    // discover it while acting on the wrong element.
    let resolved = false;
    try {
      resolved = document.querySelector(selector) === candidate.element;
    } catch {
      resolved = false;
    }
    if (!resolved) unresolvedSelectors += 1;

    // `type` is read from `<select>` and `<textarea>` as well as `<input>`,
    // because those two are otherwise indistinguishable downstream: both arrive
    // as an `input` element with no type, and the detector has to tell them
    // apart. A textarea holds whatever the user typed; a select holds one of
    // the page author's own options and can hold nothing else. The DOM already
    // names them — "textarea", "select-one", "select-multiple" — so there is no
    // vocabulary to invent here.
    const typed = candidate.element as Partial<HTMLInputElement>;

    return {
      elementId: `e${index}`,
      elementType: candidate.elementType,
      selector,
      label: resolveLabel(candidate.element),
      value: readValue(candidate.element),
      inputType: typeof typed.type === 'string' ? typed.type.toLowerCase() : null,
      autocomplete: candidate.element.getAttribute('autocomplete'),
      // Author-written attributes, not user content. Many real forms carry no
      // usable label or autocomplete at all and name their fields only here, so
      // without these the rule engine is blind to them.
      name: candidate.element.getAttribute('name'),
      placeholder: candidate.element.getAttribute('placeholder'),
      columnHeader: candidate.elementType === 'text' ? columnHeaderOf(candidate.element) : null,
      row: rowOf(candidate.element),
      position: candidate.rect,
    };
  });

  return {
    elements,
    // Client-side only. Never added to the request schema in API_SPEC.md — a
    // URL alone can identify a person or an internal system.
    pageUrl: window.location.href,
    viewport,
    coverage: {
      documentHeight: documentHeight(),
      viewportHeight: viewport.height,
      scrollY: Math.round(window.scrollY),
      offscreenElements,
    },
    scanned,
    truncated: remainingPassive.length > budget,
    unresolvedSelectors,
  };
}

/**
 * The full scrollable height of the document.
 *
 * Four sources, maximum taken, because no single one is right everywhere: which
 * of `documentElement` and `body` actually scrolls depends on the page's own CSS
 * — a `height: 100%` on either moves the overflow to the other — and a page
 * that sizes itself with transforms reports a larger `offsetHeight` than
 * `scrollHeight`. Reading the wrong one understates the page, and understating
 * it is what would make Shield claim it examined more than it did.
 */
export function documentHeight(): number {
  const root = document.documentElement;
  const body = document.body;

  return Math.max(
    root?.scrollHeight ?? 0,
    root?.offsetHeight ?? 0,
    body?.scrollHeight ?? 0,
    body?.offsetHeight ?? 0,
    window.innerHeight,
  );
}
