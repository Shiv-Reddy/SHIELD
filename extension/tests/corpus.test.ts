/**
 * The corpus, checked as data.
 *
 * None of this asserts a score. A test that pinned recall to a number would
 * have to be edited every time the corpus grew, and the edit would look
 * exactly like tuning the corpus to protect a figure — which is the one thing
 * this whole apparatus exists to prevent.
 *
 * What is checked here is that the corpus is well formed and still honest about
 * itself: unique pages, labels that name elements that exist, controls that are
 * genuinely unlabelled, and a source column that has not quietly started
 * claiming pages nobody outside this project wrote.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CORPUS, captureProblems } from '../benchmark/corpus';
import { GOVERNMENT } from '../benchmark/pages/government';
import { BANKING } from '../benchmark/pages/banking';
import { TELECOM } from '../benchmark/pages/telecom';
import { SERVICES } from '../benchmark/pages/services';
import { CONTROLS } from '../benchmark/pages/controls';
import { DOCUMENTS } from '../benchmark/pages/documents';
import { PIXEL_READINGS, PIXEL_TRUTH } from '../benchmark/pixels';

test('the corpus is at least the thirty pages T1.1 asked for', () => {
  assert.ok(CORPUS.length >= 30, `only ${CORPUS.length} pages`);
});

test('no two pages share an id', () => {
  const seen = new Set<string>();
  for (const page of CORPUS) {
    assert.equal(seen.has(page.id), false, `duplicate page id ${page.id}`);
    seen.add(page.id);
  }
});

test('every label names an element that is on its page', () => {
  // A label for an element that does not exist is counted as expected and never
  // found, which reads in the report as a detector failure. `page()` throws on
  // this for the authored pages; the hand-written fixtures do not go through it.
  for (const page of CORPUS) {
    const known = new Set(page.input.map((element) => element.elementId));
    for (const entry of page.sensitive) {
      assert.ok(known.has(entry.elementId), `${page.id}: ${entry.elementId} is not on the page`);
    }
  }
});

test('the boxes the scorer measures are the boxes the detector was given', () => {
  for (const page of CORPUS) {
    assert.equal(page.elements.length, page.input.length, page.id);
    for (const element of page.input) {
      const box = page.elements.find((entry) => entry.elementId === element.elementId);
      assert.deepEqual(box?.position, element.position, `${page.id} ${element.elementId}`);
    }
  }
});

test('the corpus keeps pages where the correct answer is nothing', () => {
  // Precision is only measurable where being wrong is possible. Without these
  // the way to score well is to flag everything.
  const controls = CORPUS.filter((page) => page.sensitive.length === 0);
  assert.ok(controls.length >= 3, `only ${controls.length} control pages`);
});

test('the control pages are dense, not blank', () => {
  // A blank page proves nothing about precision. Every control here is full of
  // strings shaped like the things Shield hunts.
  for (const page of CORPUS.filter((entry) => entry.sensitive.length === 0)) {
    assert.ok(page.input.length >= 5, `${page.id} has only ${page.input.length} elements`);
  }
});

test('the source column still says where every page came from', () => {
  for (const page of CORPUS) {
    assert.ok(
      ['fixture', 'synthetic', 'real'].includes(page.source),
      `${page.id} has source "${page.source}"`,
    );
  }
});

test('nothing written by hand can call itself real', () => {
  // The one label in this corpus that has to be earned. `loadCaptured` is the
  // only thing that sets it, so a page declared `real` in a source file would
  // be a page claiming an origin it does not have — the exact self-flattery the
  // source column exists to prevent.
  const compiledIn = [...GOVERNMENT, ...BANKING, ...TELECOM, ...SERVICES, ...CONTROLS, ...DOCUMENTS];

  for (const page of compiledIn) {
    assert.notEqual(page.source, 'real', `${page.id} is written here and claims to be real`);
  }

  for (const page of CORPUS.filter((entry) => entry.source === 'real')) {
    assert.ok(page.input.length > 0, `${page.id} is empty`);
  }
});

test('a capture that could not be scored is named, never silently dropped', () => {
  // A captured page with no labels would score as a page with nothing sensitive
  // on it and quietly raise precision. Anything skipped has to say why.
  for (const problem of captureProblems) {
    assert.ok(problem.why.length > 0, `${problem.file} was skipped without a reason`);
  }
});

test('every page carrying pixel truth is in the corpus', () => {
  // A typo in a page id would leave the boxes silently attached to nothing, and
  // the pixel layer would quietly measure less than the file claims.
  const ids = new Set(CORPUS.map((page) => page.id));
  for (const id of Object.keys(PIXEL_TRUTH)) {
    assert.ok(ids.has(id), `pixel truth names ${id}, which is not a corpus page`);
  }
  for (const id of Object.keys(PIXEL_READINGS)) {
    assert.ok(ids.has(id), `a pixel reading names ${id}, which is not a corpus page`);
  }
});

test('pixel boxes sit inside the surface they were measured on', () => {
  // The sample documents are 640x380. A box outside that is an arithmetic error
  // in the typographic model, and it would show up as an unexplainable miss.
  for (const [id, regions] of Object.entries(PIXEL_TRUTH)) {
    const reading = PIXEL_READINGS[id];
    if (!reading) continue;
    for (const region of regions) {
      const { x, y, width, height } = region.position;
      assert.ok(x >= 0 && y >= 0, `${id}: ${region.what} starts off the document`);
      assert.ok(
        x + width <= reading.width && y + height <= reading.height,
        `${id}: ${region.what} runs off the document`,
      );
    }
  }
});

test('no labelled pixel region is empty', () => {
  for (const [id, regions] of Object.entries(PIXEL_TRUTH)) {
    for (const region of regions) {
      assert.ok(region.position.width > 0 && region.position.height > 0, `${id}: ${region.what}`);
      assert.ok(region.what.length > 0, `${id} has an unnamed region`);
    }
  }
});
