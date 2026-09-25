import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isFinalClick } from '../src/lib/committing';
import type { DomElement, ShieldAction } from '../src/lib/types';

const at = { x: 0, y: 0, width: 10, height: 10 };

function element(elementType: DomElement['elementType'], label: string | null, value: string | null = null): DomElement {
  return {
    elementId: 'e1',
    elementType,
    selector: '#e1',
    label,
    value,
    inputType: null,
    autocomplete: null,
    name: null,
    placeholder: null,
    position: at,
  };
}

const click: ShieldAction = { type: 'click', selector: 'e1', value: null };

// The run that made this necessary: an approval, then another, on a stateless
// reasoner that could not tell "done" from "next".
test('approving an application ends the run', () => {
  assert.equal(isFinalClick(click, element('button', 'Approve application KYC-2043', 'Approve')), true);
});

test('the other commitments the demo pages make end it too', () => {
  for (const words of ['Sign in', 'Create account', 'Register', 'Transfer', 'Send Payment', 'Reject application KYC-2041']) {
    assert.equal(isFinalClick(click, element('button', words)), true, words);
  }
});

test('the decisions on the other workplace pages are final too', () => {
  for (const words of ['Release salary for EMP-0415', 'Shortlist applicant ADM-3106', 'Send reply', 'Issue refund', 'Hold salary for EMP-0412']) {
    assert.equal(isFinalClick(click, element('button', words)), true, words);
  }
});

test('a submit input carries its words in value, and still counts', () => {
  assert.equal(isFinalClick(click, element('button', null, 'Transfer')), true);
});

test('ticking a consent box does not end the run, because a sign-up continues after it', () => {
  assert.equal(isFinalClick(click, element('input', 'I accept the terms of service', 'unchecked')), false);
});

test('typing and scrolling are never final', () => {
  const target = element('button', 'Approve');
  assert.equal(isFinalClick({ type: 'type', selector: 'e1', value: '250' }, target), false);
  assert.equal(isFinalClick({ type: 'scroll', selector: 'e1', value: null }, target), false);
});

test('an ordinary button is not final', () => {
  assert.equal(isFinalClick(click, element('button', 'Show more')), false);
  assert.equal(isFinalClick(click, element('button', 'Next')), false);
});

test('an element that cannot be found is not treated as final', () => {
  assert.equal(isFinalClick(click, undefined), false);
});
