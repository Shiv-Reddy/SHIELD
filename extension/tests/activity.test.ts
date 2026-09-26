import assert from 'node:assert/strict';
import { test } from 'node:test';

import { describeAction, describeHidden, pastTense } from '../src/lib/activity';
import type { RedactedDomEntry, ShieldAction } from '../src/lib/types';

function entry(elementId: string, label: string | null, value: string | null): RedactedDomEntry {
  return { elementId, elementType: 'button', label, value } as RedactedDomEntry;
}

test('hidden counts read as a sentence, largest first as given', () => {
  assert.equal(
    describeHidden([
      { category: 'id_number', count: 30 },
      { category: 'name', count: 10 },
      { category: 'face', count: 1 },
    ]),
    '30 ID numbers, 10 names and 1 face',
  );
  assert.equal(describeHidden([{ category: 'email', count: 1 }]), '1 email');
});

test('an action is described from the redacted entry the AI was shown', () => {
  const action: ShieldAction = { type: 'click', selector: 'e7', value: null };
  const entries = [entry('e7', 'Approve application KYC-2043', null)];
  assert.equal(describeAction(action, entries), 'click “Approve application KYC-2043”');
});

test('a label holding a hidden value stays hidden in the feed', () => {
  const action: ShieldAction = { type: 'click', selector: 'e2', value: null };
  const entries = [entry('e2', '[NAME]', null)];
  assert.equal(describeAction(action, entries), 'click “[NAME]”');
});

test('typing says what was typed and where, shortened when long', () => {
  const action: ShieldAction = {
    type: 'type',
    selector: 'e3',
    value: 'A free replacement will be delivered within 3 days. Sorry for the trouble.',
  };
  const described = describeAction(action, [entry('e3', 'Write a reply', null)]);
  assert.match(described, /^type “A free replacement will be delivered within 3 d…” into “Write a reply”$/);
});

test('an element the AI named but Shield never listed is not invented', () => {
  const action: ShieldAction = { type: 'click', selector: 'missing', value: null };
  assert.equal(describeAction(action, []), 'click “an item on the page”');
});

test('past tense for lines about what was done', () => {
  assert.equal(pastTense('click “Send reply”'), 'clicked “Send reply”');
  assert.equal(pastTense('type “Hi” into “Reply”'), 'typed “Hi” into “Reply”');
  assert.equal(pastTense('scroll the page'), 'scrolled the page');
});
