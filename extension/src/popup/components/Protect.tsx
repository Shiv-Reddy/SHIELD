/**
 * Marking by hand, and asking before sending.
 *
 * "Watch without acting" used to live here too. It was taken out of the panel
 * because it is a testing switch rather than something a person using Shield
 * needs every day, and the panel is for the everyday. It is not gone: it is on
 * the Settings page, which already had it, so nobody who switched it on can be
 * left with runs that silently never act and no way to turn it off.
 */

import { useCallback, useEffect, useState } from 'react';
import { MSG } from '../../lib/messages';
import { readSettings, setRequireConsent } from '../../lib/settings';
import { Row, SwitchRow } from './Sheet';
import { closeIfPopup } from '../surface';

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

/**
 * The rows for marking an area private, for the page group.
 *
 * Returned as rows rather than a card so that App can place them in the same
 * group as the scan: both are "what Shield does to this page", and one
 * surface for them is what makes the panel read as organised rather than
 * boxed.
 */
export function MarkRows({ onProblem }: { onProblem: (message: string) => void }) {
  const [marks, setMarks] = useState(0);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    void countMarks().then(setMarks);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const beginMarking = useCallback(() => {
    void (async () => {
      setBusy(true);
      const result = (await chrome.runtime.sendMessage({ type: MSG.BEGIN_MANUAL })) as
        | { ok?: boolean; message?: string }
        | undefined;
      setBusy(false);

      if (result?.ok) {
        closeIfPopup();
        return;
      }
      // Closing onto a page where nothing will happen would look like the
      // control did nothing, so the surface stays open and says why instead.
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
    <>
      <Row
        icon={<MarkIcon className="size-4" />}
        title="Mark an area private"
        detail={busy ? 'Opening…' : marks > 0 ? `${marks} marked` : undefined}
        onClick={beginMarking}
        disabled={busy}
      />
      {marks > 0 ? (
        <Row
          tone="quiet"
          indent
          title={`Clear ${marks} marked area${marks === 1 ? '' : 's'}`}
          onClick={clearMarks}
        />
      ) : null}
    </>
  );
}

/**
 * Ask before sending.
 *
 * Off by default, and the wording says what it adds rather than implying it is
 * what keeps the page safe. It is not: the payload is sealed, order-checked
 * and swept before this ever appears, by three mechanisms that ask nobody
 * (DECISIONS.md 240). What this adds is a look before it goes.
 */
export function AskFirstSwitch() {
  const [askFirst, setAskFirst] = useState(false);

  useEffect(() => {
    // Read back from storage rather than assumed, so the switch always shows
    // what the next run will actually do.
    void readSettings().then((settings) => setAskFirst(settings.requireConsent));
  }, []);

  return (
    <SwitchRow
      title="Ask before sending"
      description="See what is about to be sent, at every step. No answer means it is not sent."
      checked={askFirst}
      onChange={(next) => {
        setAskFirst(next);
        void setRequireConsent(next);
      }}
    />
  );
}
