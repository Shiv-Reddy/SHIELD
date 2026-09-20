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
import { Card, Disclosure, GhostButton, Title } from './Sheet';

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
    <Card>
      <Title>What has been hidden</Title>

      <Disclosure
        label="Show every pass"
        openLabel="Hide history"
        // Opening is what reads storage. Mounting the popup does not, because
        // the panel is shut on open and most sessions never look at it.
        onOpenChange={(open) => {
          if (open) refresh();
        }}
      >
        <p className="text-faint text-[11px] leading-snug">
          {entries === null
            ? 'Reading…'
            : count === 0
              ? 'Nothing recorded yet.'
              : `${count} pass${count === 1 ? '' : 'es'} recorded. ` +
                'Categories, counts and rule names only — no page content.'}
        </p>

        {entries && count > 0 ? (
          <>
            <ul className="border-edge mt-2 max-h-56 space-y-2 overflow-y-auto border-t pt-2">
              {entries.slice(0, AUDIT_ROWS).map((entry) => (
                <li key={`${entry.at}-${entry.kind}`} className="leading-snug">
                  <span className="text-faint block text-[10px] tabular-nums">
                    {new Date(entry.at).toLocaleString()}
                  </span>
                  <span className="text-bright block text-[12px]">{foundIn(entry)}</span>
                  <span className="text-dim block text-[11px]">
                    {scopeOf(entry)} ·{' '}
                    {/*
                      Stated per entry rather than inferred from the kind, so
                      the row says the fact instead of relying on the reader
                      knowing that scans never transmit.
                    */}
                    <span className={entry.transmitted ? 'text-warn' : 'text-ok'}>
                      {entry.transmitted ? 'sent' : 'not sent'}
                    </span>
                  </span>
                </li>
              ))}
            </ul>

            {count > AUDIT_ROWS ? (
              <p className="text-faint mt-1.5 text-[10px]">
                Showing {AUDIT_ROWS} of {count}. The file has all of them.
              </p>
            ) : null}

            <div className="mt-2.5 flex gap-2">
              <GhostButton onClick={save}>Save as a file</GhostButton>
              <GhostButton onClick={clear}>Clear</GhostButton>
            </div>
          </>
        ) : null}
      </Disclosure>
    </Card>
  );
}
