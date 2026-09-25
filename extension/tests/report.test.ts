import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { AuditEntry } from '../src/lib/audit';
import { complianceSummary } from '../src/lib/report';

const DAY = 86_400_000;
const NOW = new Date('2026-09-25T15:00:00').getTime();

function entry(overrides: Partial<AuditEntry>): AuditEntry {
  return {
    at: NOW,
    kind: 'run',
    examined: 'viewport',
    transmitted: true,
    counts: [],
    total: 0,
    rules: [],
    durationMs: null,
    ...overrides,
  };
}

const LOG: AuditEntry[] = [
  entry({ total: 29, counts: [{ category: 'id_number', count: 16 }, { category: 'name', count: 6 }, { category: 'other', count: 5 }, { category: 'phone', count: 1 }, { category: 'email', count: 1 }], durationMs: 140 }),
  entry({ at: NOW - DAY, kind: 'scan', examined: 'document', transmitted: false, total: 10, counts: [{ category: 'name', count: 4 }, { category: 'id_number', count: 6 }] }),
  entry({ at: NOW - 2 * DAY, total: 3, counts: [{ category: 'password', count: 1 }, { category: 'email', count: 2 }], durationMs: 120 }),
];

test('every figure is a sum over the log, never an estimate', () => {
  const summary = complianceSummary(LOG, NOW);
  assert.equal(summary.protectedItems, 42);
  assert.equal(summary.passes, 3);
  assert.equal(summary.runs, 2);
  assert.equal(summary.scans, 1);
  assert.equal(summary.sentRedacted, 2);
  assert.equal(summary.keptLocal, 1);
});

test('categories add up to the total, largest first', () => {
  const summary = complianceSummary(LOG, NOW);
  assert.equal(summary.byCategory.reduce((sum, item) => sum + item.count, 0), summary.protectedItems);
  assert.equal(summary.byCategory[0]?.category, 'id_number');
  assert.equal(summary.byCategory[0]?.count, 22);
});

test('the typical time is the median of measured runs only', () => {
  assert.equal(complianceSummary(LOG, NOW).medianRunMs, 130);
});

test('the week is seven days ending today, zero-filled', () => {
  const week = complianceSummary(LOG, NOW).lastSevenDays;
  assert.equal(week.length, 7);
  assert.equal(week[6]?.items, 29);
  assert.equal(week[5]?.items, 10);
  assert.equal(week[4]?.items, 3);
  assert.equal(week[0]?.items, 0);
});

test('an empty log reports nothing, and claims nothing', () => {
  const summary = complianceSummary([], NOW);
  assert.equal(summary.protectedItems, 0);
  assert.equal(summary.medianRunMs, null);
  assert.equal(summary.firstAt, null);
  assert.deepEqual(summary.byCategory, []);
});
