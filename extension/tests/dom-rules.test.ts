/**
 * PII detector rules — TASKS.md Module G.
 *
 * Weighted toward defects that actually occurred rather than toward coverage.
 * Every case below either encodes a rule from SECURITY_PRIVACY.md Section 4 or
 * pins a bug this code has already had once: the "Forgot password?" link that
 * matched the password pattern, the date range that matched a phone number, the
 * username field whose content was an email address. A test that pins a real
 * defect earns its maintenance; a test written for the coverage number does not.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { classifyElement, classifyTextContent, detectDomPii } from '../src/lib/pii/dom-rules';
import type { DomElement, ElementType } from '../src/lib/types';

function element(overrides: Partial<DomElement> = {}): DomElement {
  return {
    elementId: 'e0',
    elementType: 'input' as ElementType,
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

test('a password field is detected deterministically, at full confidence', () => {
  const hit = classifyElement(element({ inputType: 'password' }));
  assert.equal(hit?.category, 'password');
  assert.equal(hit?.confidence, 1);
});

test('an empty password field is still detected', () => {
  // SECURITY_PRIVACY.md's tampering row: the page can fill it between capture
  // and transmission, so detection describes what a region is, not what it
  // happened to contain at one instant.
  const hit = classifyElement(element({ inputType: 'password', value: null }));
  assert.equal(hit?.category, 'password');
});

test('autocomplete tokens are read from a token list, not matched whole', () => {
  // "section-billing shipping street-address" is valid and common; matching the
  // whole attribute would miss every field that uses a section or qualifier.
  const hit = classifyElement(
    element({ autocomplete: 'section-billing shipping street-address' }),
  );
  assert.equal(hit?.category, 'address');
});

test('email is tested before address, so "email address" is not an address', () => {
  const hit = classifyElement(element({ label: 'Email address' }));
  assert.equal(hit?.category, 'email');
});

test('a checkbox is not flagged', () => {
  // It carries a value in the DOM sense without carrying content in any sense
  // that matters, and flagging it would put a meaningless entry in the manifest.
  assert.equal(classifyElement(element({ inputType: 'checkbox', value: 'checked' })), null);
});

test('field rules do not apply to links — the "Forgot password?" regression', () => {
  // Field patterns describe what a control *holds*. Run over a link they misread
  // UI chrome as data: this exact element on the login fixture matched the
  // password pattern and is not a password.
  const link = element({
    elementType: 'button',
    label: 'Forgot password?',
    value: 'Forgot password?',
    inputType: null,
  });
  assert.equal(classifyElement(link), null);
});

test('an email rendered as visible text is detected', () => {
  // The leak this closed: text elements carry their content in `value`, and that
  // content is transmitted. No field rule looks at it, because nothing in the
  // surrounding markup declares it sensitive.
  const hit = classifyTextContent('Contact: someone@example.com for details');
  assert.equal(hit?.category, 'email');
});

test('a date range is not a phone number — the "Copyright 2024-2025" regression', () => {
  // Eight digits in two groups matches the phone shape exactly. Caught by
  // checking the patterns against ordinary prose before shipping them.
  assert.equal(classifyTextContent('Copyright 2024-2025 Acme Corp'), null);
});

test('a real phone number is still detected', () => {
  assert.equal(classifyTextContent('Call +91 98765 43210 today')?.category, 'phone');
  assert.equal(classifyTextContent('Call (555) 123-4567 today')?.category, 'phone');
});

test('ordinary prose is not flagged', () => {
  assert.equal(classifyTextContent('Sign in to continue to your dashboard.'), null);
  assert.equal(classifyTextContent('Order 1234-5678 shipped on Tuesday'), null);
});

test('declaration and content disagreeing resolves to the more sensitive reading', () => {
  // The login fixture: autocomplete="username" classifies as a name, but the
  // field holds an email address. Both are redacted either way; what changes is
  // the placeholder the model sees and the category shown to the user.
  const regions = detectDomPii([
    element({ autocomplete: 'username', value: 'demo.user@example.com' }),
  ]);
  assert.equal(regions.length, 1);
  assert.equal(regions[0]?.category, 'email');
  assert.match(regions[0]?.reason ?? '', /autocomplete="username"/);
});

test('a disagreement never lowers confidence', () => {
  // Two independent signals agreeing that something is sensitive is more
  // evidence, never less.
  const regions = detectDomPii([
    element({ autocomplete: 'username', value: 'demo.user@example.com' }),
  ]);
  assert.ok((regions[0]?.confidence ?? 0) >= 0.9);
});

test('an unrecognised field holding content is hidden by default', () => {
  // CLAUDE.md and SECURITY_PRIVACY.md Section 4 both require ambiguity to
  // resolve toward hiding. Until `other` existed, this rule was written in the
  // documents and absent from the code.
  const regions = detectDomPii([
    element({ name: 'q1', value: 'something a person typed' }),
  ]);
  assert.equal(regions.length, 1);
  assert.equal(regions[0]?.category, 'other');
});

test('an unrecognised EMPTY field is not flagged', () => {
  // Nothing to hide, so flagging it would be noise on the trust overlay.
  assert.equal(detectDomPii([element({ name: 'q1', value: null })]).length, 0);
});

test('regions carry the element they came from, and a stated reason', () => {
  const regions = detectDomPii([element({ elementId: 'e7', inputType: 'password' })]);
  assert.equal(regions[0]?.elementId, 'e7');
  assert.equal(regions[0]?.source, 'dom');
  assert.ok((regions[0]?.reason ?? '').length > 0);
});

test('a reason never quotes the value that triggered it', () => {
  // The reason is written to a console and shown in the trust overlay. Quoting
  // the content would leak exactly what was detected as sensitive.
  const secret = 'hunter2@example.com';
  const regions = detectDomPii([element({ label: 'Email', value: secret })]);
  assert.ok(!regions[0]?.reason.includes(secret));
});

test('a dropdown value is not hidden by default, because the page wrote it', () => {
  // A `<select>` can only hold one of the options the page itself supplied, so
  // there is nothing a person entered for the default-to-hide rule to protect.
  // Hiding it costs the reasoning model a piece of the page for no gain.
  assert.equal(
    detectDomPii([element({ name: 'referral', inputType: 'select-one', value: 'A friend' })])
      .length,
    0,
  );
});

test('a dropdown holding an email address is still caught', () => {
  // The exemption is from default-to-hide, not from detection. An account
  // picker listing real addresses is genuinely sensitive, and it is caught by
  // what the value looks like rather than excused by the control that holds it.
  const regions = detectDomPii([
    element({ name: 'account', inputType: 'select-one', value: 'casey.tan@example.com' }),
  ]);
  assert.equal(regions[0]?.category, 'email');
});

test('a textarea is not mistaken for a dropdown', () => {
  // Both arrive as an `input` element, and before dom-map.ts read `type` from
  // every control they were indistinguishable: a textarea reported no input
  // type, exactly as a select did. Exempting one would have exempted the other,
  // and a textarea holds precisely what the user typed.
  const regions = detectDomPii([
    element({ name: 'bio', inputType: 'textarea', value: 'something a person typed' }),
  ]);
  assert.equal(regions[0]?.category, 'other');
});
