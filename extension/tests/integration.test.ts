/**
 * The client pipeline, end to end, against every test screen — TESTING.md
 * Section 3 and TASKS.md Module G.
 *
 * This was a manual procedure: load the extension, open each screen, read the
 * console, compare against the expectations written in the fixture. That works
 * and it found real defects, but it runs when somebody remembers to run it,
 * which under deadline pressure means it runs less and less often exactly as
 * the code changes fastest.
 *
 * So the part that can run in Node does. Each screen goes through detection,
 * redaction, the manifest and the seal — the real modules, in the real order,
 * on input shaped the way the content script shapes it. What it cannot cover is
 * everything needing a browser: extraction, capture, the canvas, the executor.
 * Those stay manual and are recorded as such in TASKS.md rather than quietly
 * counted as automated here.
 *
 * The per-screen expectations are copied from the comment block at the top of
 * each fixture, which was written before the screen was ever run. Where a
 * measured result differs from the prediction it is recorded as a finding, not
 * edited into agreement — a fixture tuned until it passes has stopped measuring
 * anything.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { detectDomPii } from '../src/lib/pii/dom-rules';
import { buildManifest, redactDomElements } from '../src/lib/redaction/placeholders';
import { buildSanitizedPayload } from '../src/lib/redaction/payload';
import type { DomElement, SensitiveCategory } from '../src/lib/types';
import {
  SCREEN_1_LOGIN,
  SCREEN_2_SIGNUP,
  SCREEN_4_CLEAN,
  SCREEN_5_ADVERSARIAL,
} from './fixtures/screens';

const SCREENS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'test-screens');

/** Everything downstream of extraction, in the order the service worker runs it. */
function runPipeline(elements: readonly DomElement[], task = 'log me in') {
  const regions = detectDomPii(elements);
  const redacted = redactDomElements(elements, regions);
  const manifest = buildManifest(regions);

  // The raw values of everything flagged, passed to the seal for the zero-leak
  // search. This mirrors what the service worker collects, and it is the only
  // use these strings are put to.
  const flaggedIds = new Set(regions.map((region) => region.elementId));
  const flaggedRawValues = elements
    .filter((element) => flaggedIds.has(element.elementId))
    .map((element) => element.value)
    .filter((value): value is string => typeof value === 'string' && value.length > 0);

  const payload = buildSanitizedPayload({
    requestId: 'integration-1',
    taskQuery: task,
    redactedFrame: 'data:image/jpeg;base64,AAAA',
    redactedDom: redacted,
    manifest,
    regions,
    flaggedRawValues,
  });

  return { regions, redacted, manifest, payload, flaggedRawValues };
}

/** The category assigned to one element, or null if it was not flagged. */
function categoryOf(
  regions: ReturnType<typeof detectDomPii>,
  elementId: string,
): SensitiveCategory | null {
  return regions.find((region) => region.elementId === elementId)?.category ?? null;
}

// --- Screen 1: the primary demo path -----------------------------------------

test('Screen 1 — the login form redacts both fields and nothing else', () => {
  const { regions, redacted, manifest, payload } = runPipeline(SCREEN_1_LOGIN);

  assert.equal(regions.length, 2, `flagged ${regions.map((r) => r.elementId).join(', ')}`);

  assert.equal(categoryOf(regions, 'e3'), 'password');
  // Declared `autocomplete="username"`, which reads as a name, but it holds an
  // email address — the disagreement rule picking the more sensitive reading.
  assert.equal(categoryOf(regions, 'e2'), 'email');

  // The three that a careless rule gets wrong: a checkbox with a value, a link
  // whose text matches the password pattern, and the submit button.
  for (const untouched of ['e4', 'e5', 'e6']) {
    assert.equal(categoryOf(regions, untouched), null, `${untouched} was flagged`);
  }

  const values = new Map(redacted.map((entry) => [entry.elementId, entry.value]));
  assert.equal(values.get('e2'), '[EMAIL]');
  assert.equal(values.get('e3'), '[PASSWORD]');
  assert.equal(values.get('e6'), null);

  assert.equal(manifest.length, 2);
  assert.ok(!JSON.stringify(payload).includes('not-a-real-password'));
  assert.ok(!JSON.stringify(payload).includes('demo.user@example.com'));
});

test('Screen 1 — the server can tell a filled field from an empty one', () => {
  // The primary demo turns on this distinction and the placeholder token hides
  // it, so `filled` is the only thing carrying it across the boundary.
  const { redacted } = runPipeline(SCREEN_1_LOGIN);
  const password = redacted.find((entry) => entry.elementId === 'e3');

  assert.equal(password?.value, '[PASSWORD]');
  assert.equal(password?.filled, true);
});

