/**
 * The naive-baseline comparison — TASKS.md Tier 3, DECISIONS.md 232.
 *
 * This is a persuasion artefact, which makes it the most dangerous thing in the
 * benchmark: it exists to be quoted at judges, and a comparison that flatters
 * the thing it is comparing is worth less than none. So the tests here are
 * mostly about the baselines being REAL — that blanket blur genuinely wins on
 * coverage and recall, that the strategies paint what they claim to, and that
 * `contextRetained` measures something the detection metrics do not.
 *
 * If a change ever makes Shield win every column, something is wrong with the
 * baselines, not right with Shield. The test below asserts that blanket blur
 * beats Shield on coverage, on purpose.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BASELINES, scoreAllBaselines, scoreBaseline } from '../src/lib/benchmark/baselines';
import type { BaselineName, BaselinePage } from '../src/lib/benchmark/baselines';
import type { DomElement } from '../src/lib/types';

function element(
  elementId: string,
  elementType: DomElement['elementType'],
  overrides: Partial<DomElement> = {},
): DomElement {
  return {
    elementId,
    elementType,
    selector: `#${elementId}`,
    label: null,
    value: null,
    inputType: elementType === 'input' ? 'text' : null,
    autocomplete: null,
    name: null,
    placeholder: null,
    position: { x: 0, y: 0, width: 200, height: 40 },
    ...overrides,
  };
}

/**
 * One page: a sensitive email field, a harmless button, and a line of rendered
 * text. Small enough that every count below can be checked by hand.
 */
function page(): BaselinePage {
  const input: DomElement[] = [
    element('f1', 'input', { label: 'Email', autocomplete: 'email', value: 'a@b.com' }),
    element('b1', 'button', { label: 'Sign in' }),
    element('t1', 'text', { value: 'Welcome back' }),
  ];

  return {
    id: 'p1',
    source: 'fixture',
    input,
    elements: input.map((item) => ({ elementId: item.elementId, position: item.position })),
    sensitive: [{ elementId: 'f1', category: 'email' }],
  };
}

function find(name: BaselineName) {
  const baseline = BASELINES.find((entry) => entry.name === name);
  assert.ok(baseline, `no baseline named ${name}`);
  return baseline;
}

test('no-redaction paints nothing and keeps the whole page', () => {
  const score = scoreBaseline(find('none'), [page()]);
  assert.equal(score.recall, 0);
  assert.equal(score.coverage, 0);
  assert.equal(score.contextRetained, 1);
});

test('blanket blur paints every element, including the ones nobody needed hidden', () => {
  const score = scoreBaseline(find('blanket'), [page()]);
  assert.equal(score.recall, 1);
  assert.equal(score.coverage, 1);
  // Two non-sensitive elements on the page, both destroyed.
  assert.equal(score.contextTotal, 2);
  assert.equal(score.contextLost, 2);
  assert.equal(score.contextRetained, 0);
});

test('hiding every field leaves text and buttons alone', () => {
  const score = scoreBaseline(find('all-inputs'), [page()]);
  // The email field is the only input, and it is the only sensitive element.
  assert.equal(score.recall, 1);
  assert.equal(score.contextLost, 0);
  assert.equal(score.contextRetained, 1);
});

test('hiding every value reaches rendered text, and pays for it', () => {
  const score = scoreBaseline(find('all-values'), [page()]);
  assert.equal(score.recall, 1);
  // The text node carries a value, so it goes; the button does not, so it stays.
  assert.equal(score.contextLost, 1);
  assert.equal(score.contextTotal, 2);
});

test('a naive strategy never claims a category, because a blur cannot know one', () => {
  // Crediting a blur with a category would let it score on categoryAccuracy for
  // information it does not have, and the placeholder claim is half of what
  // separates Shield from it.
  const detections = find('blanket').detect(page().input);
  assert.equal(detections.length, 3);
  assert.ok(detections.every((detection) => detection.category === 'other'));
});

test('context is counted over non-sensitive elements only', () => {
  // A strategy that hides exactly the sensitive element has destroyed no
  // context, even though it painted something. Counting every painted element
  // would make a perfect detector look lossy.
  const score = scoreBaseline(find('all-inputs'), [page()]);
  assert.equal(score.contextTotal, 2);
  assert.equal(score.contextLost, 0);
});

test('blanket blur BEATS Shield on coverage, and that is the finding', () => {
  // The whole comparison exists because this is true. If it ever stops being
  // true the baselines have been weakened, and the artefact is worthless.
  const scores = scoreAllBaselines([page()]);
  const blanket = scores.find((score) => score.name === 'blanket');
  const shield = scores.find((score) => score.name === 'shield');
  assert.ok(blanket && shield);
  assert.ok(blanket.coverage >= shield.coverage);
  // And loses decisively on the column that says whether the page still works.
  assert.ok(blanket.contextRetained < shield.contextRetained);
});

test('every strategy is scored, and Shield is one row among them', () => {
  const scores = scoreAllBaselines([page()]);
  assert.equal(scores.length, BASELINES.length);
  assert.ok(scores.some((score) => score.name === 'shield'));
});

test('an empty corpus reports no context rather than dividing by zero', () => {
  const score = scoreBaseline(find('blanket'), []);
  assert.equal(score.contextTotal, 0);
  assert.equal(score.contextRetained, 1);
});
