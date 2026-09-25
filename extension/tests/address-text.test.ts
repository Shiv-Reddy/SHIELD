import assert from 'node:assert/strict';
import { test } from 'node:test';

import { classifyTextContent } from '../src/lib/pii/dom-rules';
import { scrubTextContent } from '../src/lib/redaction/placeholders';

// The support-desk page, 2026-09-25: an address written in a customer's
// message went out in full, because addresses were only caught in form fields.

test('an address in a sentence is flagged', () => {
  assert.equal(classifyTextContent('Please deliver it to 12 Park Street, Kolkata 700016.')?.category, 'address');
});

test('and the text cleaner removes both halves of it', () => {
  const scrubbed = scrubTextContent('Please deliver it to 12 Park Street, Kolkata 700016.');
  assert.doesNotMatch(scrubbed, /Park Street|Kolkata|700016/);
  assert.match(scrubbed, /\[ADDRESS\]/);
});

test('a city and PIN on their own are an address', () => {
  assert.equal(classifyTextContent('Pune 411001')?.category, 'address');
  assert.equal(classifyTextContent('Flat 4, 221 MG Road')?.category, 'address');
});

test('ordinary operational text is left readable', () => {
  for (const text of [
    'Branch 0142 · KYC desk · Shift 2',
    'Round 1 counselling',
    'Order OD-44871 · Delivered yesterday · Priority: high',
    'Aurora X2 smartphone, 128 GB',
    '10 applications waiting · review within 24 hours',
    'Anytown, Demo State - 000000',
  ]) {
    assert.equal(classifyTextContent(text), null, text);
  }
});
