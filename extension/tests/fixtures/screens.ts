/**
 * Element maps for the test screens, as the content script would report them.
 *
 * WHAT THESE ARE, PRECISELY
 *
 * Each entry is the `DomElement[]` that `dom-map.ts` produces for one page in
 * `test-screens/`, hand-derived from that page's markup. They exist so the
 * detection -> redaction -> payload chain can be exercised against every screen
 * on every `npm test`, rather than only when somebody remembers to open Chrome.
 *
 * WHAT THEY ARE NOT
 *
 * They do not test `dom-map.ts`. Extraction needs a real browser — layout,
 * visibility, computed labels, selector round-tripping — and a fixture that
 * re-implemented that logic in Node would be testing the re-implementation.
 * Everything downstream of the element map is real code running on real input;
 * everything upstream is assumed correct, and is covered by the manual runs
 * recorded in TASKS.md.
 *
 * The obvious hazard is drift: a screen changes, these maps do not, and the
 * suite goes on passing against a page that no longer exists. `integration.test`
 * guards against that by reading the HTML and checking that every form control
 * in it appears here and vice versa — cheap, and it catches the case that
 * actually happens.
 *
 * Positions are plausible rather than measured. Nothing downstream of detection
 * decides anything from them except the redaction canvas, which has its own
 * tests; a fixture that claimed measured pixel values it never measured would be
 * worse than one that admits they are illustrative.
 */

import type { DomElement } from '../../src/lib/types';

function element(overrides: Partial<DomElement> & { elementId: string }): DomElement {
  return {
    elementType: 'input',
    selector: `html > body #${overrides.elementId}`,
    label: null,
    value: null,
    inputType: 'text',
    autocomplete: null,
    name: null,
    placeholder: null,
    position: { x: 0, y: 0, width: 240, height: 32 },
    ...overrides,
  };
}

function text(elementId: string, value: string): DomElement {
  return element({
    elementId,
    elementType: 'text',
    inputType: null,
    value,
    position: { x: 0, y: 0, width: 400, height: 20 },
  });
}

function button(elementId: string, label: string): DomElement {
  return element({
    elementId,
    elementType: 'button',
    inputType: null,
    label,
    position: { x: 0, y: 0, width: 120, height: 36 },
  });
}

/** Screen 1 — the login form the primary demo runs on. */
export const SCREEN_1_LOGIN: DomElement[] = [
  text('e0', 'Acme Internal Portal'),
  text('e1', 'Sign in to continue to your dashboard.'),
  element({
    elementId: 'e2',
    label: 'Username',
    name: 'username',
    autocomplete: 'username',
    value: 'demo.user@example.com',
  }),
  element({
    elementId: 'e3',
    label: 'Password',
    name: 'password',
    inputType: 'password',
    autocomplete: 'current-password',
    // What the content script records for a password field. It never reads the
    // string itself, so this sentinel is what the rest of the pipeline sees.
    value: '[has value]',
  }),
  element({
    elementId: 'e4',
    label: 'Keep me signed in',
    name: 'remember',
    inputType: 'checkbox',
    value: 'checked',
  }),
  button('e5', 'Forgot password?'),
  button('e6', 'Sign in'),
  text('e7', 'Synthetic test fixture. Not a real service, not real credentials.'),
];

