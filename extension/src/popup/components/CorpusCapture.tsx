/**
 * Capturing a real page for the benchmark corpus — development builds only.
 *
 * WHY THE GATE IS THE INTERESTING PART OF THIS FILE
 *
 * Because the first version of this panel was not actually gated.
 * `__SHIELD_DEV__` set `panel.hidden`, which hides a panel that is still
 * entirely present: the markup shipped, the listeners were attached, and
 * anybody with devtools could unhide it and write real field values to a file
 * (DECISIONS.md 183). A capability like this has to be ABSENT from a build
 * somebody installed, not merely out of sight.
 *
 * The React rebuild moves that risk rather than removing it. The old code was
 * a top-level `if (__SHIELD_DEV__) wireCorpusCapture()`, which the define turns
 * into `if (false)` and the bundler deletes along with everything it reached.
 * Here the gate is a ternary in App.tsx around `<CorpusCapture />`, and the
 * import at the top of that file is what has to disappear — which depends on
 * the bundler proving this module is side-effect free rather than on anything
 * written here.
 *
 * So it is not assumed. `tools/check-dev-gate.mjs` runs after every build and
 * greps the output for GATE_SENTINEL below: absent from a normal build, present
 * when SHIELD_DEV=1. The check fails the build in either direction, because a
 * gate that silently stopped working and a gate that silently removed the panel
 * from a dev build are both things we would otherwise find out too late.
 *
 * WHY SAVING TAKES A SECOND CLICK
 *
 * The file carries field values verbatim, because a benchmark fed sanitised
 * input measures a detector on a page that does not exist — Verhoeff runs on
 * the actual digits (DECISIONS.md 171). So nothing is written until the values
 * have been listed and looked at. "Only capture when logged out" is
 * unenforceable; being shown the contents is not.
 */

import { useCallback, useState } from 'react';
import { MSG, type ExtractDomResult } from '../../lib/messages';
import {
  mapExportFilename,
  mapExportJson,
  reviewableValues,
  type ReviewableValue,
} from '../../lib/benchmark/export-map';
import type { DomElement } from '../../lib/types';
import { Card, Disclosure, GhostButton, Title } from './Sheet';

/**
 * The string the build check looks for.
 *
 * Exported so the checker and the panel cannot drift apart — a sentinel the
 * tool spells out separately would keep passing after this text was reworded,
 * which is the same class of failure as the gate that only looked closed.
 */
export const GATE_SENTINEL = 'shield-dev-corpus-capture';

/**
 * Get the content script onto the tab, the way a run does.
 *
 * Shield declares no static content script — it is injected under `activeTab`
 * only when the user points Shield at a page, which is a real privacy property
 * rather than a smaller permission warning. The consequence is that a freshly
 * opened tab has nothing to talk to, and the first version of this panel simply
 * failed there and told the user to reload the page. That advice could never
 * work: there is no declared script for a reload to bring back.
 */
async function ensureReadable(tabId: number): Promise<boolean> {
  const alive = (await chrome.tabs
    .sendMessage(tabId, { type: MSG.PING })
    .catch(() => null)) as { ok?: boolean } | null;
  if (alive?.ok) return true;

  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content-script.js'] });
  } catch {
    // Chrome refuses injection on its own pages outright, and the raw message
    // is internal wording no user should be shown.
    return false;
  }

  const confirmed = (await chrome.tabs
    .sendMessage(tabId, { type: MSG.PING })
    .catch(() => null)) as { ok?: boolean } | null;
  return confirmed?.ok === true;
}

/** What was read, frozen at the moment it was read. */
interface Review {
  elements: DomElement[];
  values: ReviewableValue[];
}

