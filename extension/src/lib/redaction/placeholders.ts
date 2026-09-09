/**
 * Semantic placeholder tokens for DOM values.
 *
 * The point of a placeholder rather than a blank is that the reasoning model
 * still needs to understand the page. "Type the password into this field" is
 * an instruction it can only produce if it knows the field holds a password —
 * so the redaction has to remove the value while preserving the meaning. A
 * blanked field tells it nothing; `[PASSWORD]` tells it everything it needs and
 * nothing it must not have.
 *
 * This is the difference between Shield and a blind blur, and it is one of the
 * differentiators listed in TASKS.md.
 *
 * Pure: no Chrome APIs, no canvas, no I/O.
 */

import { CONTENT_PATTERNS, phoneMatchIsCredible } from '../pii/dom-rules';
import { findIndianIds } from '../pii/indian-ids';
import type {
  DomElement,
  RedactedDomEntry,
  RedactionManifestEntry,
  SensitiveCategory,
  SensitiveRegion,
} from '../types';

/**
 * The token substituted for each category.
 *
 * Uppercase and bracketed so they are unmistakable in a prompt: a model reading
 * `[EMAIL]` cannot confuse it for a value someone actually typed, which is what
 * makes the substitution safe to describe to the model in the system prompt.
 */
const PLACEHOLDER: Readonly<Record<SensitiveCategory, string>> = {
  password: '[PASSWORD]',
  name: '[NAME]',
  email: '[EMAIL]',
  phone: '[PHONE]',
  address: '[ADDRESS]',
  id_number: '[ID_NUMBER]',
  face: '[FACE]',
  // Deliberately not '[UNKNOWN]'. The category records that Shield could not
  // identify the field; the token tells the model something was removed. Those
  // are different statements and only the second one is useful downstream.
  other: '[REDACTED]',
};

/** The placeholder for a category. */
export function placeholderFor(category: SensitiveCategory): string {
  return PLACEHOLDER[category];
}

/**
 * Replace sensitive values with tokens, producing the transmittable summary.
 *
 * Every element in, every element out: elements that were never flagged keep
 * their value, because the model needs the page's non-sensitive content to do
 * anything useful. What leaves is the value of every flagged element, with no
 * partial exposure — no last-four-digits, no first-letter, no length hint.
 * SECURITY_PRIVACY.md Section 4 requires full replacement for passwords and the
 * same treatment is applied to every category, since partial exposure of an
 * email or a phone number is just a slower leak.
 */
/**
 * Replace every sensitive-looking value inside a string with its token.
 *
 * WHY THIS EXISTS. `RedactedDomEntry` carries a `label` as well as a `value`,
 * and until this was written the label went out verbatim on every path - never
 * scanned, never redacted. On our own fixtures that was invisible, because a
 * fixture's labels are things like "Email address". On real pages an accessible
 * name is routinely the content itself: a link whose text is the account
 * address, an `aria-label` reading "Account: someone@example.com". Those went to
 * the server intact, which is the one thing this project promises cannot happen.
 *
 * It surfaced by luck rather than by design. A live page happened to put the
 * same address in both a flagged value and a label, and the zero-leak sweep -
 * which searches the whole payload rather than only the places it expects -
 * refused the transmission. Had that address appeared ONLY in the label,
 * nothing in the pipeline would have looked at it.
 *
 * Substring replacement rather than discarding the string: a label is how the
 * reasoning model tells one control from another, and "Account: [EMAIL]" keeps
 * that while "[EMAIL]" alone throws it away. The words around the value were
 * never the sensitive part.
 */
export function scrubTextContent(text: string): string {
  let scrubbed = text;

  // Indian identifiers first, and this is not merely for a better label.
  //
  // The classifier and this scrubber are two separate paths over the same text.
  // The classifier flags an element and its VALUE is tokenised; this scrubs
  // free text, including labels. An identifier the classifier now recognises
  // but the scrubber does not would be hidden in the value and transmitted in
  // the label — which is exactly the defect found on a real site earlier, where
  // an account address rode out inside a label no field rule could see.
  //
  // Replaced longest-first so a span is never half-substituted by an overlap.
  for (const match of findIndianIds(scrubbed).sort(
    (a, b) => b.value.length - a.value.length,
  )) {
    scrubbed = scrubbed.split(match.value).join(placeholderFor('id_number'));
  }

  for (const [category, pattern] of CONTENT_PATTERNS) {
    // A fresh global copy per call. The source patterns are non-global and
    // shared with the classifier, and advancing their lastIndex here would
    // corrupt detection in a way that only shows up on the second call.
    const global = new RegExp(pattern.source, pattern.flags + 'g');

    scrubbed = scrubbed.replace(global, (match) =>
      category === 'phone' && !phoneMatchIsCredible(match)
        ? match
        : placeholderFor(category),
    );
  }

  return scrubbed;
}

export function redactDomElements(
  elements: readonly DomElement[],
  regions: readonly SensitiveRegion[],
): RedactedDomEntry[] {
  const categoryByElement = new Map<string, SensitiveCategory>();
  for (const region of regions) {
    if (region.elementId === null) continue;

    // An element can be flagged more than once. The first region wins, which is
    // the stronger rule: detectDomPii reports at most one hit per element, so a
    // second can only come from another detector agreeing it is sensitive.
    if (!categoryByElement.has(region.elementId)) {
      categoryByElement.set(region.elementId, region.category);
    }
  }

  return elements.map((element) => {
    const category = categoryByElement.get(element.elementId);

    return {
      elementId: element.elementId,
      elementType: element.elementType,
      // Scrubbed, not passed through. See scrubTextContent: a label can carry
      // the value itself rather than a description of it.
      label: element.label === null ? null : scrubTextContent(element.label),
      // A flagged element with no value still yields its token rather than
      // null: an empty password box and an unflagged one look identical
      // otherwise, and the model should know a password belongs here.
      value: category ? placeholderFor(category) : element.value,
      // Read from the raw element, before the token replaced its value. The
      // password reader in dom-map.ts returns '[has value]' rather than the
      // password itself, so even this check never touches the real string.
      filled: element.value !== null && element.value !== '',
      position: element.position,
    };
  });
}

/**
 * Build the audit record of what was redacted and how.
 *
 * Mirrored to the server and to the trust UI. Carries categories and methods
 * only — never a value, never a reason string that might quote one.
 * SECURITY_PRIVACY.md Section 5 is explicit that an audit trail must not become
 * a second store of the data it describes.
 */
export function buildManifest(
  regions: readonly SensitiveRegion[],
): RedactionManifestEntry[] {
  return regions.map((region) => ({
    regionId: region.regionId,
    category: region.category,
    // The detector that found it is also the method used to hide it: DOM
    // detections become token substitutions, visual detections become painted
    // regions. `manual` is both at once — a mark paints its rectangle and
    // tokenises every element under it — and it stays a distinct method rather
    // than being folded into one of the others, because "a person decided this
    // is private" is a different claim from "a pattern matched" and an audit
    // record that conflated them would be lying about provenance.
    method: region.source,
  }));
}
