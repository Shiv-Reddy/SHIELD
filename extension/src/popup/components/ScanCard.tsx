/**
 * Scanning the whole page, and what the last scan found.
 *
 * WHY THIS SAYS MORE THAN A NUMBER
 *
 * A scan reports how many screens it looked at and whether it reached the
 * bottom, because those are what the count MEANS. `MAX_SCAN_STOPS` has already
 * bitten a real page — mygov.in, 8744 of 15950px, 55% of the document — and a
 * truncated scan that reports "29 found" and nothing else is a claim about the
 * whole page made from just over half of it. The stop cap is a real limit and
 * the interface says so where the number is, not in a footnote.
 *
 * WHY IT ASKS THE PAGE WHEN THE WORKER HAS NOTHING
 *
 * The findings live in the page; the worker's memory of them does not survive
 * eviction. Without asking the tab directly, reopening the popup after the
 * service worker was evicted would report no protection while the protection
 * was still in place — the worst direction for this particular interface to be
 * wrong in. The tab is asked DIRECTLY rather than through the worker, because
 * the worker would inject the content script to answer, and opening the popup
 * must not be what puts Shield on a page.
 */

import { useCallback, useEffect, useState } from 'react';
import { MSG, type ScanStatusResult } from '../../lib/messages';
import type { ShieldState } from '../../lib/status';
import { categoryLabel } from './Redactions';
import { Card, GhostButton, Row, Title } from './Sheet';
import { ScanIcon } from './Mark';

/** How many findings the page is carrying right now, whatever the worker recalls. */
async function findingsOnPage(): Promise<number> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return 0;

  try {
    const status = (await chrome.tabs.sendMessage(tab.id, {
      type: MSG.SCAN_STATUS,
    })) as ScanStatusResult | undefined;
    return status?.count ?? 0;
  } catch {
    // No content script means no findings.
    return 0;
  }
}

/**
 * What the last scan amounts to, in one sentence.
 *
 * Named by category rather than totalled, because "6 found" says nothing about
 * whether that is six headings or six ID numbers. And the sentence ends with
 * what Shield will DO about them: a scan that only reported would be pointing
 * at an Aadhaar number and leaving it there.
 */
function summarise(scan: NonNullable<ShieldState['scan']>): string {
  const looked = `${scan.stops} screen${scan.stops === 1 ? '' : 's'}`;

  if (scan.total === 0) {
    return scan.truncated
      ? `Nothing found in ${looked} — the scan stopped before the end of the page`
      : `Nothing sensitive found across ${looked}`;
  }

  const breakdown = scan.counts
    .map(({ category, count }) => `${count} ${categoryLabel(category).toLowerCase()}`)
    .join(', ');

  return scan.truncated
    ? `${breakdown} — stopped early · hidden on every run`
    : `${breakdown} across ${looked} · hidden on every run`;
}

export function ScanCard({
  state,
  busy,
  onScan,
  onClear,
}: {
  state: ShieldState;
  busy: boolean;
  onScan: () => void;
  onClear: () => void;
}) {
  const [onPage, setOnPage] = useState(0);

  // Only consulted when the worker has no summary of its own. Asking on every
  // open regardless would message a tab Shield has no other reason to touch.
  const stale = state.scan === null;
  useEffect(() => {
    if (!stale) return;
    void findingsOnPage().then(setOnPage);
  }, [stale]);

  const openRecord = useCallback(() => {
    void chrome.tabs.create({ url: chrome.runtime.getURL('proof/proof.html') });
    window.close();
  }, []);

  const scan = state.scan;
  const carrying = scan?.total ?? onPage;

  return (
    <Card tab={carrying > 0 ? `${carrying} found` : undefined}>
      <Title>Without sending anything</Title>

      <Row
        icon={<ScanIcon className="size-4" />}
        title="Scan the whole page"
        detail={state.scanProgress ? undefined : 'every screen, top to bottom'}
        onClick={onScan}
        disabled={busy}
      />

      {state.scanProgress ? (
        <p className="text-faint mt-1 px-2 text-[11px] tabular-nums">
          screen {state.scanProgress.stop} of {state.scanProgress.total}
        </p>
      ) : null}

      {scan ? (
        <p
          className={`mt-2 text-[11px] leading-snug ${scan.truncated ? 'text-warn' : 'text-dim'}`}
        >
          {summarise(scan)}
        </p>
      ) : onPage > 0 ? (
        <p className="text-dim mt-2 text-[11px] leading-snug">
          {onPage} area{onPage === 1 ? '' : 's'} from the last scan · hidden on every run
        </p>
      ) : null}

      {scan || onPage > 0 ? (
        <div className="mt-2.5 flex gap-2">
          {/*
            The scan record: a redacted picture of every screen examined, kept
            locally. It is the only surface that proves a scan happened rather
            than reporting that it did, and it is offered even when nothing was
            found — "Shield looked at all six screens and there was nothing to
            hide" is a result worth being able to show somebody, not an empty
            state to suppress.
          */}
          <GhostButton onClick={openRecord}>See what it looked at</GhostButton>
          {carrying > 0 ? <GhostButton onClick={onClear}>Clear</GhostButton> : null}
        </div>
      ) : null}
    </Card>
  );
}