export function CorpusCapture() {
  // Held as a snapshot so the file that gets saved is the page that was
  // reviewed, rather than whatever the page has become since.
  const [review, setReview] = useState<Review | null>(null);
  const [note, setNote] = useState('');
  const [about, setAbout] = useState('');
  const [reading, setReading] = useState(false);

  const clear = useCallback(() => {
    setReview(null);
    setNote('');
  }, []);

  const readPage = useCallback(() => {
    void (async () => {
      clear();
      setReading(true);
      setNote('Reading…');

      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) {
        setReading(false);
        setNote('No active tab.');
        return;
      }

      if (!(await ensureReadable(tab.id))) {
        setReading(false);
        setNote('Shield cannot read this page. Chrome blocks its own pages.');
        return;
      }

      const result = (await chrome.tabs
        .sendMessage(tab.id, { type: MSG.EXTRACT_DOM })
        .catch(() => null)) as ExtractDomResult | null;

      setReading(false);

      if (!result) {
        setNote('The page could not be read.');
        return;
      }

      const values = reviewableValues(result.elements);
      setReview({ elements: result.elements, values });
      setNote(
        `${result.elements.length} elements. ` +
          (values.length === 0
            ? 'No field values at all — nothing here to leak.'
            : `${values.length} value${values.length === 1 ? '' : 's'} would be written. ` +
              'Read them before saving.'),
      );
    })();
  }, [clear]);

  const save = useCallback(() => {
    if (!review) return;

    const json = mapExportJson({ elements: review.elements }, about.trim());
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const link = document.createElement('a');

    link.href = url;
    link.download = mapExportFilename();
    link.click();

    // Revoked once the click has been handled, or the blob is held for the
    // life of the document.
    setTimeout(() => URL.revokeObjectURL(url), 0);

    clear();
    setNote('Saved. Label it from the PAGE, never from the detector output.');
  }, [review, about, clear]);

  return (
    <div data-shield-panel={GATE_SENTINEL}>
      <Card caution>
        <Title aside="dev build">Capture this page</Title>

        {/*
          Styled unlike anything else on this surface on purpose. A dashed amber
          edge is how somebody notices at a glance that the build they are
          looking at can write real field values to disk — which is exactly what
          nobody noticed the first time.
        */}
        <p className="text-warn text-[11px] leading-snug">
          Field values are exported verbatim. Capture only from logged-out or
          synthetic-data pages.
        </p>

        <Disclosure
          label="Read a page for the corpus"
          openLabel="Hide capture"
          // A review belongs to the moment it was made. Closing ends it, so a
          // panel reopened an hour later cannot save an hour-old page.
          onOpenChange={(open) => {
            if (!open) clear();
          }}
        >
          <label htmlFor="corpus-about" className="text-faint mb-1 block text-[11px]">
            What is this page?
          </label>
          <input
            id="corpus-about"
            value={about}
            onChange={(event) => setAbout(event.target.value)}
            placeholder="e.g. state transport booking, logged out"
            className="bg-card-raised border-edge text-bright placeholder:text-faint focus:border-live rounded-control mb-2 w-full border px-2.5 py-2 text-[12px] outline-none"
          />

          <div className="flex gap-2">
            <GhostButton onClick={readPage} disabled={reading}>
              {reading ? 'Reading' : 'Read the page'}
            </GhostButton>
            {review ? (
              <GhostButton onClick={save}>Save {review.values.length} to a file</GhostButton>
            ) : null}
          </div>

          {note ? <p className="text-faint mt-2 text-[11px] leading-snug">{note}</p> : null}

          {review && review.values.length > 0 ? (
            <ul className="border-edge mt-2 max-h-48 space-y-1.5 overflow-y-auto border-t pt-2">
              {review.values.map((entry) => (
                <li key={`${entry.elementId}-${entry.field}`} className="leading-snug">
                  <span className="text-faint block text-[10px]">
                    {entry.elementId} · {entry.field}
                  </span>
                  {/*
                    Page-authored text rendered inside an extension page. React
                    escapes it, which is the one thing the imperative version
                    had to remember to do by hand with textContent.
                  */}
                  <span className="text-bright block text-[12px] break-all">{entry.value}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </Disclosure>
      </Card>
    </div>
  );
}
