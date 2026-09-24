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

/*
 * Currency amounts in prose — added 2026-09-22, predicted before it was written.
 *
 * The defect it closes was recorded long before the fix: the same figure was
 * hidden by the default-to-hide rule when it sat in a form field, and passed
 * through untouched when the page rendered it as text. One quantity, two
 * answers, decided by markup rather than by sensitivity.
 */

test('an amount in prose is caught, in each way a page writes one', () => {
  for (const text of [
    '02 Aug · Blue Tokai Coffee, Bandra · Rs. 640.00',
    'Total due Rs. 12,430.00 by 05 Sep 2026',
    'Next premium Rs. 18,240 due 01 Oct 2026',
    'Balance ₹1,84,220.55',
    'Invoice total INR 9,700',
  ]) {
    const found = classifyTextContent(text);
    assert.equal(found?.category, 'other', `not caught: ${text}`);
  }
});

test('a bare number is not an amount, because the marker is what makes it one', () => {
  // The pattern requires a currency marker. Without that it would black out
  // ordinary prose — every date, count and reference number on the page — and
  // an unreadable page fails the task in the other direction.
  for (const text of ['Units consumed 214', 'Section 640 of the Act', '3 items']) {
    const found = classifyTextContent(text);
    assert.notEqual(
      found?.category,
      'other',
      `a bare number was read as an amount: ${text}`,
    );
  }
});

test('an identifier still wins over an amount in the same sentence', () => {
  /*
   * NOT an ordering test, though it was written as one and the comment was
   * wrong until the claim was checked by moving the pattern and watching this
   * pass anyway.
   *
   * `strongestIndianId` runs BEFORE the CONTENT_PATTERNS loop and short
   * circuits, so both of these are claimed by the Aadhaar/bank-account matcher
   * whatever order the array is in. What it pins is still worth pinning: the
   * number is the identifier and the amount is a detail about it, so the
   * category must be `id_number` in the manifest and the audit log.
   *
   * The array ordering is pinned by the test below, which is the one that
   * actually fails when the ordering changes.
   */
  assert.equal(
    classifyTextContent('Savings A/c 402711558903 · Available balance Rs. 1,84,220.55')?.category,
    'id_number',
  );
  assert.equal(
    classifyTextContent('Policy 8842551009 · Term Life · Sum assured Rs. 1,00,00,000')?.category,
    'id_number',
  );
});

test('the amount rule is last, so every pattern above it keeps first claim', () => {
  /*
   * The real ordering guarantee, and the reason the amount rule is APPENDED to
   * CONTENT_PATTERNS rather than inserted.
   *
   * "Rs. 98765 43210" is both a currency amount and a phone number by shape.
   * Phone is declared first, so phone wins and the category is right. Move the
   * amount rule up and this becomes `other` — a phone number recorded as an
   * unidentified value, which is still redacted but is mislabelled everywhere
   * it is reported.
   *
   * Verified by moving the pattern and watching this fail, which is the only
   * reason it is trusted.
   */
  assert.equal(classifyTextContent('Call Rs. 98765 43210 now')?.category, 'phone');
});

/*
 * Names in prose, by gazetteer — added 2026-09-23.
 *
 * SECURITY_PRIVACY.md Section 5.1 said for months that this could not be done
 * without a named-entity model. It still cannot: what ships is a list, and the
 * tests below pin the limit as carefully as the capability, because the limit
 * is what the demo answer and the privacy policy now rest on.
 */

test('a listed given name followed by a surname is found', () => {
  for (const text of [
    'Account holder: Priya Raghunathan',
    'Welcome back, Rohan Mehra',
    'Life assured: Meera Pillai, DOB 12 Mar 1990',
    'Elector: Vikram Sundaram, Age 41',
  ]) {
    assert.equal(classifyTextContent(text)?.category, 'name', `not caught: ${text}`);
  }
});

test('the surname is never checked, which is what makes this more than a lookup', () => {
  // Neither surname is in any list we ship, and both are caught. If this ever
  // starts failing, someone has made the rule require both halves and it will
  // only find people we already knew about.
  assert.equal(classifyTextContent('Priya Raghunathan')?.category, 'name');
  assert.equal(classifyTextContent('Vikram Sundaram')?.category, 'name');
});

test('the limit is real: an unlisted given name is invisible', () => {
  /*
   * The assertion the honest claim depends on. A gazetteer has no notion of
   * "looks like a name" — a name is on the list or it is nothing, with nothing
   * in between, and that is exactly what a named-entity model would fix.
   *
   * If these ever start passing, SECURITY_PRIVACY.md 5.1, PRIVACY.md and the
   * demo Q&A are all overstating or understating something and must be re-read.
   */
  assert.notEqual(classifyTextContent('Account holder: Bartholomew Quibblesworth')?.category, 'name');
  assert.notEqual(classifyTextContent('Signed by Þórunn Eiríksdóttir')?.category, 'name');
});

test('a surname on its own is not a name, and neither is ordinary prose', () => {
  // The two-token rule is what keeps the ambiguous list entries safe: "Raj",
  // "Dev" and "Tara" are ordinary words in Indian English and none of them
  // fires without a capitalised surname after it.
  for (const text of [
    'Please contact Mr Sundaram for details',
    'The Raj era ended in 1947',
    'Dev builds are not for production',
    'Tara means star',
  ]) {
    assert.notEqual(classifyTextContent(text)?.category, 'name', `over-flagged: ${text}`);
  }
});

test('a reason for a name never quotes the name', () => {
  // The reason string is printed to the console and shown in the overlay.
  // Quoting the match would publish exactly what was just detected.
  const found = classifyTextContent('Account holder: Priya Raghunathan');
  assert.ok(found);
  assert.equal(found.reason.includes('Priya'), false);
  assert.equal(found.reason.includes('Raghunathan'), false);
});
