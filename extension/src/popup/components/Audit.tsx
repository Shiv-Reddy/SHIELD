/**
 * Every pass Shield has made, as counts.
 *
 * WHY IT IS A LIST OF PASSES AND NOT A TOTAL
 *
 * A single "1,284 things hidden" is a claim about a product. A list of passes
 * with a date, a scope and a sent/not-sent on each is a record somebody can
 * disagree with — they can find the row for the page they were on and check it
 * against what they remember. That is the whole value of the panel, and it is
 * why the scope is spelled out in words on every row: a scan and a run report
 * numbers in the same shape while making claims of very different widths, and a
 * list showing only the numbers would invite comparing them.
 *
 * Read fresh each time the panel opens rather than held in state, for the same
 * reason the payload inspector is: a stale history shown as the current one
 * would be worse than showing none.
 */

import { useCallback, useState } from 'react';
import { auditJson, clearAudit, readAudit, type AuditEntry } from '../../lib/audit';
import { categoryLabel } from './Redactions';
import { ChevronIcon, HistoryIcon } from './Mark';
import { GhostButton, Row } from './Sheet';

/**
 * How many passes the panel lists.
 *
 * The log keeps two hundred; a popup that rendered all of them would be a
 * scroll nobody reaches the bottom of. The export is the complete record — this
 * is the recent history, which is what the panel is actually read for.
 */
const AUDIT_ROWS = 12;

/** The width of the claim one entry makes, in words rather than in jargon. */
function scopeOf(entry: AuditEntry): string {
  if (entry.examined === 'viewport') return 'this screen';
  if (entry.examined === 'document') return 'whole page';
  return 'part of the page';
}

function foundIn(entry: AuditEntry): string {
  if (entry.total === 0) return 'nothing found';
  return entry.counts
    .map(({ category, count }) => `${count} ${categoryLabel(category).toLowerCase()}`)
    .join(', ');
}

export function Audit() {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [open, setOpen] = useState(false);

  const refresh = useCallback(() => {
    void readAudit().then(setEntries);
  }, []);

  /**
   * Hand the log over as a file.
   *
   * A blob URL and an anchor rather than the `downloads` permission: this is
   * one file the user asked for, and asking Chrome for download access across
   * every site in order to save it would be a permission far wider than the
   * feature.
   */
  const save = useCallback(() => {
    void (async () => {
      const json = auditJson(await readAudit());
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      const link = document.createElement('a');

      link.href = url;
      link.download = `shield-audit-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();

      // Revoked once the click has been handled, or the blob is held for the
      // life of the document.
      setTimeout(() => URL.revokeObjectURL(url), 0);
    })();
  }, []);

  const clear = useCallback(() => {
    void clearAudit().then(refresh);
  }, [refresh]);

  const count = entries?.length ?? 0;

  return (
    <>
      <Row
        icon={<HistoryIcon className="size-4" />}
        title="History"
        expanded={open}
        trailing={
          <ChevronIcon
            className={`size-3.5 transition-transform duration-150 ${open ? 'rotate-90' : ''}`}
          />
        }
        onClick={() => {
          const next = !open;
          setOpen(next);
          // Opening is what reads storage. Mounting does not, because most
          // sessions never look at it.
          if (next) refresh();
        }}
      />

      {open ? (
        <div className="px-3.5 py-3">
          <p className="text-faint text-[12px] leading-snug">
            {entries === null
              ? 'Reading…'
              : count === 0
                ? 'Nothing recorded yet.'
                : 'Categories and counts only. No page content, values or web addresses.'}
          </p>

          {entries && count > 0 ? (
            <>
              <ul className="panel-scroll mt-2.5 max-h-60 space-y-3 overflow-y-auto pr-1">
                {entries.slice(0, AUDIT_ROWS).map((entry) => (
                  <li key={`${entry.at}-${entry.kind}`} className="leading-snug">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-bright text-[12.5px]">{foundIn(entry)}</span>
                      {/*
                        Stated per entry rather than inferred from the kind, so
                        the row says the fact instead of relying on the reader
                        knowing that scans never transmit.
                      */}
                      <span
                        className={`shrink-0 text-[11.5px] ${entry.transmitted ? 'text-dim' : 'text-ok'}`}
                      >
                        {entry.transmitted ? 'Sent, redacted' : 'Not sent'}
                      </span>
                    </div>
                    <span className="text-faint block text-[11.5px] tabular-nums">
                      {new Date(entry.at).toLocaleString()}, {scopeOf(entry)}
                    </span>
                  </li>
                ))}
              </ul>

              {count > AUDIT_ROWS ? (
                <p className="text-faint mt-2 text-[11.5px]">
                  Showing {AUDIT_ROWS} of {count}. The file has all of them.
                </p>
              ) : null}

              <div className="mt-3 flex gap-2">
                <GhostButton onClick={save}>Save as a file</GhostButton>
                <GhostButton onClick={clear}>Clear history</GhostButton>
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
