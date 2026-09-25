/**
 * The decision, when the user has asked to be asked.
 *
 * WHY THIS SHOWS COUNTS AND NOT THE PAYLOAD
 *
 * The inspector already renders the transmitted payload and is already safe to
 * do so. Rendering it a second time here would mean two renderers of
 * transmitted data, and the second one is where the mistake would live. So this
 * describes the payload — how many elements, how many placeholders, how big the
 * frame, what kinds of thing were hidden, and where it is going — and links to
 * the inspector for anybody who wants the bytes.
 *
 * WHY THE DEFAULT-LOOKING BUTTON IS THE ONE THAT REFUSES
 *
 * Both choices are ordinary buttons and neither is the gradient key control.
 * A consent dialog whose approve button is the big bright one is a dialog
 * designed to be approved, and this feature exists for the person who wants to
 * actually look. The card does not steer.
 *
 * WHAT HAPPENS IF THIS IS NEVER ANSWERED
 *
 * Nothing is sent. The worker times out after a minute and refuses, and a popup
 * closed mid-decision is the same path. Fail-closed is decided in lib/consent.ts
 * and this surface cannot override it — there is no message that means "send
 * anyway".
 */

import { useCallback } from 'react';
import { MSG } from '../../lib/messages';
import type { ConsentRequest } from '../../lib/consent';
import { categoryLabel } from './Redactions';
import { Card, GhostButton, Title } from './Sheet';

export function Consent({
  request,
  onDecided,
}: {
  request: ConsentRequest;
  onDecided: () => void;
}) {
  const decide = useCallback(
    (approved: boolean) => {
      void (async () => {
        try {
          await chrome.runtime.sendMessage({
            type: MSG.CONSENT_DECISION,
            id: request.id,
            approved,
          });
        } catch {
          // No receiver means the worker is gone, which means the run is gone
          // and nothing was sent. Nothing to report and nothing to retry.
        }
        onDecided();
      })();
    },
    [request.id, onDecided],
  );

  return (
    <Card>
      <Title aside="Nothing sent yet">Send this?</Title>

      <dl className="space-y-1.5 text-[12.5px]">
        <Fact label="Page elements" value={String(request.elements)} />
        <Fact label="Values replaced" value={String(request.placeholders)} />
        <Fact
          label="Redacted picture"
          value={request.frameKB > 0 ? `${request.frameKB} KB` : 'none attached'}
        />
        <Fact label="Going to" value={request.endpoint} wrap />
      </dl>

      {request.hidden.length > 0 ? (
        <p className="text-dim border-edge mt-3 border-t pt-2.5 text-[12px] leading-snug">
          Hidden before sending:{' '}
          {request.hidden
            .map(({ category, count }) => `${count} ${categoryLabel(category).toLowerCase()}`)
            .join(', ')}
          .
        </p>
      ) : (
        <p className="text-dim border-edge mt-3 border-t pt-2.5 text-[12px] leading-snug">
          Nothing on this screen was identified as sensitive, so nothing was
          replaced.
        </p>
      )}

      <div className="mt-3 flex gap-2">
        <GhostButton onClick={() => decide(true)}>Send it</GhostButton>
        <GhostButton onClick={() => decide(false)}>Don't send</GhostButton>
        <button
          type="button"
          onClick={() => void chrome.tabs.create({ url: 'sent/sent.html' })}
          className="text-dim hover:text-bright ml-auto self-center text-[12px] underline-offset-2 hover:underline"
        >
          See the exact bytes
        </button>
      </div>

      <p className="text-faint mt-2.5 text-[11.5px] leading-snug">
        No answer within a minute means it is not sent.
      </p>
    </Card>
  );
}

function Fact({ label, value, wrap = false }: { label: string; value: string; wrap?: boolean }) {
  return (
    <div className="flex gap-3">
      <dt className="text-faint shrink-0">{label}</dt>
      <dd className={`text-bright ml-auto text-right ${wrap ? 'break-all' : 'tabular-nums'}`}>
        {value}
      </dd>
    </div>
  );
}
