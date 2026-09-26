/**
 * Three running totals, at the end of the panel's list once there is anything
 * to count.
 *
 * WHY EVERY NUMBER HERE IS COUNTED AND NONE IS ESTIMATED
 *
 * The obvious reference for a strip like this shows "data saved" and "time
 * saved" beside its blocked count. Those are estimates, and on a product whose
 * entire claim is that it can be checked, one invented figure is the thing a
 * sceptic finds first. So each figure is a sum over the audit log — the history
 * row above has the passes, and the exported file has all of them — and the
 * figures say so in their tooltip. A visible line repeating it under every
 * glance was the one thing on the panel that did not earn its space; it is
 * still shown when the log is empty or full, which is when it changes what the
 * numbers mean.
 *
 * WHY IT LISTENS TO STORAGE RATHER THAN TO THE RUN
 *
 * The worker records a pass fire-and-forget, so the "done" broadcast can land
 * before the write does, and a footer refreshed on that broadcast would lag by
 * one pass exactly when somebody is watching it. Listening for the write itself
 * cannot be early. It also catches "Clear" with no extra wiring.
 */

import { useEffect, useState } from 'react';
import {
  AUDIT_STORAGE_KEY,
  MAX_ENTRIES,
  auditTotals,
  readAudit,
  type AuditEntry,
  type AuditTotals,
} from '../../lib/audit';

const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });

function Tile({ value, label }: { value: number; label: string }) {
  return (
    // Label first in the markup so a screen reader hears "items hidden, 42"
    // rather than a bare number; reversed only visually.
    <div className="flex flex-col-reverse px-3.5 py-3">
      <dt className="text-faint mt-1 text-[12px] leading-tight">{label}</dt>
      <dd
        className="text-bright m-0 text-[16px] leading-none font-semibold tabular-nums"
        style={{ fontFamily: 'var(--font-display)' }}
      >
        {compact.format(value)}
      </dd>
    </div>
  );
}

/** Said only when it changes what the numbers mean. */
function noteFor(totals: AuditTotals): string | null {
  if (totals.capped) return `Counted from your last ${MAX_ENTRIES} runs and scans.`;
  return null;
}

export function Totals() {
  const [totals, setTotals] = useState<AuditTotals | null>(null);

  useEffect(() => {
    void readAudit().then((entries) => setTotals(auditTotals(entries)));

    const onChange = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) => {
      if (area !== 'local' || !(AUDIT_STORAGE_KEY in changes)) return;
      const next = changes[AUDIT_STORAGE_KEY]?.newValue;
      // A removed key — "Clear" — arrives as undefined, and means zero.
      setTotals(auditTotals(Array.isArray(next) ? (next as AuditEntry[]) : []));
    };

    chrome.storage.onChanged.addListener(onChange);
    return () => chrome.storage.onChanged.removeListener(onChange);
  }, []);

  // Three zeros are not information, and on a first open they were the
  // loudest thing in the dock. The strip appears once there is something to
  // count; until then the panel's own empty state says what will happen.
  if (totals === null || totals.passes === 0) return null;
  const note = noteFor(totals);

  return (
    <section title="Counted from your history. Nothing here is estimated.">
      <h2 className="text-faint mb-1.5 px-1 text-[12px] leading-none">On this laptop so far</h2>
      <dl className="bg-card rounded-card divide-edge m-0 grid grid-cols-3 divide-x">
        <Tile value={totals.hidden} label="items hidden" />
        <Tile value={totals.passes} label="tasks and scans" />
        <Tile value={totals.sent} label="sent, redacted" />
      </dl>
      {note ? <p className="text-faint mt-2 mb-0 px-1 text-[12px] leading-snug">{note}</p> : null}
    </section>
  );
}
