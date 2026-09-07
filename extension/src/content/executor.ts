/**
 * Action executor — the only code that modifies the page.
 *
 * Everything here runs on an instruction that came from a server, so the guiding
 * assumption is that the instruction may be wrong, stale, or hostile.
 * SECURITY_PRIVACY.md's spoofing row requires the target to be re-verified
 * against the captured context before anything happens, and its
 * elevation-of-privilege row fixes the vocabulary to click, type and scroll.
 *
 * Both are enforced here rather than trusted from upstream. The server checks
 * the allowlist, the transport layer checks it again, and this checks it a third
 * time — because this is the only one of the three that is standing next to the
 * user's actual page.
 */

import { isAllowedAction, type ShieldAction } from '../lib/types';
import { resolveLabel } from './dom-map';

/**
 * A page can change between capture and action.
 *
 * The gap is small — a network round trip — but not zero, and a page that
 * re-renders in it can move a button under the cursor. Re-verification closes
 * the window that ARCHITECTURE.md Section 2.5 and the threat model both name.
 */
export interface ExecuteRequest {
  action: ShieldAction;
  /** The selector recorded at capture time for the element the action names. */
  expectedSelector: string;
  /** What the element was at capture time, for re-verification. */
  expectedType: string;
  expectedLabel: string | null;
  /** Resolved locally. Never arrives from the server. */
  typeValue: string | null;
}

export interface ExecuteResult {
  ok: boolean;
  /** Safe to show the user; never contains page content. */
  message: string;
}

function isVisible(element: Element): boolean {
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;

  const style = window.getComputedStyle(element);
  return (
    style.visibility !== 'hidden' &&
    style.display !== 'none' &&
    Number(style.opacity) > 0.01
  );
}

/**
 * Find the target and confirm it is still what we captured.
 *
 * Identity is checked three ways: the selector resolves, the element type still
 * matches, and the accessible label still matches. Any one of them alone is weak
 * — a re-rendered page can easily produce a different button at the same path —
 * and the combination is what makes "this is the element we meant" a claim
 * rather than a hope.
 */
function resolveTarget(request: ExecuteRequest): Element | ExecuteResult {
  let element: Element | null = null;
  try {
    element = document.querySelector(request.expectedSelector);
  } catch {
    return { ok: false, message: 'Shield could not understand where to act on this page.' };
  }

  if (!element) {
    return {
      ok: false,
      message: 'The page changed before Shield could act, so nothing was done.',
    };
  }

  if (!isVisible(element)) {
    return {
      ok: false,
      message: 'The target is no longer visible on the page, so nothing was done.',
    };
  }

  const currentType = element.localName === 'input' ? 'input' : element.localName;
  const expected = request.expectedType;
  const typeMatches =
    expected === 'input'
      ? ['input', 'textarea', 'select'].includes(currentType)
      : expected === 'button'
        ? ['button', 'a'].includes(currentType) ||
          element.getAttribute('role') === 'button' ||
          (element.localName === 'input' &&
            ['submit', 'button'].includes((element as HTMLInputElement).type))
        : true;

  if (!typeMatches) {
    return {
      ok: false,
      message: 'The page changed before Shield could act, so nothing was done.',
    };
  }

  // The label check, using the same resolver the capture used, so the two
  // strings are produced the same way and a mismatch means the element really
  // changed rather than the comparison being unfair.
  //
  // Only enforced when a label was captured. Many legitimate targets have none,
  // and refusing to act on all of them would trade a real capability for no
  // additional safety — the selector and type checks still apply.
  if (request.expectedLabel !== null) {
    const currentLabel = resolveLabel(element);
    if (currentLabel !== request.expectedLabel) {
      return {
        ok: false,
        message: 'The page changed before Shield could act, so nothing was done.',
      };
    }
  }

  return element;
}

/** Type into a field the way a person would, so the page's own handlers run. */
function typeInto(element: Element, value: string): ExecuteResult {
  if (
    !(element instanceof HTMLInputElement) &&
    !(element instanceof HTMLTextAreaElement)
  ) {
    return { ok: false, message: 'Shield can only type into a text field.' };
  }

  element.focus();

  // Set through the native setter rather than the property.
  //
  // Frameworks that track their own state — React among them — patch the value
  // property on the instance and will not see a plain assignment, so the field
  // shows the text while the framework still believes it is empty. Submitting
  // then sends nothing. Going through the prototype's setter and dispatching the
  // events a real keystroke produces is what makes the change real to the page
  // rather than only visible.
  const prototype =
    element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;

  if (setter) {
    setter.call(element, value);
  } else {
    element.value = value;
  }

  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));

  return { ok: true, message: 'Filled the field.' };
}

function click(element: Element): ExecuteResult {
  if (!(element instanceof HTMLElement)) {
    return { ok: false, message: 'The target cannot be clicked.' };
  }

  element.focus({ preventScroll: true });
  element.click();
  return { ok: true, message: 'Clicked.' };
}

/**
 * Scroll the page.
 *
 * The selector names what to bring into view. Scrolling to an element rather
 * than by a pixel amount keeps the action meaningful across window sizes, and
 * means the assistant never needs to reason in pixels about a screen it cannot
 * measure.
 */
function scrollTo(element: Element): ExecuteResult {
  element.scrollIntoView({ behavior: 'auto', block: 'center' });
  return { ok: true, message: 'Scrolled.' };
}

/**
 * Execute one validated action.
 *
 * The value typed is `request.typeValue`, resolved on this machine. The value
 * carried by the server's action is deliberately ignored — API_SPEC.md Section 5
 * says it is never a sensitive value, and the way to guarantee that is to never
 * take one from it.
 */
export function executeAction(request: ExecuteRequest): ExecuteResult {
  // The third allowlist check. Redundant by design: this is the one standing
  // next to the page.
  if (!isAllowedAction(request.action.type)) {
    return { ok: false, message: 'Shield refused an action it does not allow.' };
  }

  const target = resolveTarget(request);
  if (!(target instanceof Element)) return target;

  switch (request.action.type) {
    case 'click':
      return click(target);

    case 'type': {
      if (request.typeValue === null) {
        return {
          ok: false,
          message: 'Shield had nothing to fill in here, so nothing was typed.',
        };
      }
      return typeInto(target, request.typeValue);
    }

    case 'scroll':
      return scrollTo(target);
  }
}
