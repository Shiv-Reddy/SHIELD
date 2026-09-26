/**
 * Three running totals, pinned to the bottom of the popup.
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

function Tile({ value, label }: { value: number | null; label: string }) {
  return (
    // Label first in the markup so a screen reader hears "items hidden, 42"
    // rather than a bare number; reversed only visually.
    <div className="flex flex-col-reverse">
      <dt className="text-faint mt-0.5 text-[11.5px] leading-tight">{label}</dt>
      <dd
        className="text-bright m-0 text-[15px] leading-none font-semibold tabular-nums"
        style={{ fontFamily: 'var(--font-display)' }}
      >
        {value === null ? '–' : compact.format(value)}
      </dd>
    </div>
  );
}

/** Said only when it changes what the numbers mean. */
function noteFor(totals: AuditTotals | null): string | null {
  if (totals === null || totals.passes === 0) return 'These count up as Shield works.';
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

  const note = noteFor(totals);

  return (
    <div title="Counted from your history. Nothing here is estimated.">
      <p className="text-faint mt-0 mb-2 text-[11.5px] leading-none">On this laptop so far</p>
      <dl className="m-0 grid grid-cols-3 gap-3">
        <Tile value={totals?.hidden ?? null} label="items hidden" />
        <Tile value={totals?.passes ?? null} label="tasks and scans" />
        <Tile value={totals?.sent ?? null} label="sent to AI, hidden first" />
      </dl>
      {note ? <p className="text-faint mt-2 mb-0 text-[11.5px] leading-snug">{note}</p> : null}
    </div>
  );
}