// --- Screen 2: many fields, uneven signals -----------------------------------

test('Screen 2 — every personal field on the signup form is hidden', () => {
  const { regions, redacted } = runPipeline(SCREEN_2_SIGNUP, 'sign me up');

  // Predictions from the fixture's own comment block, written before any run.
  const expected: Record<string, SensitiveCategory> = {
    s1: 'name',
    s2: 'name',
    s3: 'email',
    s4: 'phone',
    s5: 'other',
    s6: 'address',
    s7: 'address',
    s8: 'password',
    s9: 'password',
    s10: 'id_number',
    // Over-redaction, predicted and accepted: "Display name" contains the word
    // the name pattern looks for. The cost of defaulting to hide.
    s11: 'name',
  };

  for (const [elementId, category] of Object.entries(expected)) {
    assert.equal(
      categoryOf(regions, elementId),
      category,
      `${elementId} was ${categoryOf(regions, elementId)}, expected ${category}`,
    );
  }

  // Checkboxes hold no free text, and the button is not a field at all.
  for (const untouched of ['s13', 's14', 'e-submit']) {
    assert.equal(categoryOf(regions, untouched), null, `${untouched} was flagged`);
  }

  // No value survives in the clear. Checked over the whole payload rather than
  // field by field, since the point is that none of them got anywhere.
  const serialised = JSON.stringify(redacted);
  for (const secret of [
    'Rohan',
    'Mehra',
    'rohan.mehra@example.com',
    '98200',
    'Marine Lines',
    '400020',
    'ABCDE1234F',
  ]) {
    assert.ok(!serialised.includes(secret), `${secret} survived redaction`);
  }
});

test('Screen 2 — a dropdown of the page own options is not treated as a secret', () => {
  // A `<select>` value is one of the author's own options, never something the
  // user typed, so the default-to-hide rule has nothing to protect here and
  // hiding it costs the model context it needs. Content rules still apply: a
  // dropdown listing email addresses is caught by the pattern, not exempted.
  const { regions } = runPipeline(SCREEN_2_SIGNUP, 'sign me up');
  assert.equal(categoryOf(regions, 's12'), null);
});

// --- Screen 4: the restraint check --------------------------------------------

test('Screen 4 — the clean page produces nothing at all', () => {
  // The screen that separates a detector from a rule that hides everything. A
  // detector that failed only this one would pass every other screen here.
  const { regions, manifest } = runPipeline(SCREEN_4_CLEAN, 'summarise this page');

  assert.deepEqual(
    regions.map((region) => `${region.elementId}:${region.category}`),
    [],
  );
  assert.equal(manifest.length, 0);
});

test('Screen 4 — dates, versions and reference numbers are not phone numbers', () => {
  // Each of these has broken a pattern at some point. The date range in the
  // copyright line broke the first phone rule.
  const { regions } = runPipeline(SCREEN_4_CLEAN);
  assert.equal(categoryOf(regions, 'e1'), null, 'the copyright date range was flagged');
  assert.equal(categoryOf(regions, 'e7'), null, 'section ranges were flagged');
});

// --- Screen 5: meant to be partly failed ---------------------------------------

test('Screen 5 — the adversarial cases land exactly where they were predicted', () => {
  const { regions } = runPipeline(SCREEN_5_ADVERSARIAL, 'what is on this screen');

  // Caught.
  assert.equal(categoryOf(regions, 'c1'), 'password', 'masked field with no type=password');
  assert.equal(categoryOf(regions, 'c2'), 'other', 'password with an opaque name');
  assert.equal(categoryOf(regions, 't3'), 'email', 'email in plain text');
  assert.equal(categoryOf(regions, 't5'), 'id_number', 'ID number in plain text');
  // Declared a nickname, holds an email: the more sensitive reading wins.
  assert.equal(categoryOf(regions, 'c7'), 'email', 'lying autocomplete attribute');

  // Missed, deliberately and on the record. These assertions exist so that if
  // either limit is ever closed, the suite says so out loud instead of a fixed
  // gap passing silently and staying documented as open.
  assert.equal(
    categoryOf(regions, 't4'),
    null,
    'a name in prose is now detected — SECURITY_PRIVACY.md 4.1 needs updating',
  );
  assert.equal(
    categoryOf(regions, 't6'),
    null,
    'text inside an image is now detected — the OCR gap has closed',
  );

  // The false-positive control.
  assert.equal(categoryOf(regions, 't8'), null, 'invoice and section numbers were flagged');
});

// --- Properties that must hold on every screen ---------------------------------

