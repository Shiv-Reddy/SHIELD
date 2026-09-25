/**
 * The compliance report's numbers, from the audit log and nothing else.
 *
 * The report is what an organisation's compliance or security team would read,
 * so every figure on it has to be reproducible from the exported log. Nothing
 * here is estimated, projected or kept as a separate counter — the same rule
 * `auditTotals` follows, for the same reason: a number that cannot be checked
 * against the rows is a claim, and a compliance report made of claims is
 * worse than none.
 *
 * Pure, so the arithmetic is tested without storage.
 */

import type { AuditEntry } from './audit';
import type { SensitiveCategory } from './types';

export const CATEGORY_LABEL: Readonly<Record<SensitiveCategory, string>> = {
  password: 'Passwords',
  name: 'Names',
  email: 'Email addresses',
  phone: 'Phone numbers',
  address: 'Addresses',
  id_number: 'ID and account numbers',
  face: 'Faces',
  other: 'Other private data',
};

export interface CategoryShare {
  category: SensitiveCategory;
  label: string;
  count: number;
  /** Of all items protected, 0 to 1. */
  share: number;
}

export interface DayCount {
  /** Local date, YYYY-MM-DD. */
  day: string;
  items: number;
  passes: number;
}

export interface ComplianceSummary {
  protectedItems: number;
  passes: number;
  runs: number;
  scans: number;
  /** Passes that sent anything to the AI. Every one was redacted and verified first. */
  sentRedacted: number;
  /** Scans, which read the page and send nothing at all. */
  keptLocal: number;
  byCategory: CategoryShare[];
  /** Median time on the device per run, where it was measured. */
  medianRunMs: number | null;
  firstAt: number | null;
  lastAt: number | null;
  /** The last seven days including today, oldest first, zero-filled. */
  lastSevenDays: DayCount[];
}

function localDay(at: number): string {
  const date = new Date(at);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[middle] as number)
    : ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2;
}

export function complianceSummary(entries: readonly AuditEntry[], now: number = Date.now()): ComplianceSummary {
  const tally = new Map<SensitiveCategory, number>();
  let protectedItems = 0;
  let runs = 0;
  let scans = 0;
  let sentRedacted = 0;
  const runDurations: number[] = [];

  for (const entry of entries) {
    protectedItems += entry.total;
    if (entry.kind === 'run') runs += 1;
    else scans += 1;
    if (entry.transmitted) sentRedacted += 1;
    if (entry.kind === 'run' && typeof entry.durationMs === 'number') {
      runDurations.push(entry.durationMs);
    }
    for (const { category, count } of entry.counts) {
      tally.set(category, (tally.get(category) ?? 0) + count);
    }
  }

  const byCategory = [...tally.entries()]
    .map(([category, count]) => ({
      category,
      label: CATEGORY_LABEL[category],
      count,
      share: protectedItems > 0 ? count / protectedItems : 0,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  const days: DayCount[] = [];
  for (let back = 6; back >= 0; back -= 1) {
    days.push({ day: localDay(now - back * 86_400_000), items: 0, passes: 0 });
  }
  const byDay = new Map(days.map((day) => [day.day, day]));
  for (const entry of entries) {
    const bucket = byDay.get(localDay(entry.at));
    if (!bucket) continue;
    bucket.items += entry.total;
    bucket.passes += 1;
  }

  const times = entries.map((entry) => entry.at);

  return {
    protectedItems,
    passes: entries.length,
    runs,
    scans,
    sentRedacted,
    keptLocal: entries.length - sentRedacted,
    byCategory,
    medianRunMs: median(runDurations),
    firstAt: times.length > 0 ? Math.min(...times) : null,
    lastAt: times.length > 0 ? Math.max(...times) : null,
    lastSevenDays: days,
  };
}
