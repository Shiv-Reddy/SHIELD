/**
 * Marking by hand, and observe-only.
 *
 * Both were in the popup this one replaces, and both are restored here rather
 * than dropped, because a redesign that quietly loses features is a
 * regression wearing a new coat. The reasoning behind each is the original's,
 * repeated where it governs behaviour rather than appearance.
 */

import { useCallback, useEffect, useState } from 'react';
import { MSG } from '../../lib/messages';
import { readSettings, setObserveOnly } from '../../lib/settings';
import { Card, GhostButton, Row, Title } from './Sheet';

/** Drawn as a rectangle being enclosed — marking an area, not selecting text. */
function MarkIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 6.5V4.5A1.5 1.5 0 0 1 4.5 3h2M13.5 3h2A1.5 1.5 0 0 1 17 4.5v2M17 13.5v2a1.5 1.5 0 0 1-1.5 1.5h-2M6.5 17h-2A1.5 1.5 0 0 1 3 15.5v-2" />
      <rect x="6.5" y="8" width="7" height="4" rx="0.8" fill="currentColor" stroke="none" />
    </svg>
  );
}

/**
 * How many areas this page is carrying.
 *
 * Asked of the TAB directly, never through the worker, because the worker
 * would inject the content script to answer — and opening the popup must not
 * be what puts Shield on a page. Injection stays tied to the user actually
 * starting a run or choosing to mark. A page with no content script has no
 * marks, and the failed send is exactly that answer.
 */
async function countMarks(): Promise<number> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return 0;
  try {
    const status = (await chrome.tabs.sendMessage(tab.id, { type: MSG.MANUAL_STATUS })) as
      | { count?: number }
      | undefined;
    return status?.count ?? 0;
  } catch {
    return 0;
  }
}

export function Protect({ onProblem }: { onProblem: (message: string) => void }) {
  const [marks, setMarks] = useState(0);
  const [observe, setObserve] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    void countMarks().then(setMarks);
  }, []);

  useEffect(() => {
    refresh();
    // Read back from storage rather than assumed, so the switch always shows
    // what the next run will actually do.
    void readSettings().then((settings) => setObserve(settings.observeOnly));
  }, [refresh]);

  const beginMarking = useCallback(() => {
    void (async () => {
      setBusy(true);
      const result = (await chrome.runtime.sendMessage({ type: MSG.BEGIN_MANUAL })) as
        | { ok?: boolean; message?: string }
        | undefined;
      setBusy(false);

      if (result?.ok) {
        window.close();
        return;
      }
      // Closing onto a page where nothing will happen would look like the
      // control did nothing, so the popup stays open and says why instead.
      onProblem(result?.message ?? 'Shield could not open marking mode on this page.');
    })();
  }, [onProblem]);

  const clearMarks = useCallback(() => {
    void (async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        try {
          await chrome.tabs.sendMessage(tab.id, { type: MSG.CLEAR_MANUAL });
        } catch {
          // No content script means no marks to clear. Nothing to report.
        }
      }
      refresh();
    })();
  }, [refresh]);

  return (
    <Card tab={marks > 0 ? `${marks} marked` : undefined}>
      <Title>Hide something yourself</Title>

      <Row
        icon={<MarkIcon className="size-4" />}
        title="Mark an area private"
        detail={busy ? 'opening' : 'drag over anything'}
        onClick={beginMarking}
        disabled={busy}
      />

      {marks > 0 ? (
        <div className="mt-2">
          <GhostButton onClick={clearMarks}>Clear {marks} marked</GhostButton>
        </div>
      ) : null}

      {/*
        Observe-only is persisted rather than per-run: the runs it exists for
        come in batches — one live site after another — and a switch that reset
        itself each time the popup closed would be off exactly when it was
        being relied on.
      */}
      <label className="border-edge mt-3 flex cursor-pointer items-start gap-2.5 border-t pt-3">
        <input
          type="checkbox"
          checked={observe}
          onChange={(event) => {
            const next = event.target.checked;
            setObserve(next);
            void setObserveOnly(next);
          }}
          className="accent-live mt-0.5 size-3.5 shrink-0"
        />
        <span className="leading-snug">
          <span className="text-bright block text-[12px]">Watch without acting</span>
          <span className="text-faint block text-[11px]">
            Runs everything, then reports the action instead of performing it
          </span>
        </span>
      </label>
    </Card>
  );
}
