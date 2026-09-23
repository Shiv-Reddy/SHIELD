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

import {
  buildManifest,
  placeholderFor,
  redactDomElements,
  scrubTextContent,
} from '../src/lib/redaction/placeholders';
import { buildSanitizedPayload } from '../src/lib/redaction/payload';
import { classifyTextContent } from '../src/lib/pii/dom-rules';
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

/*
 * Labels were a hole in redaction until a real page found it.
 *
 * `RedactedDomEntry` carries a label as well as a value, and the label went out
 * verbatim on every path. Our fixtures could not show this: a fixture's labels
 * are things like "Email address", which describe the field rather than being
 * its contents. On a live page an accessible name is routinely the content
 * itself.
 *
 * It surfaced by luck. A real page put the same address in a flagged value AND
 * a label, and the zero-leak sweep refused the transmission. Had it been in the
 * label only, nothing would have looked at it.
 */
test('an email inside a label is replaced with its token', () => {
  const scrubbed = scrubTextContent('Account: casey.tan@example.com');
  assert.equal(scrubbed, `Account: ${placeholderFor('email')}`);
  assert.ok(!scrubbed.includes('casey.tan@example.com'));
});

test('the words around a value survive, because the model needs them', () => {
  // "[EMAIL]" alone would lose which control this is. The surrounding words
  // were never the sensitive part.
  assert.equal(
    scrubTextContent('Signed in as someone@example.com — open menu'),
    `Signed in as ${placeholderFor('email')} — open menu`,
  );
});

test('an ordinary label is left exactly as it was', () => {
  for (const label of ['Email address', 'Password', 'Search the notes', 'Sign in']) {
    assert.equal(scrubTextContent(label), label);
  }
});

test('every sensitive value in one label is replaced, not just the first', () => {
  const scrubbed = scrubTextContent('a@example.com and b@example.com');
  assert.ok(!scrubbed.includes('a@example.com'));
  assert.ok(!scrubbed.includes('b@example.com'));
});

test('the phone rule in labels is the same one the detector uses', () => {
  // A date range is the shape that broke the first phone pattern, and it must
  // not be scrubbed out of a label either.
  assert.equal(
    scrubTextContent('Copyright 2024-2025 Acme Corp'),
    'Copyright 2024-2025 Acme Corp',
  );
  assert.ok(!scrubTextContent('Call +91 98200 11223').includes('98200'));
});

test('scrubbing runs on labels as elements are redacted', () => {
  const [entry] = redactDomElements(
    [
      {
        elementId: 'e0',
        elementType: 'button',
        selector: 'html > body #e0',
        label: 'Account: casey.tan@example.com',
        value: null,
        inputType: null,
        autocomplete: null,
        name: null,
        placeholder: null,
        position: { x: 0, y: 0, width: 100, height: 20 },
      },
    ],
    [],
  );

  // Note the element was NOT flagged. That is the point: nothing about a button
  // says it is sensitive, and its label carried an address anyway.
  assert.ok(entry !== undefined);
  assert.ok(!entry.label?.includes('casey.tan@example.com'));
  assert.ok(entry.label?.includes(placeholderFor('email')));
});

// --- The classifier and the scrubber must agree ------------------------------
//
// These were written after a live page refused to transmit. The gazetteer had
// been added to classifyTextContent and not to scrubTextContent, so a name was
// tokenised in a field's value and sent verbatim in a link's accessible name.
// The zero-leak sweep caught it, which is the system working — but it caught it
// on a real page rather than here, which is this file not working.

test('a name in a label is scrubbed, not passed through', () => {
  const out = scrubTextContent('Message Priya Sharma');

  assert.ok(!out.includes('Priya'));
  assert.ok(!out.includes('Sharma'));
  assert.equal(out, `Message ${placeholderFor('name')}`);
});

test('the words around a name survive, because only the name was sensitive', () => {
  // A label is how the model tells one control from another. Discarding the
  // whole string would hide the leak and the affordance together.
  assert.equal(
    scrubTextContent('Open chat with Rohan Mehra now'),
    `Open chat with ${placeholderFor('name')} now`,
  );
});

test('a longer name is replaced whole, never half-substituted', () => {
  // Longest-first ordering. "Priya Sharma" is a substring of "Priya Sharma
  // Iyer"'s first two tokens, so a shortest-first pass would leave "Iyer".
  const out = scrubTextContent('Signed by Priya Sharma Iyer');

  assert.ok(!out.includes('Priya'));
  assert.ok(!out.includes('Sharma'));
});