/** Screen 2 — the multi-field signup form. */
export const SCREEN_2_SIGNUP: DomElement[] = [
  text('e0', 'Create your account'),
  element({
    elementId: 's1',
    label: 'First name',
    name: 'first_name',
    autocomplete: 'given-name',
    value: 'Rohan',
  }),
  element({
    elementId: 's2',
    label: 'Last name',
    name: 'last_name',
    autocomplete: 'family-name',
    value: 'Mehra',
  }),
  element({
    elementId: 's5',
    label: 'Date of birth',
    name: 'dob',
    inputType: 'date',
    value: '1998-04-17',
  }),
  element({
    elementId: 's3',
    label: 'Email address',
    name: 'email',
    inputType: 'email',
    autocomplete: 'email',
    value: 'rohan.mehra@example.com',
  }),
  element({
    elementId: 's4',
    label: 'Mobile number',
    name: 'mobile',
    inputType: 'tel',
    autocomplete: 'tel',
    value: '+91 98200 11223',
  }),
  element({
    elementId: 's6',
    label: 'Street address',
    name: 'address1',
    autocomplete: 'street-address',
    value: '14 Marine Lines, Flat 3B',
  }),
  element({
    elementId: 's7',
    name: 'pc',
    placeholder: 'Postal code',
    value: '400020',
  }),
  element({
    elementId: 's10',
    name: 'national_id_number',
    value: 'ABCDE1234F',
  }),
  element({
    elementId: 's11',
    label: 'Display name',
    name: 'display_name',
    placeholder: 'Shown on your profile',
    value: null,
  }),
  element({
    elementId: 's8',
    label: 'Password',
    name: 'password',
    inputType: 'password',
    autocomplete: 'new-password',
    value: '[has value]',
  }),
  element({
    elementId: 's9',
    label: 'Confirm password',
    name: 'password_confirm',
    inputType: 'password',
    autocomplete: 'new-password',
    value: '[has value]',
  }),
  element({
    elementId: 's12',
    label: 'How did you hear about us?',
    name: 'referral',
    // A `<select>` maps to `input`, with the DOM's own type name, and its
    // value is the selected option's text.
    inputType: 'select-one',
    value: 'A friend',
  }),
  element({
    elementId: 's13',
    label: 'I accept the terms of service and privacy policy',
    name: 'terms',
    inputType: 'checkbox',
    value: 'unchecked',
  }),
  element({
    elementId: 's14',
    label: 'Send me occasional product updates',
    name: 'marketing',
    inputType: 'checkbox',
    value: 'unchecked',
  }),
  button('e-submit', 'Create account'),
];

/** Screen 4 — the clean control page. Correct answer: nothing. */
export const SCREEN_4_CLEAN: DomElement[] = [
  text('e0', 'Release notes'),
  // The line that broke the first phone pattern.
  text('e1', 'Copyright 2024-2025 Acme Corp. Last updated 12-03-2025.'),
  text(
    'e2',
    'This release improves rendering performance and fixes several issues ' +
      'reported since the previous version. Nothing on this page is personal data.',
  ),
  element({
    elementId: 'e3',
    name: 'q',
    inputType: 'search',
    placeholder: 'Search the notes',
    value: null,
  }),
  button('e4', 'Search'),
  text('e5', '4.2.1 10240 2025-03-12'),
  text('e6', '4.2.0 10188 2025-02-28'),
  text(
    'e7',
    'Rendering changes are described in sections 100-200. Pricing moved from ' +
      '1,200 to 4,500 units per tier. Reference 1234-5678 covers the migration.',
  ),
  element({
    elementId: 'e8',
    label: 'Send me release announcements',
    name: 'newsletter',
    inputType: 'checkbox',
    value: 'unchecked',
  }),
];

/** Screen 5 — the adversarial screen, meant to be partly failed. */
export const SCREEN_5_ADVERSARIAL: DomElement[] = [
  // 1 — masked but not type=password. Only the label and name say so.
  element({
    elementId: 'c1',
    label: 'Password',
    name: 'password',
    value: 'not-a-real-password-1234',
  }),
  // 2 — a real password with nothing at all identifying it.
  element({
    elementId: 'c2',
    name: 'field_7',
    value: 'not-a-real-password-5678',
  }),
  // 3 — an email address rendered as ordinary text.
  text('t3', 'Account contact: casey.tan@example.com'),
  // 4 — a person's name in prose. Expected miss (SECURITY_PRIVACY.md 4.1).
  text('t4', 'Account holder: Priya Raghunathan'),
  // 5 — formatted identifiers in text.
  text('t5', 'PAN ABCDE1234F · Account 402711558903'),
  // 6 — an ID inside an image. Expected miss; the OCR pass is deferred.
  element({
    elementId: 't6',
    elementType: 'image',
    inputType: null,
    label: 'Scanned identity card',
    position: { x: 0, y: 0, width: 230, height: 46 },
  }),
  // 7 — the attribute is wrong: declared a nickname, holds an email.
  element({
    elementId: 'c7',
    label: 'Display name',
    autocomplete: 'nickname',
    value: 'casey.tan@example.com',
  }),
  // 8 — the false-positive control. Must not be flagged.
  text('t8', 'Invoice 2024-2025 · Sections 100-200 · Build 10240'),
];
