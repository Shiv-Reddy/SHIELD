/**
 * Configurable redaction aggressiveness — PRD.md FR-14, DECISIONS.md 234.
 *
 * THE PROPERTY THAT MATTERS
 *
 * **The setting can only ever increase what is hidden.** `standard` is the
 * floor of the range, not its midpoint, because CLAUDE.md's uncertainty rule
 * and `dom-rules.ts`'s refusal to gate redaction on confidence together make a
 * lax end impossible rather than merely unwise. Most of what is below tests
 * that the failure directions all point the same way: a typo, a corrupted
 * value, a missing key and a caller that forgot the argument must every one of
 * them land on `standard` or above.
 *
 * The floors themselves are rows from the sweep in docs/BENCHMARK.md. A test
 * pins them to that sweep rather than to round numbers, so a floor edited
 * without re-running the measurement fails here.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  REDACTION_FLOORS,
  redactionLevelFrom,
} from '../src/lib/settings';
import type { RedactionLevel } from '../src/lib/settings';
import { MIN_HEIGHT, MIN_WIDTH, imageCandidates } from '../src/lib/pii/image-candidates';
import type { DomElement } from '../src/lib/types';

function image(elementId: string, width: number, height: number): DomElement {
  return {
    elementId,
    elementType: 'image',
    selector: `#${elementId}`,
    label: null,
    value: null,
    inputType: null,
    autocomplete: null,
    name: null,
    placeholder: null,
    position: { x: 0, y: 0, width, height },
  };
}

const LEVELS: RedactionLevel[] = ['standard', 'thorough', 'maximum'];

// --- The range only goes up --------------------------------------------------

test('standard is the floor of the range, never its middle', () => {
  // Every level examines at least as much as standard does. If a level ever
  // sat above standard's floor it would be letting pictures through that the
  // default reads, which is the one thing this setting must not be able to do.
  for (const level of LEVELS) {
    assert.ok(REDACTION_FLOORS[level].width <= REDACTION_FLOORS.standard.width);
    assert.ok(REDACTION_FLOORS[level].height <= REDACTION_FLOORS.standard.height);
  }
});

test('standard matches the shipped floor exactly', () => {
  // Two copies of this number would drift, and the drift would be silent.
  assert.equal(REDACTION_FLOORS.standard.width, MIN_WIDTH);
  assert.equal(REDACTION_FLOORS.standard.height, MIN_HEIGHT);
});

test('the levels are strictly ordered, so "thorough" is never "maximum"', () => {
  assert.ok(REDACTION_FLOORS.maximum.width < REDACTION_FLOORS.thorough.width);
  assert.ok(REDACTION_FLOORS.thorough.width < REDACTION_FLOORS.standard.width);
});

test('the floors are the measured rows, not round numbers somebody liked', () => {
  // Pinned to the sweep in docs/BENCHMARK.md. Editing a floor without re-running
  // the measurement should fail here rather than quietly ship a guess.
  assert.deepEqual(REDACTION_FLOORS.standard, { width: 140, height: 80 });
  assert.deepEqual(REDACTION_FLOORS.thorough, { width: 100, height: 57 });
  assert.deepEqual(REDACTION_FLOORS.maximum, { width: 40, height: 23 });
});

// --- Every failure direction lands on standard or above ----------------------

test('an unrecognised value is standard, not a loosening', () => {
  assert.equal(redactionLevelFrom('relaxed'), 'standard');
  assert.equal(redactionLevelFrom('off'), 'standard');
  assert.equal(redactionLevelFrom('THOROUGH'), 'standard');
});

test('a missing, null or non-string value is standard', () => {
  assert.equal(redactionLevelFrom(undefined), 'standard');
  assert.equal(redactionLevelFrom(null), 'standard');
  assert.equal(redactionLevelFrom(0), 'standard');
  assert.equal(redactionLevelFrom(true), 'standard');
  assert.equal(redactionLevelFrom({}), 'standard');
});

test('the two real levels are accepted', () => {
  assert.equal(redactionLevelFrom('thorough'), 'thorough');
  assert.equal(redactionLevelFrom('maximum'), 'maximum');
});

// --- What the levels actually do ---------------------------------------------

test('a level above standard reads pictures standard would not', () => {
  const small = image('i1', 110, 64);
  assert.equal(imageCandidates([small], REDACTION_FLOORS.standard).length, 0);
  assert.equal(imageCandidates([small], REDACTION_FLOORS.thorough).length, 1);
});

test('no level lets through a picture standard would read', () => {
  // The direction that would be a privacy regression. Asserted over an actual
  // card-sized image rather than argued from the numbers.
  const card = image('i1', 400, 250);
  for (const level of LEVELS) {
    assert.equal(imageCandidates([card], REDACTION_FLOORS[level]).length, 1, level);
  }
});

test('maximum reaches a thumbnail that thorough still declines', () => {
  const thumb = image('i1', 60, 35);
  assert.equal(imageCandidates([thumb], REDACTION_FLOORS.thorough).length, 0);
  assert.equal(imageCandidates([thumb], REDACTION_FLOORS.maximum).length, 1);
});

test('the aspect bounds still apply at every level', () => {
  // A level changes the SIZE floor and nothing else. A banner strip is not a
  // document at any setting, and blacking one out would be the furniture
  // problem the size floor exists to avoid, reintroduced through this door.
  const banner = image('i1', 900, 40);
  for (const level of LEVELS) {
    assert.equal(imageCandidates([banner], REDACTION_FLOORS[level]).length, 0, level);
  }
});
