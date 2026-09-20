/**
 * The latency/accuracy trade-off study — TASKS.md Tier 3, DECISIONS.md 233.
 *
 * Two properties matter more than the numbers here.
 *
 * First, that an UNMEASURED cost stays unmeasured. Node cannot run ONNX or
 * Tesseract, so any millisecond figure this module produced itself would be a
 * guess wearing a measurement's clothes. Nulls must survive to the report and
 * must not be quietly rendered as zero, because a zero in a cost column reads
 * as "free" and a zero in a `found` column reads as "broken" — both are
 * confident statements about something nobody has run.
 *
 * Second, that the size-floor sweep goes through the SHIPPED `imageCandidates`
 * with its floor passed in, not through a copy of its geometry. A sweep over a
 * reimplementation measures the reimplementation, and would keep reporting a
 * comfortable knee after the real rule had moved.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LAYERS, candidateFloorCurve, layerCurve } from '../src/lib/benchmark/tradeoff';
import type { TradeoffPage } from '../src/lib/benchmark/tradeoff';
import { MIN_HEIGHT, MIN_WIDTH } from '../src/lib/pii/image-candidates';
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

function field(elementId: string): DomElement {
  return {
    elementId,
    elementType: 'input',
    selector: `#${elementId}`,
    label: 'Email',
    value: 'a@b.com',
    inputType: 'text',
    autocomplete: 'email',
    name: null,
    placeholder: null,
    position: { x: 0, y: 0, width: 200, height: 40 },
  };
}

function page(input: DomElement[], sensitive: TradeoffPage['sensitive']): TradeoffPage {
  return {
    id: 'p1',
    source: 'fixture',
    input,
    elements: input.map((item) => ({ elementId: item.elementId, position: item.position })),
    sensitive,
  };
}

// --- The layer curve ---------------------------------------------------------

test('a cost nobody has measured stays null rather than becoming zero', () => {
  // A zero here would read as "this layer is free", which is a confident claim
  // about a number that does not exist.
  const imageOcr = LAYERS.find((layer) => layer.name === 'Image OCR');
  assert.equal(imageOcr?.costMs, null);
  const point = layerCurve([page([field('f1')], [])]).find((p) => p.name === 'Image OCR');
  assert.equal(point?.costMs, null);
});

test('every quoted cost carries where it was recorded', () => {
  for (const layer of LAYERS) {
    assert.ok(layer.source.length > 0, `${layer.name} has a cost with no source`);
  }
});

test('the cumulative cost stops accumulating once a layer is unmeasured', () => {
  // Carrying on past an unknown would produce a total that looks complete and
  // silently omits one of its terms.
  const curve = layerCurve([page([field('f1')], [])]);
  const afterUnmeasured = curve.slice(
    curve.findIndex((point) => point.costMs === null),
  );
  assert.ok(afterUnmeasured.every((point) => point.cumulativeCostMs === null));
});

test('only the layer that actually ran reports what it found', () => {
  const curve = layerCurve([page([field('f1')], [{ elementId: 'f1', category: 'email' }])]);
  assert.equal(curve[0]?.name, 'DOM rules');
  assert.equal(curve[0]?.found, 1);
  assert.ok(curve.slice(1).every((point) => point.found === null));
});

test('whole-frame text owns no labels, because it is scored as agreement instead', () => {
  // Crediting it with labels here would hand it finds the DOM path is making,
  // and metric 1 would be counted twice under two different names.
  const curve = layerCurve([page([field('f1')], [{ elementId: 'f1', category: 'email' }])]);
  assert.equal(curve.find((point) => point.name === 'Whole-frame text')?.owns, 0);
});

test('an image label is owned by the image layer, not by the DOM rules', () => {
  const pages = [
    page(
      [image('i1', 400, 250), field('f1')],
      [
        { elementId: 'i1', category: 'id_number' },
        { elementId: 'f1', category: 'email' },
      ],
    ),
  ];
  const curve = layerCurve(pages);
  assert.equal(curve.find((point) => point.name === 'DOM rules')?.owns, 1);
  assert.equal(curve.find((point) => point.name === 'Image OCR')?.owns, 1);
});

// --- The size floor sweep ----------------------------------------------------

test('the sweep moves the real floor, not a copy of it', () => {
  // An image below the shipped floor and above a loosened one. If the sweep
  // were reimplementing the geometry, or pre-filtering around a hardcoded
  // floor, this image would never appear at any setting.
  const small = image('i1', 100, 60);
  const pages = [page([small], [{ elementId: 'i1', category: 'id_number' }])];

  const atShipped = candidateFloorCurve(pages, [MIN_WIDTH]);
  const atLoose = candidateFloorCurve(pages, [80]);

  assert.equal(atShipped[0]?.candidates, 0);
  assert.equal(atLoose[0]?.candidates, 1);
});

test('lowering the floor costs precision and raises the crop count', () => {
  const pages = [
    page(
      [image('doc', 400, 250), image('icon1', 100, 60), image('icon2', 110, 64)],
      [{ elementId: 'doc', category: 'id_number' }],
    ),
  ];
  const [loose, shipped] = candidateFloorCurve(pages, [80, MIN_WIDTH]);
  assert.ok(loose && shipped);
  assert.ok(loose.candidates > shipped.candidates);
  assert.ok(loose.precision < shipped.precision);
  assert.ok(loose.relativeCost > shipped.relativeCost);
});

test('relative cost is anchored at the shipped floor, whatever the sweep asks for', () => {
  // The anchor must not drift to the first row, or a sweep that happened to
  // start somewhere else would silently renormalise every figure in the table.
  const pages = [page([image('doc', 400, 250)], [{ elementId: 'doc', category: 'id_number' }])];
  const [only] = candidateFloorCurve(pages, [MIN_WIDTH]);
  assert.equal(only?.relativeCost, 1);
  assert.equal(only?.minHeight, MIN_HEIGHT);
});

test('a corpus with no images reports full recall rather than dividing by zero', () => {
  const [point] = candidateFloorCurve([page([field('f1')], [])], [MIN_WIDTH]);
  assert.equal(point?.sensitiveTotal, 0);
  assert.equal(point?.recall, 1);
  assert.equal(point?.precision, 1);
});
