/**
 * The run, as it happens.
 *
 * Every agent people already know shows its steps while it works, and a panel
 * that only says "Done" leaves the one thing worth watching — what the AI chose
 * and what Shield kept from it — to the console. Each line comes from the
 * service worker and is written from the redacted view, so this can be on a
 * projector: the AI's choices appear here in the same labels it was shown.
 */

import type { ActivityEntry, ShieldState } from '../../lib/status';
import { STATUS_LABEL } from '../../lib/status';
import { isRunning } from './Masthead';

const MARK: Record<ActivityEntry['kind'], string> = {
  hide: 'bg-bright',
  send: 'bg-dim',
  decide: 'bg-dim',
  act: 'bg-ok',
};

export function Activity({ state }: { state: ShieldState }) {
  const running = isRunning(state.status) && state.status !== 'scanning';
  if (!state.taskQuery || (state.activity.length === 0 && !running)) return null;

  const ownWorkMs = state.timings
    .filter((timing) => timing.stage !== 'network')
    .reduce((sum, timing) => sum + timing.durationMs, 0);
  const failed = state.status === 'error';

  return (
    <section aria-labelledby="run-title" aria-live="polite">
      <h1
        id="run-title"
        className="text-bright text-[17px] leading-snug font-semibold"
        style={{ fontFamily: 'var(--font-display)' }}
      >
        “{state.taskQuery}”
      </h1>

      {state.outcome ? (
        <p
          className={`rounded-card mt-3 border px-3.5 py-3 text-[13px] leading-snug ${
            failed ? 'border-alarm/35 bg-alarm/10' : 'border-ok/30 bg-ok/10'
          }`}
        >
          {state.outcome}
        </p>
      ) : null}

      <ol className="mt-4 space-y-2.5">
        {state.activity.map((entry) => (
          <li key={`${entry.at}-${entry.text}`} className="flex gap-3 text-[12.5px] leading-snug">
            <span
              aria-hidden="true"
              className={`mt-[5px] size-2 shrink-0 rounded-full ${MARK[entry.kind]}`}
            />
            <span className={entry.kind === 'hide' || entry.kind === 'act' ? 'text-bright' : 'text-dim'}>
              {entry.text}
            </span>
          </li>
        ))}
        {running ? (
          <li className="flex gap-3 text-[12.5px] leading-snug">
            <span
              aria-hidden="true"
              className="bg-live mt-[5px] size-2 shrink-0 animate-pulse rounded-full"
            />
            <span className="text-faint">{STATUS_LABEL[state.status]}…</span>
          </li>
        ) : null}
      </ol>

      {!running && ownWorkMs > 0 ? (
        <p className="text-faint mt-3 text-[11.5px] leading-snug">
          Shield's own work on this laptop took {ownWorkMs.toFixed(0)} ms for the last step. The
          AI's reply time is on top of that.
        </p>
      ) : null}
    </section>
  );
}