const ALL_SCREENS: ReadonlyArray<readonly [string, DomElement[]]> = [
  ['1 login', SCREEN_1_LOGIN],
  ['2 signup', SCREEN_2_SIGNUP],
  ['4 clean', SCREEN_4_CLEAN],
  ['5 adversarial', SCREEN_5_ADVERSARIAL],
];

test('no screen transmits a value it flagged', () => {
  // The Zero-Leak Verification, run over every screen rather than the one that
  // happened to be open. `buildSanitizedPayload` throws on a hit, so reaching
  // the end of this loop is the assertion.
  for (const [name, elements] of ALL_SCREENS) {
    const { payload, flaggedRawValues } = runPipeline(elements);
    const serialised = JSON.stringify({ ...payload, redacted_frame: '' });

    for (const value of flaggedRawValues) {
      if (value.length < 4 || value === '[has value]') continue;
      assert.ok(!serialised.includes(value), `screen ${name} transmitted a flagged value`);
    }
  }
});

test('every detection can explain itself to the user', () => {
  // The trust overlay shows the reason for each box. An empty one produces a
  // labelled rectangle that explains nothing, which is worse than no overlay:
  // it looks like an explanation.
  for (const [name, elements] of ALL_SCREENS) {
    for (const region of detectDomPii(elements)) {
      assert.ok(region.reason.length > 0, `screen ${name}: ${region.regionId} had no reason`);
    }
  }
});

test('no reason quotes the value it was triggered by', () => {
  // The reason reaches the console and the on-page overlay. Quoting the string
  // that was just identified as sensitive would make the explanation the leak.
  for (const [name, elements] of ALL_SCREENS) {
    const values = new Map(elements.map((element) => [element.elementId, element.value]));

    for (const region of detectDomPii(elements)) {
      const value = region.elementId ? values.get(region.elementId) : null;
      if (!value || value.length < 4) continue;
      assert.ok(
        !region.reason.includes(value),
        `screen ${name}: ${region.regionId} quoted its own value`,
      );
    }
  }
});

test('confidence never decides whether something is redacted', () => {
  // SECURITY_PRIVACY.md Section 4: a missed detection is worse than an
  // unnecessary one, so there is no threshold below which Shield lets something
  // through. Everything flagged, at any confidence, must carry a token.
  for (const [name, elements] of ALL_SCREENS) {
    const regions = detectDomPii(elements);
    const redacted = redactDomElements(elements, regions);
    const lowest = Math.min(1, ...regions.map((region) => region.confidence));

    for (const region of regions) {
      const entry = redacted.find((candidate) => candidate.elementId === region.elementId);
      assert.match(
        entry?.value ?? '',
        /^\[[A-Z_]+\]$/,
        `screen ${name}: ${region.regionId} at confidence ${region.confidence} kept its value`,
      );
    }

    if (regions.length > 0) {
      assert.ok(lowest <= 1, `screen ${name}: lowest confidence was ${lowest}`);
    }
  }
});

// --- The fixtures must still describe the pages -------------------------------

/** Every `name` attribute on a form control in a screen's markup. */
function controlNamesInHtml(file: string): Set<string> {
  const html = readFileSync(join(SCREENS_DIR, file), 'utf8');
  const names = new Set<string>();

  for (const match of html.matchAll(/<(input|select|textarea)\b[^>]*>/gi)) {
    const name = /\bname="([^"]+)"/i.exec(match[0]);
    if (name) names.add(name[1]);
  }

  return names;
}

test('the element maps still match the pages they describe', () => {
  // The hazard with a hand-derived fixture is silent drift: a screen changes,
  // the map does not, and the suite goes on passing against a page that no
  // longer exists. Comparing the set of named form controls is cheap and
  // catches the case that actually happens — a field added or removed.
  const pairs: ReadonlyArray<readonly [string, DomElement[]]> = [
    ['01-login.html', SCREEN_1_LOGIN],
    ['02-signup.html', SCREEN_2_SIGNUP],
    ['04-clean.html', SCREEN_4_CLEAN],
    ['05-adversarial.html', SCREEN_5_ADVERSARIAL],
  ];

  for (const [file, elements] of pairs) {
    const inHtml = controlNamesInHtml(file);
    const inFixture = new Set(
      elements
        .map((element) => element.name)
        .filter((name): name is string => typeof name === 'string'),
    );

    const missing = [...inHtml].filter((name) => !inFixture.has(name));
    const extra = [...inFixture].filter((name) => !inHtml.has(name));

    assert.deepEqual(missing, [], `${file} has controls the fixture does not: ${missing}`);
    assert.deepEqual(extra, [], `the fixture for ${file} has controls the page does not: ${extra}`);
  }
});
