/**
 * Capturing a real page as a labellable element map — TASKS.md T1.1.
 *
 * WHY THIS EXISTS
 *
 * The corpus was four pages, all written by us, and the obstacle to growing it
 * was never the labelling. It was that there was no way to get a real page's
 * `DomElement[]` out of the browser at all. A benchmark whose every page was
 * authored by the people being measured proves less than it appears to, and
 * `source` is reported per page precisely so that fact stays visible.
 *
 * WHY THE VALUES ARE NOT SANITISED
 *
 * Sanitising was the first instinct and it is wrong here. Verhoeff runs on the
 * actual digits, the Aadhaar rule reads the leading digit, and the phone rule
 * counts them. Replace a number with a shape skeleton and every figure computed
 * from that page describes a page that does not exist. A corpus is evidence
 * only if it is the real input — see DECISIONS.md 171.
 *
 * So the risk is answered where it lives: in who can trigger this, and in what
 * they are shown before a file exists.
 *
 *   1. `__SHIELD_DEV__`. Compiled to `false` unless the build sets SHIELD_DEV=1,
 *      so a shipped extension carries no reachable path to any of this.
 *   2. Review before save. `reviewableValues` lists every value the file would
 *      contain, and the popup will not produce one until that list has been
 *      shown and confirmed. The payload inspector's argument on a second
 *      surface: the defence against a leak is being shown the contents, not a
 *      promise about them.
 *   3. No URL, for the reason DECISIONS.md 148 gives for the audit log — a URL
 *      alone identifies a person or an internal system.
 *
 * The remaining rule, that captures are taken from logged-out or synthetic-data
 * pages, is discipline. It is written down as discipline rather than dressed up
 * as a guarantee, because a heuristic for "is this person logged in" fails open
 * and a safety claim that fails open is not one.
 *
 * Nothing here reaches `transport/`. There is no code path from this module to
 * a request, which is the same structural argument the scan path rests on.
 */

import type { DomElement } from '../types';

/** What the popup hands over: an EXTRACT_DOM response, minus what must not travel. */
export interface CapturedMap {
  elements: readonly DomElement[];
  /** Present for the operator's own orientation while reviewing. Never exported. */
  pageUrl?: string;
}

export interface MapExport {
  /** Stamped so a file found later can be told apart from a corpus entry. */
  kind: 'shield-element-map';
  capturedAt: string;
  /** Free text the operator types: what page this is. Becomes `about` in the corpus. */
  about: string;
  note: string;
  elements: DomElement[];
}

/** One value the export would carry, for the operator to look at before it exists. */
export interface ReviewableValue {
  elementId: string;
  /** Whatever the page gives us to recognise the field by. */
  field: string;
  value: string;
}

/**
 * Values a password field reports are already a sentinel, not the secret.
 *
 * `dom-map.ts` never reads `HTMLInputElement.value` for a password field; it
 * records that one is present. Repeated here as a named constant rather than
 * assumed, because this module's whole job is to be exact about what it emits.
 */
export const PASSWORD_SENTINEL = '[has value]';

/**
 * Every value the export would contain, in the order the operator will read it.
 *
 * Empty and whitespace-only values are dropped: they carry nothing and padding
 * the list with them is how a review becomes a formality that gets skipped.
 */
export function reviewableValues(elements: readonly DomElement[]): ReviewableValue[] {
  const listed: ReviewableValue[] = [];

  for (const element of elements) {
    const value = element.value?.trim();
    if (!value) continue;
    if (value === PASSWORD_SENTINEL) continue;

    listed.push({
      elementId: element.elementId,
      field: element.label ?? element.name ?? element.placeholder ?? element.elementType,
      value,
    });
  }

  return listed;
}

/**
 * The file, as a string. Pure, so what it contains is testable.
 *
 * `pageUrl` is dropped by construction rather than by remembering to omit it:
 * the elements are copied field by field, so a field added to `DomElement`
 * later cannot silently start travelling in this file.
 */
export function mapExportJson(captured: CapturedMap, about: string): string {
  const payload: MapExport = {
    kind: 'shield-element-map',
    capturedAt: new Date().toISOString(),
    about,
    note:
      // Plain ASCII, for the reason DECISIONS.md 156 gives: this file is opened
      // by whatever the reader has to hand.
      'Element map captured for the Shield benchmark corpus. Field values are ' +
      'verbatim - capture only from logged-out or synthetic-data pages. No URL ' +
      'is recorded.',
    elements: captured.elements.map((element) => ({
      elementId: element.elementId,
      elementType: element.elementType,
      selector: element.selector,
      label: element.label,
      value: element.value,
      inputType: element.inputType,
      autocomplete: element.autocomplete,
      name: element.name,
      placeholder: element.placeholder,
      position: element.position,
    })),
  };

  return JSON.stringify(payload, null, 2);
}

/**
 * A filename that says what the file is without saying where it came from.
 *
 * Deliberately carries no hostname. A corpus file sits in a repository and gets
 * looked at by people who were not there when it was captured, and a filename
 * is the one part of a file that survives being moved.
 */
export function mapExportFilename(at: Date = new Date()): string {
  return `shield-element-map-${at.toISOString().replace(/[:.]/g, '-')}.json`;
}
