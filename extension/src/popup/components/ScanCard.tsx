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
import { Row } from './Sheet';
import { FramesIcon, OpenIcon, ScanIcon } from './Mark';
import { closeIfPopup } from '../surface';

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
 * What the scan row says beside its title.
 *
 * The breakdown by category is the hero's job — the bars above — so this says
 * only what the bars cannot: how much of the page was looked at, and whether
 * the scan reached the bottom. A truncated scan must not pass for a whole-page
 * result, which is why "stopped early" is said here, where the number is.
 */
function scanDetail(state: ShieldState, onPage: number): string | undefined {
  if (state.scanProgress) {
    return `Screen ${state.scanProgress.stop} of ${state.scanProgress.total}`;
  }
  const scan = state.scan;
  if (scan) {
    if (scan.truncated) return `Stopped after ${scan.stops} screens`;
    return `${scan.stops} screen${scan.stops === 1 ? '' : 's'}`;
  }
  if (onPage > 0) return `${onPage} hidden`;
  return undefined;
}

export function ScanRows({
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
    closeIfPopup();
  }, []);

  const scan = state.scan;
  const carrying = scan?.total ?? onPage;

  return (
    <>
      <Row
        icon={<ScanIcon className="size-4" />}
        title="Scan the whole page"
        detail={scanDetail(state, onPage)}
        onClick={onScan}
        disabled={busy}
      />

      {/*
        The scan record: a redacted picture of every screen examined, kept
        locally. The only surface that proves a scan happened rather than
        reporting that it did, and offered even when nothing was found —
        "Shield looked at every screen and there was nothing to hide" is a
        result worth being able to show somebody.
      */}
      {scan || onPage > 0 ? (
        <Row
          icon={<FramesIcon className="size-4" />}
          title="See what it looked at"
          trailing={<OpenIcon className="size-3.5" />}
          onClick={openRecord}
        />
      ) : null}

      {carrying > 0 ? (
        <Row
          tone="quiet"
          indent
          title="Clear scan results"
          onClick={onClear}
          disabled={busy}
        />
      ) : null}
    </>
  );
}
