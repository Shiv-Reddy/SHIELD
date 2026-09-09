/**
 * The element-map export — the one thing added this session that could break
 * the invariant, so it is tested as such.
 *
 * The tests worth having here are not "does it produce JSON". They are: does a
 * URL get out, does a password get out, and does the review list actually
 * contain everything the file will. The third is the load-bearing one — the
 * whole safety argument is that nobody writes values they have not been shown,
 * and a review that omits a value silently is worse than no review at all,
 * because it is read as a complete list.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  PASSWORD_SENTINEL,
  mapExportFilename,
  mapExportJson,
  reviewableValues,
} from '../src/lib/benchmark/export-map';
import type { DomElement } from '../src/lib/types';
import { SCREEN_2_SIGNUP } from './fixtures/screens';

function element(overrides: Partial<DomElement> & { elementId: string }): DomElement {
  return {
    elementType: 'input',
    selector: `html > body #${overrides.elementId}`,
    label: null,
    value: null,
    inputType: 'text',
    autocomplete: null,
    name: null,
    placeholder: null,
    position: { x: 0, y: 0, width: 240, height: 32 },
    ...overrides,
  };
}

// --- What must not travel ----------------------------------------------------

test('the page URL is never written, however it arrives', () => {
  const json = mapExportJson(
    { elements: [element({ elementId: 'a', value: 'hello' })], pageUrl: 'https://bank.example/me' },
    'a page',
  );

  assert.equal(json.includes('bank.example'), false);
  assert.equal(json.includes('pageUrl'), false);
});

test('a field added to DomElement cannot start travelling by accident', () => {
  // The elements are copied field by field rather than spread, so anything new
  // has to be added here deliberately. This asserts the copy, not the fields.
  const smuggled = {
    ...element({ elementId: 'a', value: 'hello' }),
    innerText: 'a secret nobody meant to export',
  } as DomElement;

  assert.equal(mapExportJson({ elements: [smuggled] }, '').includes('nobody meant'), false);
});

test('a password reaches the file as the sentinel it already was, never as a secret', () => {
  // dom-map.ts never reads a password field's value. This checks the export
  // does not invent a way to, and that the review does not pad itself with a
  // sentinel that tells the reader nothing.
  const password = element({
    elementId: 'p',
    inputType: 'password',
    value: PASSWORD_SENTINEL,
  });

  assert.deepEqual(reviewableValues([password]), []);
  assert.equal(mapExportJson({ elements: [password] }, '').includes(PASSWORD_SENTINEL), true);
});

// --- The review is the safety argument, so it has to be complete -------------

test('every value in the file appears in the review', () => {
  const listed = new Set(reviewableValues(SCREEN_2_SIGNUP).map((entry) => entry.value));
  const parsed = JSON.parse(mapExportJson({ elements: SCREEN_2_SIGNUP }, '')) as {
    elements: DomElement[];
  };

  for (const entry of parsed.elements) {
    const value = entry.value?.trim();
    if (!value || value === PASSWORD_SENTINEL) continue;
    assert.ok(listed.has(value), `${entry.elementId} is in the file but not in the review`);
  }
});

test('an empty value is not listed, so the review stays worth reading', () => {
  const rows = reviewableValues([
    element({ elementId: 'a', value: '' }),
    element({ elementId: 'b', value: '   ' }),
    element({ elementId: 'c', value: null }),
    element({ elementId: 'd', value: 'real' }),
  ]);

  assert.deepEqual(
    rows.map((row) => row.elementId),
    ['d'],
  );
});

test('a value is named by whatever the page gives us to recognise it by', () => {
  const rows = reviewableValues([
    element({ elementId: 'a', label: 'Aadhaar number', value: '1' }),
    element({ elementId: 'b', name: 'pan', value: '2' }),
    element({ elementId: 'c', placeholder: 'Account', value: '3' }),
    element({ elementId: 'd', elementType: 'text', value: '4' }),
  ]);

  assert.deepEqual(
    rows.map((row) => row.field),
    ['Aadhaar number', 'pan', 'Account', 'text'],
  );
});

// --- The file itself ---------------------------------------------------------

test('the export declares what it is and what it contains', () => {
  const parsed = JSON.parse(mapExportJson({ elements: [] }, 'state portal, logged out')) as {
    kind: string;
    about: string;
    note: string;
  };

  assert.equal(parsed.kind, 'shield-element-map');
  assert.equal(parsed.about, 'state portal, logged out');
  assert.match(parsed.note, /logged-out or synthetic-data/);
});

test('the note is plain ASCII, like every other file we hand somebody', () => {
  // DECISIONS.md 156: the first real audit export came back as mojibake in the
  // one sentence whose job is to reassure the reader.
  const parsed = JSON.parse(mapExportJson({ elements: [] }, '')) as { note: string };
  assert.match(parsed.note, /^[\x20-\x7e]+$/);
});

test('the filename says what the file is and not where it came from', () => {
  const name = mapExportFilename(new Date('2026-09-09T10:20:30.400Z'));

  assert.equal(name, 'shield-element-map-2026-09-09T10-20-30-400Z.json');
  // Safe on Windows, which is where this project is developed.
  assert.equal(/[:*?"<>|]/.test(name), false);
});