test('a name and an amount on one line are both removed', () => {
  // classifyTextContent labels this `other`, because the amount rule is declared
  // above the gazetteer and claims the line first. The scrubber does not have to
  // choose, and removes both — more thorough than the label it is given, which
  // is the safe direction for the two to differ.
  const out = scrubTextContent('Billed to Rohan Mehra Rs. 712.00');

  assert.ok(!out.includes('Rohan'));
  assert.ok(!out.includes('712'));
});

test('an unlisted name is missed by BOTH paths, so the two still agree', () => {
  // The documented limit, pinned on this side too. The scrubber must not be
  // weaker than the classifier; it must also not be stronger, or a name the
  // classifier ignores would vanish from labels for no stated reason.
  const text = 'Message Bartholomew Fanshawe';

  assert.equal(classifyTextContent(text), null);
  assert.equal(scrubTextContent(text), text);
});

test('a placeholder cannot be re-read as a name', () => {
  // Names are scrubbed after CONTENT_PATTERNS, so tokens are already in place.
  // [EMAIL] is all caps and the pattern needs a capital followed by lowercase,
  // which is what makes that ordering safe rather than lucky.
  const out = scrubTextContent('Reply to priya@example.com');

  assert.equal(out, `Reply to ${placeholderFor('email')}`);
  assert.ok(!out.includes(placeholderFor('name')));
});

test('whatever the classifier calls sensitive, the scrubber removes', () => {
  // The general guard, and the reason this section exists. Both functions read
  // free text; a category taught to one and not the other is invisible until a
  // real page puts the same string in a value and a label. Adding a row here is
  // the cheapest way to keep that from happening a third time.
  const samples = [
    'Reply to someone@example.com',
    'Call +91 98200 11223',
    'PAN ABCDE1234F on file',
    'Aadhaar 2345 6789 0124 on file',
    'Branch SBIN0001234',
    'Refund of Rs. 712.00 issued',
    'Message Priya Sharma',
  ];

  for (const text of samples) {
    const hit = classifyTextContent(text);
    assert.ok(hit !== null, `classifier found nothing in: ${text}`);
    assert.notEqual(
      scrubTextContent(text),
      text,
      `classifier called this ${hit?.category} but the scrubber left it intact: ${text}`,
    );
  }
});

test('the live failure: a name in a flagged value and in another label seals', () => {
  // Reconstructed from a real page that refused to transmit. One element held
  // the name as its value and was flagged; a control elsewhere carried the same
  // name inside its accessible name and was not. Before the gazetteer reached
  // the scrubber this threw, which is the zero-leak sweep doing its job at the
  // last possible moment — after detection, redaction and encoding had all run.
  const elements: DomElement[] = [
    {
      elementId: 'e104',
      elementType: 'text',
      selector: 'html > body #e104',
      label: null,
      value: 'Priya Sharma',
      inputType: null,
      autocomplete: null,
      name: null,
      placeholder: null,
      position: { x: 0, y: 0, width: 100, height: 20 },
    },
    {
      elementId: 'e211',
      elementType: 'button',
      selector: 'html > body #e211',
      // The capitalised word in front is the whole point: it is what the old
      // non-overlapping pair regex could not see past.
      label: 'Message Priya Sharma',
      value: null,
      inputType: null,
      autocomplete: null,
      name: null,
      placeholder: null,
      position: { x: 0, y: 40, width: 100, height: 20 },
    },
  ];

  const regions: SensitiveRegion[] = [
    {
      regionId: 'r-e104',
      elementId: 'e104',
      category: 'name',
      confidence: 0.8,
      source: 'dom',
      reason: 'visible text matched a known given name followed by a surname',
      position: { x: 0, y: 0, width: 100, height: 20 },
    },
  ];

  const redactedDom = redactDomElements(elements, regions);

  const payload = buildSanitizedPayload({
    requestId: 'r1',
    taskQuery: 'open the chat',
    redactedFrame: 'ZnJhbWU=',
    redactedDom,
    manifest: buildManifest(regions),
    regions,
    flaggedRawValues: ['Priya Sharma'],
  });

  const wire = JSON.stringify(payload);
  assert.ok(!wire.includes('Priya'), 'the name reached the wire');
  assert.ok(!wire.includes('Sharma'), 'the surname reached the wire');

  // The label keeps its shape, so the model can still tell this control apart.
  const button = payload.redacted_dom_summary.find((e) => e.elementId === 'e211');
  assert.equal(button?.label, `Message ${placeholderFor('name')}`);
});
