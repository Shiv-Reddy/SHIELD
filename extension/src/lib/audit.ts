/**
 * A durable record of what Shield hid, and when — PRD.md FR-26.
 *
 * WHAT THIS IS AND IS NOT
 *
 * `redaction/evidence.ts` answers "what left the machine on the LAST run", in
 * full, as bytes. It is the strongest single claim in the project and it is also
 * one entry deep. This is the other half: every pass, kept, so that "has Shield
 * been protecting this all week?" is answerable at all.
 *
 * They cannot be merged. The evidence panel keeps a whole payload because a
 * sceptic has to be able to read it literally; keeping every payload would be
 * hundreds of kilobytes per run of redacted screenshots sitting in storage
 * forever, which is a liability rather than a feature. This keeps counts.
 *
 * IT IS DESIGNED TO BE EXPORTED, WHICH DECIDES WHAT MAY GO IN IT
 *
 * An export is a file that gets attached to a ticket, pasted into a chat and
 * mailed to somebody. That is not a hypothetical for this project — the element
 * map used to print every label to the console on the reasoning that labels are
 * page structure rather than user input, and a run against a real social feed
 * put a list of other people's names into a buffer of exactly the kind that
 * gets pasted into bug reports.
 *
 * So this holds categories, counts, rule names and timings. No values, no
 * labels, and NO URL — a URL alone identifies a person or an internal system,
 * which is why `ScreenSnapshot.pageUrl` never reaches a payload either. The
 * cost is real and worth stating: entries are told apart by time and shape
 * rather than by page. An audit log that is dangerous to share is one nobody
 * shares, and then it has audited nothing.
 *
 * Rule names are safe by construction rather than by review. They describe a
 * decision without quoting what triggered it — 'input type="password"',
 * 'autocomplete="email"' — and `ocr-regions.ts` carries a test asserting a
 * reason never quotes the text it matched.
 */

import type { SensitiveCategory, SensitiveRegion } from './types';

const STORAGE_KEY = 'auditLog';

/**
 * How many passes are kept.
 *
 * Old entries are dropped rather than the log being allowed to grow without
 * limit. `chrome.storage.local` is finite and shared with the model cache, and
 * a log that eventually breaks storage takes the extension down with it. Two
 * hundred passes is weeks of ordinary use and a few hundred kilobytes.
 */
export const MAX_ENTRIES = 200;

/** How wide the claim behind one entry is. */
export type ExaminedScope =
  /** One viewport — a run. Everything transmitted, and nothing more, was read. */
  | 'viewport'
  /** The whole document — a completed scan. */
  | 'document'
  /** A scan that stopped before the end of the page. */
  | 'document-partial';

export interface AuditEntry {
  at: number;
  kind: 'run' | 'scan';
  examined: ExaminedScope;
  /**
   * True when anything left this machine during the pass.
   *
   * Recorded per entry rather than inferred from `kind`, so the log states the
   * fact instead of relying on the reader knowing that scans do not transmit.
   */
  transmitted: boolean;
  counts: { category: SensitiveCategory; count: number }[];
  total: number;
  /** Which rules fired, deduplicated. Never quotes page content. */
  rules: string[];
  durationMs: number | null;
}

/**
 * Turn the regions of one pass into an entry.
 *
 * The narrowing happens HERE, in one place, rather than at each call site. A
 * `SensitiveRegion` carries an `elementId` and a `position`, which are about
 * this page at this moment and are of no use in a log meant to be shared; a
 * caller free to spread a region into an entry would eventually include them.
 */
export function buildAuditEntry(
  regions: readonly SensitiveRegion[],
  options: {
    kind: AuditEntry['kind'];
    examined: ExaminedScope;
    transmitted: boolean;
    durationMs?: number | null;
  },
): AuditEntry {
  const tally = new Map<SensitiveCategory, number>();
  const rules = new Set<string>();

  for (const region of regions) {
    tally.set(region.category, (tally.get(region.category) ?? 0) + 1);
    rules.add(region.reason);
  }

  return {
    at: Date.now(),
    kind: options.kind,
    examined: options.examined,
    transmitted: options.transmitted,
    counts: [...tally.entries()]
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category)),
    total: regions.length,
    rules: [...rules].sort(),
    durationMs: options.durationMs ?? null,
  };
}

/**
 * Add an entry, newest first, dropping the oldest past the cap.
 *
 * Pure, so the trimming is testable without storage. Newest first because that
 * is the order it is read in — a log whose most recent entry is at the bottom
 * of a two-hundred-item list is a log nobody scrolls to.
 */
export function appendCapped(
  entries: readonly AuditEntry[],
  entry: AuditEntry,
  cap: number = MAX_ENTRIES,
): AuditEntry[] {
  return [entry, ...entries].slice(0, Math.max(1, cap));
}

/** The export, as a string. Pure, so what it contains is testable. */
export function auditJson(entries: readonly AuditEntry[]): string {
  return JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      note:
        'Categories, counts, rule names and timings only. No page content, no ' +
        'field values, and no URLs — this file is meant to be shareable.',
      entries: entries.map((entry) => ({
        ...entry,
        at: new Date(entry.at).toISOString(),
      })),
    },
    null,
    2,
  );
}

/** Record one pass. Never throws — evidence must not break the thing it records. */
export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    const entries = await readAudit();
    await chrome.storage.local.set({ [STORAGE_KEY]: appendCapped(entries, entry) });
  } catch (error) {
    // Same reasoning as `recordTransmission`: this is evidence, not protection,
    // and failing to write it must never interfere with the pass it describes.
    console.warn('[shield] could not record the audit entry', error);
  }
}

export async function readAudit(): Promise<AuditEntry[]> {
  try {
    const stored = await chrome.storage.local.get([STORAGE_KEY]);
    const value = stored[STORAGE_KEY];
    return Array.isArray(value) ? (value as AuditEntry[]) : [];
  } catch (error) {
    console.warn('[shield] could not read the audit log', error);
    return [];
  }
}

export async function clearAudit(): Promise<void> {
  try {
    await chrome.storage.local.remove([STORAGE_KEY]);
  } catch (error) {
    console.warn('[shield] could not clear the audit log', error);
  }
}
