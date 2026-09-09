/**
 * The audit log — PRD.md FR-26.
 *
 * One property matters more than the rest: this file is meant to be exported,
 * and an export gets attached to a ticket and pasted into a chat. Everything
 * here is really a test that nothing about the page survives into it.
 *
 * That is not a hypothetical concern for this project. The element map once
 * printed every label to the console on the reasoning that labels are page
 * structure rather than user input; a run against a real social feed put a list
 * of other people's names into exactly the kind of buffer that ends up in a bug
 * report. A log designed for sharing has to be narrower than that, not wider.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_ENTRIES,
  appendCapped,
  auditJson,
  buildAuditEntry,
  type AuditEntry,
} from '../src/lib/audit';
import type { SensitiveRegion } from '../src/lib/types';

function region(
  category: SensitiveRegion['category'],
  reason: string,
  elementId: string | null = 'e0',
): SensitiveRegion {
  return {
    regionId: `r-${category}-${reason}`,
    category,
    source: 'dom',
    confidence: 1,
    elementId,
    reason,
    position: { x: 10, y: 20, width: 100, height: 30 },
  };
}

function entry(overrides: Partial<AuditEntry> = {}): AuditEntry {
  return {
    at: Date.UTC(2026, 8, 9, 12, 0, 0),
    kind: 'run',
    examined: 'viewport',
    transmitted: true,
    counts: [{ category: 'password', count: 1 }],
    total: 1,
    rules: ['input type="password"'],
    durationMs: 150,
    ...overrides,
  };
}

// --- What an entry keeps ------------------------------------------------------

test('regions are reduced to categories, counts and rule names', () => {
  const built = buildAuditEntry(
    [
      region('password', 'input type="password"'),
      region('email', 'autocomplete="email"'),
      region('email', 'autocomplete="email"'),
    ],
    { kind: 'run', examined: 'viewport', transmitted: true },
  );

  assert.equal(built.total, 3);
  assert.deepEqual(built.counts, [
    { category: 'email', count: 2 },
    { category: 'password', count: 1 },
  ]);
  // Deduplicated: the same rule firing twice is one rule, not two.
  assert.deepEqual(built.rules, ['autocomplete="email"', 'input type="password"']);
});

test('an entry carries no element id and no coordinates', () => {
  // Both are about this page at this moment and are useless in a shared log.
  // The narrowing happens in one place so a call site cannot widen it.
  const built = buildAuditEntry([region('name', 'label says "name"')], {
    kind: 'run',
    examined: 'viewport',
    transmitted: true,
  });

  assert.equal('elementId' in built, false);
  assert.equal('position' in built, false);
  assert.equal(JSON.stringify(built).includes('e0'), false);
});

test('a pass that found nothing is still an entry', () => {
  // "Shield ran and found nothing" and "Shield did not run" are different
  // facts, and a log that only records the first is not an audit log.
  const built = buildAuditEntry([], {
    kind: 'run',
    examined: 'viewport',
    transmitted: true,
  });

  assert.equal(built.total, 0);
  assert.deepEqual(built.counts, []);
});

test('whether anything was transmitted is stated, not inferred', () => {
  // A scan sends nothing. The log says so rather than relying on the reader
  // knowing what a scan is.
  const scan = buildAuditEntry([region('id_number', 'text in image — Aadhaar')], {
    kind: 'scan',
    examined: 'document',
    transmitted: false,
  });

  assert.equal(scan.transmitted, false);
  assert.equal(scan.examined, 'document');
});

test('a scan that stopped early is recorded as partial, not as whole-page', () => {
  const built = buildAuditEntry([], {
    kind: 'scan',
    examined: 'document-partial',
    transmitted: false,
  });

  assert.equal(built.examined, 'document-partial');
});

// --- Keeping the log bounded --------------------------------------------------

test('the newest entry is first', () => {
  const older = entry({ at: 1 });
  const newer = entry({ at: 2 });

  assert.deepEqual(appendCapped([older], newer)[0], newer);
});

test('the oldest entries are dropped past the cap', () => {
  let entries: AuditEntry[] = [];
  for (let index = 0; index < MAX_ENTRIES + 25; index += 1) {
    entries = appendCapped(entries, entry({ at: index }));
  }

  assert.equal(entries.length, MAX_ENTRIES);
  // The most recent survived and the first ones did not.
  assert.equal(entries[0]?.at, MAX_ENTRIES + 24);
  assert.equal(entries.some((candidate) => candidate.at === 0), false);
});

test('a cap of zero still keeps the entry just recorded', () => {
  // Dropping the pass being recorded in order to honour a cap would be a log
  // that silently discards its own newest fact.
  assert.equal(appendCapped([], entry(), 0).length, 1);
});

// --- The export ----------------------------------------------------------------

test('the export carries no values, labels or URLs', () => {
  const json = auditJson([
    entry({
      rules: ['input type="password"', 'autocomplete="email"'],
      counts: [{ category: 'password', count: 1 }],
    }),
  ]);

  // The things a real page would have put in here if anything ever spread a
  // region or an element into an entry.
  for (const leak of ['http', 'hunter2', '@example.com', 'elementId', 'position']) {
    assert.equal(json.includes(leak), false, `export must not contain ${leak}`);
  }
});

test('the export says in the file what it does and does not contain', () => {
  // The note travels with the file. Somebody deciding whether it is safe to
  // attach to a ticket will not have this repository open.
  const parsed = JSON.parse(auditJson([entry()]));

  assert.match(parsed.note, /No page content/);
  assert.match(parsed.note, /no URLs/);
});

test('timestamps are exported readable, not as epoch numbers', () => {
  const parsed = JSON.parse(auditJson([entry()]));

  assert.equal(parsed.entries[0].at, '2026-09-09T12:00:00.000Z');
});

test('an empty log exports as a valid file rather than nothing', () => {
  const parsed = JSON.parse(auditJson([]));

  assert.deepEqual(parsed.entries, []);
});
