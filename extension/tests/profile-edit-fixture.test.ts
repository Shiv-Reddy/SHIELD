/**
 * The DOM half of 06-profile-edit.html's predictions, checked before the run.
 *
 * WHY THIS IS A TEST AND NOT A NOTE IN THE FIXTURE
 *
 * The fixture states what each field should come back as, written before the
 * page was ever opened. Most of that is decidable right here — the rules are
 * pure functions over element descriptions, and the browser adds nothing to
 * them. Waiting for a Chrome run to discover that a prediction was wrong wastes
 * the one resource this project is short of, which is browser time on a human's
 * machine.
 *
 * What CANNOT be checked here, and is genuinely left for the browser: the face
 * (a model over pixels), the reasoner's action sequence, the re-capture on step
 * two, and the repeat refusal. Those are the fixture's real subject. This
 * removes the part that was never in doubt so that a failed run means something.
 *
 * WHERE THE ELEMENTS COME FROM
 *
 * Hand-written to match the markup, field for field. That is a transcription
 * and transcriptions drift, so the last test reads the fixture file and checks
 * that every input in it is represented here — otherwise a field added to the
 * page would silently go untested while this file kept passing.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { detectDomPii } from '../src/lib/pii/dom-rules';
import type { DomElement } from '../src/lib/types';

const FIXTURE = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'test-screens',
  '06-profile-edit.html',
);

/** Position is irrelevant to the DOM rules; one rectangle serves for all. */
const AT: DomElement['position'] = { x: 0, y: 0, width: 200, height: 32 };

function field(partial: Partial<DomElement> & { elementId: string }): DomElement {
  return {
    elementType: 'input',
    selector: `#${partial.elementId}`,
    label: null,
    value: null,
    inputType: null,
    autocomplete: null,
    name: null,
    placeholder: null,
    position: AT,
    ...partial,
  };
}

/** The page, as dom-map.ts would report it. */
const PAGE: DomElement[] = [
  field({
    elementId: 'full-name',
    label: 'Full name',
    name: 'fullName',
    inputType: 'text',
    autocomplete: 'name',
    value: 'Priya Raghunathan',
  }),
  field({
    elementId: 'email',
    label: 'Work email',
    name: 'email',
    inputType: 'email',
    autocomplete: 'email',
    value: 'priya.r@example.com',
  }),
  field({
    elementId: 'phone',
    label: 'Mobile',
    name: 'phone',
    inputType: 'tel',
    autocomplete: 'tel',
    value: '+91 98200 11234',
  }),
  field({
    elementId: 'dob',
    label: 'Date of birth',
    name: 'dob',
    inputType: 'date',
    value: '1994-03-17',
  }),
  field({
    elementId: 'headline',
    label: 'Headline',
    name: 'headline',
    inputType: 'text',
    value: 'Backend engineer, payments platform',
  }),
  field({
    elementId: 'handle',
    label: 'Public handle',
    name: 'handle',
    inputType: 'text',
    value: '@priya_builds',
  }),
  field({
    elementId: 'timezone',
    label: 'Time zone',
    name: 'timezone',
    inputType: 'select-one',
    value: 'ist',
  }),
  field({
    elementId: 'bio',
    label: 'About you',
    name: 'bio',
    // A textarea arrives as an input with no input type, which is exactly why
    // it is not in AUTHOR_SUPPLIED_VALUE_TYPES — see the note in dom-rules.ts.
    inputType: null,
    value:
      'Joined the payments team in 2021, working with Arjun Mehta on settlement ' +
      'tooling. Reach me at priya.r@example.com or find me in the #payments channel.',
  }),
  field({ elementId: 'save', elementType: 'button', inputType: 'submit', label: 'Save changes' }),
];

const found = new Map(detectDomPii(PAGE).map((region) => [region.elementId, region]));

function categoryOf(elementId: string): string | null {
  return found.get(elementId)?.category ?? null;
}

test('the declared fields come back as the page declares them', () => {
  assert.equal(categoryOf('full-name'), 'name');
  assert.equal(categoryOf('email'), 'email');
  assert.equal(categoryOf('phone'), 'phone');
});

test('the action target is hidden, which is the point rather than a problem', () => {
  // Nothing recognises "Public handle", it holds a value, so default-to-hide
  // fires. The fixture exists to prove the agent can still type into it —
  // Shield names the field and the client supplies the value.
  assert.equal(categoryOf('handle'), 'other');
});

test('a benign field with content is hidden by default, and that cost is real', () => {
  // "Headline" matches no pattern. Hiding it protects nobody and is still
  // correct under SECURITY_PRIVACY.md Section 4 — the cost of the rule, paid
  // visibly rather than argued away.
  assert.equal(categoryOf('headline'), 'other');
});

test('date of birth rides entirely on the default-to-hide rule', () => {
  // The uncertain prediction in the fixture. `type="date"` implies no category
  // and "Date of birth" matches no TEXT_PATTERNS entry, so if this is ever
  // unflagged the default-to-hide rule does not reach date inputs — a real gap
  // rather than a fixture to adjust.
  assert.equal(
    categoryOf('dob'),
    'other',
    'A date input holding a value is no longer hidden by default.',
  );
});

test('a dropdown is not flagged, because nothing a user typed can be in it', () => {
  assert.equal(categoryOf('timezone'), null);
});

test('a submit button is not flagged', () => {
  assert.equal(categoryOf('save'), null);
});

test('the prose paragraph catches the email and misses the name', () => {
  // Both sides of the documented limit, in one value. An email is
  // high-precision enough to match in prose; a person's name is not separable
  // from other capitalised words without a model we do not ship
  // (SECURITY_PRIVACY.md 5.1).
  assert.equal(categoryOf('bio'), 'email');

  const bio = found.get('bio');
  assert.ok(bio);
  assert.equal(
    bio.category === 'name',
    false,
    'If a name in prose is now detected, SECURITY_PRIVACY.md 5.1 needs updating ' +
      'and so does the demo script answer built on it.',
  );
});

test('the count the fixture predicts is the count the rules produce', () => {
  // 7 of 9 fields: everything but the select and the button. Written as a
  // number because the fixture states one, and two places holding the same
  // figure is how a fixture quietly stops matching what it measures.
  assert.equal(found.size, 7);
});

test('every input in the fixture is represented above', () => {
  const markup = readFileSync(FIXTURE, 'utf8');

  // Ids from the real page, minus the ones that are not form controls.
  const ids = [...markup.matchAll(/<(?:input|select|textarea|button)[^>]*\sid="([^"]+)"/g)].map(
    (match) => match[1],
  );

  assert.ok(ids.length > 0, 'No controls found in the fixture — has it moved?');

  const covered = new Set(PAGE.map((element) => element.elementId));
  const untested = ids.filter((id) => !covered.has(id as string));

  assert.deepEqual(
    untested,
    [],
    `06-profile-edit.html has controls this test does not describe: ${untested.join(', ')}. ` +
      'A field added to the page without being added here is a field nothing checks.',
  );
});
