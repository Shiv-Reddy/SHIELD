/**
 * Redaction engine and the transport boundary — TASKS.md Module G.
 *
 * The last test in this file is the one that matters most. Everything else
 * checks that redaction produces the right shape; that one checks that a
 * payload with a real value still in it cannot be sealed. It is the guard
 * standing between a bug anywhere upstream and a leak.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildManifest, placeholderFor, redactDomElements } from '../src/lib/redaction/placeholders';
import { buildSanitizedPayload } from '../src/lib/redaction/payload';
import type { DomElement, SensitiveRegion } from '../src/lib/types';

function element(overrides: Partial<DomElement> = {}): DomElement {
  return {
    elementId: 'e0',
    elementType: 'input',
    selector: 'html > body > input',
    label: null,
    value: null,
    inputType: 'text',
    autocomplete: null,
    name: null,
    placeholder: null,
    position: { x: 0, y: 0, width: 100, height: 20 },
    ...overrides,
  };
}

function region(overrides: Partial<SensitiveRegion> = {}): SensitiveRegion {
  return {
    regionId: 'dom-e0',
    category: 'password',
    source: 'dom',
    confidence: 1,
    elementId: 'e0',
    reason: 'input type="password"',
    position: { x: 0, y: 0, width: 100, height: 20 },
    ...overrides,
  };
}

test('a flagged value is replaced by its token, with no partial exposure', () => {
  const entries = redactDomElements(
    [element({ value: 'not-a-real-password-1234', inputType: 'password' })],
    [region()],
  );

  assert.equal(entries[0]?.value, '[PASSWORD]');
  // No last-four, no first-letter, no length hint. Partial exposure of a
  // password is just a slower leak (SECURITY_PRIVACY.md Section 4).
  assert.ok(!entries[0]?.value?.includes('1234'));
});

test('unflagged values survive, because the model needs the page', () => {
  const entries = redactDomElements([element({ value: 'Sign in' })], []);
  assert.equal(entries[0]?.value, 'Sign in');
});

test('a flagged but empty field still yields its token', () => {
  // An empty password box and an unflagged one would look identical otherwise,
  // and the model should know a password belongs here.
  const entries = redactDomElements([element({ value: null })], [region()]);
  assert.equal(entries[0]?.value, '[PASSWORD]');
});

test('`filled` distinguishes an empty field from a full one', () => {
  // The token reads [PASSWORD] either way, so without this the assistant cannot
  // tell "needs filling" from "ready to submit" — the choice the demo turns on.
  const full = redactDomElements([element({ value: 'x' })], [region()]);
  const empty = redactDomElements([element({ value: null })], [region()]);

  assert.equal(full[0]?.filled, true);
  assert.equal(empty[0]?.filled, false);
});

test('the manifest records categories and methods, never values', () => {
  const manifest = buildManifest([region()]);
  assert.deepEqual(manifest, [
    { regionId: 'dom-e0', category: 'password', method: 'dom' },
  ]);

  // SECURITY_PRIVACY.md Section 5: an audit trail must not become a second
  // store of the data it describes.
  assert.ok(!JSON.stringify(manifest).includes('not-a-real-password'));
});

test('every category has a token, and none is empty', () => {
  const categories = [
    'password',
    'name',
    'email',
    'phone',
    'address',
    'id_number',
    'face',
    'other',
  ] as const;

  for (const category of categories) {
    const token = placeholderFor(category);
    assert.match(token, /^\[[A-Z_]+\]$/, `${category} produced ${token}`);
  }
});

test('a payload whose flagged element still holds content cannot be sealed', () => {
  // The invariant, tested directly. The type seal proves redaction was called;
  // this proves it worked, and only the second claim is what the project
  // promises. If this test ever fails, a real value can reach the network.
  assert.throws(
    () =>
      buildSanitizedPayload({
        requestId: 'r1',
        taskQuery: 'log me in',
        redactedFrame: 'data:image/jpeg;base64,AAAA',
        redactedDom: [
          {
            elementId: 'e0',
            elementType: 'input',
            label: 'Password',
            // Redaction failed upstream: the real value is still here.
            value: 'not-a-real-password-1234',
            filled: true,
            position: { x: 0, y: 0, width: 100, height: 20 },
          },
        ],
        manifest: buildManifest([region()]),
        regions: [region()],
        flaggedRawValues: [],
      }),
    /Refusing to transmit/,
  );
});

test('the refusal message does not quote the value that failed', () => {
  // This string reaches a console and possibly an error report. Quoting the
  // content would turn the safety check itself into the leak.
  const secret = 'not-a-real-password-1234';

  try {
    buildSanitizedPayload({
      requestId: 'r1',
      taskQuery: 'log me in',
      redactedFrame: 'data:image/jpeg;base64,AAAA',
      redactedDom: [
        {
          elementId: 'e0',
          elementType: 'input',
          label: 'Password',
          value: secret,
          filled: true,
          position: { x: 0, y: 0, width: 100, height: 20 },
        },
      ],
      manifest: [],
      regions: [region()],
      flaggedRawValues: [],
    });
    assert.fail('expected the seal to refuse this payload');
  } catch (error) {
    assert.ok(!(error as Error).message.includes(secret));
  }
});

test('a correctly redacted payload seals, and carries no raw value', () => {
  const payload = buildSanitizedPayload({
    requestId: 'r1',
    taskQuery: 'log me in',
    redactedFrame: 'data:image/jpeg;base64,AAAA',
    redactedDom: redactDomElements(
      [element({ value: 'not-a-real-password-1234', inputType: 'password' })],
      [region()],
    ),
    manifest: buildManifest([region()]),
    regions: [region()],
    flaggedRawValues: ['not-a-real-password-1234'],
  });

  assert.equal(payload.request_id, 'r1');
  assert.ok(!JSON.stringify(payload).includes('not-a-real-password'));
});

test('a sensitive value hiding elsewhere in the payload is caught', () => {
  // The per-element check looks only where it expects the value to be. This is
  // the case it cannot see: the password was correctly replaced in its own
  // field, but the same string also sits in a neighbouring element's text.
  // Redaction is per-element, so anything that copied the value elsewhere slips
  // straight through — which is exactly what the manual Zero-Leak Verification
  // in TESTING.md Section 6 exists to catch, done automatically.
  const secret = 'not-a-real-password-1234';

  assert.throws(
    () =>
      buildSanitizedPayload({
        requestId: 'r1',
        taskQuery: 'log me in',
        redactedFrame: 'data:image/jpeg;base64,AAAA',
        redactedDom: [
          {
            elementId: 'e0',
            elementType: 'input',
            label: 'Password',
            value: '[PASSWORD]',
            filled: true,
            position: { x: 0, y: 0, width: 100, height: 20 },
          },
          {
            elementId: 'e1',
            elementType: 'text',
            label: null,
            // A page that echoed the password into visible text. Unflagged, so
            // the per-element check passes it.
            value: `Your password is ${secret}`,
            filled: true,
            position: { x: 0, y: 40, width: 100, height: 20 },
          },
        ],
        manifest: buildManifest([region()]),
        regions: [region()],
        flaggedRawValues: [secret],
      }),
    /Zero-leak check failed/,
  );
});

test('the zero-leak refusal does not name the value it found', () => {
  const secret = 'not-a-real-password-1234';

  try {
    buildSanitizedPayload({
      requestId: 'r1',
      taskQuery: 'log me in',
      redactedFrame: 'data:image/jpeg;base64,AAAA',
      redactedDom: [
        {
          elementId: 'e1',
          elementType: 'text',
          label: null,
          value: `leaked ${secret}`,
          filled: true,
          position: { x: 0, y: 0, width: 100, height: 20 },
        },
      ],
      manifest: [],
      regions: [region()],
      flaggedRawValues: [secret],
    });
    assert.fail('expected the zero-leak check to refuse this payload');
  } catch (error) {
    assert.ok(!(error as Error).message.includes(secret));
  }
});
