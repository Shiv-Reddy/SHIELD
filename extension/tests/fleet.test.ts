import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { AuditEntry } from '../src/lib/audit';
import { buildFleetReport, fleetBase, policyFrom, toFleetEntry } from '../src/lib/fleet';

const entry: AuditEntry = {
  at: 1_790_000_000_000,
  kind: 'run',
  examined: 'viewport',
  transmitted: true,
  counts: [{ category: 'name', count: 10 }],
  total: 10,
  rules: ['text in image — identity document, covered whole'],
  durationMs: 131,
};

// The server refuses any field outside this list (server/fleet.py). The two
// sides must agree, and this is the half that runs in the extension's tests.
const SERVER_FIELDS = ['at', 'counts', 'durationMs', 'examined', 'kind', 'total', 'transmitted'];

test('a report entry carries counts and nothing else', () => {
  assert.deepEqual(Object.keys(toFleetEntry(entry)).sort(), SERVER_FIELDS);
});

test('the rules that fired never leave the laptop', () => {
  const report = buildFleetReport({ deviceId: 'abcd1234', deviceName: 'KYC 1', team: 'KYC' }, [entry]);
  assert.equal(JSON.stringify(report).includes('identity document'), false);
});

test('names are capped and never empty', () => {
  const report = buildFleetReport({ deviceId: 'abcd1234', deviceName: '', team: 'x'.repeat(80) }, []);
  assert.equal(report.device_name, 'Laptop');
  assert.equal(report.team.length, 40);
});

test('the dashboard lives beside /analyze on the same server', () => {
  assert.equal(fleetBase('http://127.0.0.1:8787/analyze'), 'http://127.0.0.1:8787');
  assert.equal(fleetBase('https://shield.bank.example/api/analyze/'), 'https://shield.bank.example/api');
});

test('a policy is read only when it is well formed', () => {
  assert.deepEqual(policyFrom({ requireConsent: true }), { requireConsent: true });
  assert.equal(policyFrom({ requireConsent: 'yes' }), null);
  assert.equal(policyFrom(null), null);
});
